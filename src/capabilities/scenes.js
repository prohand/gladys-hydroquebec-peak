// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// Four triggers, declared in the manifest `scene_triggers`, one per moment of
// a peak (see src/hydroquebec/transitions.js for when each one fires):
//
//   peak_announced   Hydro-Québec published a new peak — usually the day
//                    before: "notify me", "plan the dishwasher for tonight"
//   preheat_started  the pre-heat window opens (the lead time of the
//                    configuration before the start): heat the house a bit
//                    more, fill the water heater
//   peak_started     the peak begins: lower the thermostats, cut the water
//                    heater, pause the car charger
//   peak_ended       the peak is over: put everything back
//
// Every event carries the same flat data: the device of the offer and the
// slot (the two filters of the scene card), the offer code, the start and the
// end in Québec time, the duration — and, for the pre-heat, its lead time.
// Only declared keys are sent: the core would drop any other.
//
// One scene action, `refresh_now`: read the feed now, and hand the scene where
// the offer stands — the answer to "is there a peak right now?" inside a
// scene started by something else (a presence, a time).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { followedOffers } from '../config.js';
import { idsOf } from '../devices/peakEvents.js';
import { snapshot } from '../hydroquebec/schedule.js';
import { TRANSITIONS } from '../hydroquebec/transitions.js';
import { quebecDateTime } from '../time.js';

const logger = createLogger({ name: 'scenes' });

/** Keys of the manifest `scene_triggers`. Never renamed: scenes store them. */
export const SCENE_TRIGGERS = {
  PEAK_ANNOUNCED: 'peak_announced',
  PREHEAT_STARTED: 'preheat_started',
  PEAK_STARTED: 'peak_started',
  PEAK_ENDED: 'peak_ended',
};

/** Which trigger each transition fires. */
export const TRIGGER_OF = {
  [TRANSITIONS.ANNOUNCED]: SCENE_TRIGGERS.PEAK_ANNOUNCED,
  [TRANSITIONS.PREHEAT]: SCENE_TRIGGERS.PREHEAT_STARTED,
  [TRANSITIONS.STARTED]: SCENE_TRIGGERS.PEAK_STARTED,
  [TRANSITIONS.ENDED]: SCENE_TRIGGERS.PEAK_ENDED,
};

/** Every trigger key the code fires (see test/manifest.test.js). */
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

/**
 * The scene event of one transition of one peak.
 *
 * @param {object} gladys
 * @param {string} code the followed offer
 * @param {string} transition one of TRANSITIONS
 * @param {object} event the peak
 * @param {object} config
 * @returns {{ key: string, data: Record<string, string | number> }}
 */
export function sceneEventOf(gladys, code, transition, event, config) {
  const data = {
    device: idsOf(gladys, code).device,
    slot: event.slot,
    offer: code,
    start: quebecDateTime(event.start),
    end: quebecDateTime(event.end),
    duration_minutes: Math.round((event.end - event.start) / 60000),
  };
  if (transition === TRANSITIONS.PREHEAT) {
    data.lead_minutes = config.preheat_minutes;
  }
  return { key: TRIGGER_OF[transition], data };
}

/** Keys of the manifest `scene_actions`. Same rule. */
export const SCENE_ACTION_KEYS = {
  REFRESH_NOW: 'refresh_now',
};

/**
 * The offer a scene action is about: the chosen device's, else the first
 * followed one.
 */
function offerFor(engine, deviceExternalId) {
  const offers = followedOffers(engine.config);
  if (deviceExternalId) {
    const chosen = offers.find((code) => idsOf(engine.gladys, code).device === deviceExternalId);
    if (chosen) {
      return chosen;
    }
    logger.warn(`refresh_now: ${deviceExternalId} is not a followed offer, using ${offers[0]}`);
  }
  return offers[0] ?? null;
}

export const SCENE_ACTIONS = {
  /**
   * Read the feed now and return where the offer stands. A failed read with
   * a feed already in memory answers from that copy (a peak does not move
   * because the network blinked); without any copy, the action fails.
   */
  async [SCENE_ACTION_KEYS.REFRESH_NOW](engine, { fields = {} } = {}) {
    try {
      await engine.refreshNow();
    } catch (err) {
      if (!engine.feed) {
        throw err;
      }
      logger.warn(`refresh_now answers from the last copy: ${err.message}`);
    }
    const code = offerFor(engine, fields.device);
    if (!code) {
      throw new Error('No Hydro-Québec offer is followed: choose one in the configuration');
    }
    const snap = snapshot(engine.feed.events, code, engine.now(), engine.config.preheat_minutes);
    return {
      offer: code,
      peak_in_progress: snap.peakActive,
      preheat_in_progress: snap.preheatActive,
      next_peak_start: snap.next ? quebecDateTime(snap.next.start) : '',
      minutes_until_next_peak: snap.minutesUntilNext,
    };
  },
};
