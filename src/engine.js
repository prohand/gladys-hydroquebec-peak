// -----------------------------------------------------------------------------
// The engine: reads the feed, works out where every followed offer stands,
// and tells Gladys — states, scene events, widget nudges, connection status.
//
// Two clocks drive it:
//   - reading the feed, at the interval the user chose (15 minutes by
//     default): Hydro-Québec publishes a peak hours ahead, nothing is gained
//     by asking more often;
//   - evaluating, every minute, on the minute: a peak starts at 06:00 without
//     anything new being published, and a scene lowering the heating must not
//     wait for the next read to learn it. Gladys' own poll (once a minute per
//     device) also ticks the engine; the engine's timer covers the minutes no
//     device was created yet, and keeps the transitions on the minute.
//
// Ticks never overlap: each one waits for the previous one, so a slow read
// cannot let two evaluations fire the same transition twice.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { followedOffers } from './config.js';
import { createPoller } from './devices/index.js';
import { statesOf } from './devices/peakEvents.js';
import { FeedClient } from './hydroquebec/feed.js';
import { eventsOf, snapshot } from './hydroquebec/schedule.js';
import { TransitionTracker } from './hydroquebec/transitions.js';
import { offerKey } from './hydroquebec/offers.js';
import { sceneEventOf } from './capabilities/scenes.js';
import { refreshWidgets } from './capabilities/widget.js';
import { JsonStore } from './store.js';
import { localize, pick } from './i18n.js';

const logger = createLogger({ name: 'engine' });

/**
 * An unchanged state is re-sent this often, so a flag that stays at 0 all
 * summer still looks like a live sensor, without one history row a minute.
 */
export const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

/** The timer fires this long after the minute, once the peak has started. */
const TICK_OFFSET_MS = 1000;

export class PeakEngine {
  /**
   * @param {object} options
   * @param {object} options.gladys the SDK instance
   * @param {FeedClient} [options.client]
   * @param {{ load(): Promise<object>, save(data: object): Promise<void> }} [options.store]
   * @param {() => Date} [options.now] the clock, so tests can travel
   */
  constructor({
    gladys,
    client = new FeedClient(),
    store = new JsonStore(),
    now = () => new Date(),
  }) {
    this.gladys = gladys;
    this.client = client;
    this.store = store;
    this.now = now;
    this.poller = createPoller({ now: () => this.now().getTime() });
    this.tracker = new TransitionTracker();
    this.config = null;
    this.lastError = null;
    this.lastReadAt = null;
    this.reportedStatus = null;
    this.queue = Promise.resolve();
    this.timer = null;
    this.loaded = false;
  }

  /** Load the memory of the transitions already fired. Idempotent. */
  async load() {
    if (!this.loaded) {
      this.tracker = new TransitionTracker(await this.store.load());
      this.loaded = true;
    }
  }

  /** A new configuration: re-read the feed at the next tick. */
  setConfig(config) {
    this.config = config;
    this.poller.reset();
  }

  /** The parsed feed, `null` until the first successful read. */
  get feed() {
    return this.client.feed;
  }

  /** Every followed offer's snapshot at `now`. */
  snapshots(now = this.now()) {
    const events = this.feed?.events ?? [];
    return followedOffers(this.config).map((code) =>
      snapshot(events, code, now, this.config.preheat_minutes),
    );
  }

  /**
   * Read the feed when a read is due (or `force`d).
   * @param {object} [options]
   * @param {boolean} [options.force] read now, and throw if the read fails
   * @returns {Promise<{ read: boolean, changed: boolean }>}
   */
  async refresh({ force = false } = {}) {
    if (!force && !this.poller.due(this.config)) {
      return { read: false, changed: false };
    }
    try {
      const { feed, changed } = await this.client.read();
      this.poller.done();
      this.lastError = null;
      this.lastReadAt = this.now();
      if (changed) {
        logger.info(
          `Feed read: ${feed.offers.length} offers, ${feed.events.length} events` +
            (feed.skipped ? ` (${feed.skipped} malformed, skipped)` : ''),
        );
      } else {
        logger.debug('Feed unchanged (304)');
      }
      return { read: true, changed };
    } catch (err) {
      this.lastError = err;
      logger.warn(`Feed read failed: ${err.message}`);
      if (force) {
        throw err;
      }
      return { read: false, changed: false };
    } finally {
      await this.reportStatus();
    }
  }

  /**
   * Publish where every followed offer stands, and fire the transitions.
   * @returns {Promise<number>} the number of scene events published
   */
  async evaluate() {
    if (!this.feed) {
      return 0;
    }
    const now = this.now();
    const snapshots = this.snapshots(now);
    await this.gladys.publishChangedStates(
      snapshots.flatMap((snap) => statesOf(this.gladys, snap)),
      { heartbeat: STATE_HEARTBEAT_MS },
    );

    let published = 0;
    let memoryChanged = this.tracker.prune(now);
    for (const code of followedOffers(this.config)) {
      memoryChanged ||= !this.tracker.offers.includes(offerKey(code));
      const transitions = this.tracker.detect(
        eventsOf(this.feed.events, code),
        now,
        this.config.preheat_minutes,
        offerKey(code),
      );
      for (const { transition, event } of transitions) {
        memoryChanged = true;
        const { key, data } = sceneEventOf(this.gladys, code, transition, event, this.config);
        try {
          await this.gladys.publishSceneEvent(key, data);
          published += 1;
          logger.info(`Scene event ${key} for ${code}, peak ${data.start}–${data.end}`);
        } catch (err) {
          // Not fired: forgotten, so the next tick tries again (within the
          // grace period of the transition).
          this.tracker.unmark(transition, event);
          logger.warn(`Scene event ${key} for ${code} not delivered: ${err.message}`);
        }
      }
    }
    if (memoryChanged) {
      await this.store.save(this.tracker.toJSON());
    }
    if (published > 0) {
      refreshWidgets(this.gladys);
    }
    return published;
  }

  /**
   * One beat: read the feed if due, then evaluate. Never overlaps another
   * beat, never throws (a failed beat is logged, the next one retries).
   */
  tick() {
    const run = async () => {
      if (!this.config) {
        return;
      }
      await this.load();
      const { changed } = await this.refresh();
      await this.evaluate();
      if (changed) {
        refreshWidgets(this.gladys);
      }
    };
    this.queue = this.queue.then(run).catch((err) => {
      logger.error('Evaluation failed', err);
    });
    return this.queue;
  }

  /**
   * Read the feed NOW and evaluate, waiting for any running beat first.
   * Throws when the read fails, for the callers that report it (the scene
   * action, the actions, the widget button).
   */
  async refreshNow() {
    let failure = null;
    const run = async () => {
      await this.load();
      try {
        await this.refresh({ force: true });
      } catch (err) {
        failure = err;
        return;
      }
      await this.evaluate();
      refreshWidgets(this.gladys);
    };
    this.queue = this.queue.then(run).catch((err) => {
      logger.error('Evaluation failed', err);
    });
    await this.queue;
    if (failure) {
      throw failure;
    }
  }

  /** Tick every minute, on the minute. */
  startTimer() {
    this.stopTimer();
    const schedule = () => {
      const now = this.now().getTime();
      const delay = 60 * 1000 - (now % (60 * 1000)) + TICK_OFFSET_MS;
      this.timer = setTimeout(async () => {
        await this.tick();
        if (this.timer) {
          schedule();
        }
      }, delay);
      this.timer.unref?.();
    };
    schedule();
  }

  stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * The application status of the Configuration screen: told only when it
   * changes, so a feed that stays down does not write it every minute.
   */
  async reportStatus() {
    const offers = followedOffers(this.config ?? { offers: [], other_offers: '' });
    let status;
    if (offers.length === 0) {
      status = { connected: false, message: NO_OFFER_MESSAGE };
    } else if (this.lastError) {
      const reason = String(this.lastError.message).slice(0, 160);
      status = {
        connected: false,
        message: localize((language) =>
          pick(language, {
            en: `Hydro-Québec open data unreachable, retrying: ${reason}`,
            fr: `Données ouvertes d'Hydro-Québec injoignables, nouvel essai à venir : ${reason}`,
            de: `Offene Daten von Hydro-Québec nicht erreichbar, neuer Versuch folgt: ${reason}`,
            es: `Datos abiertos de Hydro-Québec inaccesibles, se volverá a intentar: ${reason}`,
          }),
        ),
      };
    } else {
      status = { connected: true };
    }
    const fingerprint = JSON.stringify(status);
    if (fingerprint === this.reportedStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.reportedStatus = fingerprint;
    } catch (err) {
      logger.warn(`Connection status not reported: ${err.message}`);
    }
  }

  /** Forget the reported status: say it again after a reconnection. */
  resetStatus() {
    this.reportedStatus = null;
  }
}

/** What the Configuration screen says while no offer is followed. */
export const NO_OFFER_MESSAGE = {
  en: 'Choose the Hydro-Québec offer you are enrolled in, in the configuration below.',
  fr: "Choisissez l'offre Hydro-Québec à laquelle vous êtes inscrit, dans la configuration ci-dessous.",
  de: 'Wähle unten in der Konfiguration das Hydro-Québec-Angebot, bei dem du angemeldet bist.',
  es: 'Elija abajo, en la configuración, la oferta de Hydro-Québec en la que está inscrito.',
};
