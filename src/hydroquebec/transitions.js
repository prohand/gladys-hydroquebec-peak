// -----------------------------------------------------------------------------
// The moments a scene can hang on: a peak is announced, its pre-heat window
// opens, it starts, it ends.
//
// One event per transition and per peak, never one per minute: what was
// already fired is remembered (and saved, see src/store.js), so a restart, a
// re-read of the feed or two timers firing in the same minute repeat nothing.
//
// A transition is fired when it is SEEN, within a grace period: an
// integration that was down at 16:00 and comes back at 16:03 still says "the
// peak started", but one coming back at 18:30 does not pretend it just did —
// a scene lowering the heating would act two hours late on a peak half over.
// There are two exceptions, both about the end of a peak:
//   - a peak announced late (inside its pre-heat window, or once started) has
//     its earlier transitions fired at once — they happened "now" as far as
//     the house is concerned;
//   - `peak_ended` follows every `peak_started` it can, even late, up to
//     END_CATCH_UP_MS: the scene that lowered the heating is the one waiting to
//     put it back.
//
// The first time an offer is seen (a fresh install, an offer just ticked), the
// peaks already published are taken as known, silently: they were not "just
// announced", and a notification scene would otherwise send the whole list at
// once. Their pre-heat, start and end transitions fire as usual.
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;

/** How late a preheat / start transition may still be fired. */
export const GRACE_MS = 10 * MINUTE_MS;

/** How late a `peak_ended` may still be fired after its `peak_started`. */
export const END_CATCH_UP_MS = 12 * 60 * MINUTE_MS;

/** How long a past peak stays in memory, so a re-published one is not new. */
export const MEMORY_MS = 3 * 24 * 60 * MINUTE_MS;

/** The transitions, in the order they happen to one peak. */
export const TRANSITIONS = {
  ANNOUNCED: 'announced',
  PREHEAT: 'preheat',
  STARTED: 'started',
  ENDED: 'ended',
};

export class TransitionTracker {
  /**
   * @param {object} [memory] what `toJSON` returned, from the store
   */
  constructor(memory = {}) {
    /** @type {Record<string, number>} `<transition>|<event id>` -> end of the peak, ms */
    this.fired = {};
    /** @type {string[]} the offers whose published peaks are known (see above) */
    this.offers = Array.isArray(memory?.offers)
      ? memory.offers.filter((o) => typeof o === 'string')
      : [];
    if (memory && typeof memory.fired === 'object' && memory.fired !== null) {
      for (const [key, end] of Object.entries(memory.fired)) {
        if (Number.isFinite(end)) {
          this.fired[key] = end;
        }
      }
    }
  }

  /** The memory to save. */
  toJSON() {
    return { offers: [...this.offers], fired: { ...this.fired } };
  }

  has(transition, event) {
    return `${transition}|${event.id}` in this.fired;
  }

  mark(transition, event) {
    this.fired[`${transition}|${event.id}`] = event.end.getTime();
  }

  /** A transition that could not be delivered: fire it again next time. */
  unmark(transition, event) {
    delete this.fired[`${transition}|${event.id}`];
  }

  /** Forget the peaks long over. Resolves whether anything was dropped. */
  prune(now) {
    let dropped = false;
    for (const [key, end] of Object.entries(this.fired)) {
      if (now.getTime() - end > MEMORY_MS) {
        delete this.fired[key];
        dropped = true;
      }
    }
    return dropped;
  }

  /**
   * The transitions of one offer's events that happened by `now` and were not
   * fired yet, marked as fired, in the order they happened.
   *
   * @param {object[]} events the offer's events (see eventsOf)
   * @param {Date} now
   * @param {number} preheatMinutes
   * @param {string} offer the key of the offer (see offerKey)
   * @returns {Array<{ transition: string, event: object }>}
   */
  detect(events, now, preheatMinutes, offer) {
    const found = [];
    const known = this.offers.includes(offer);
    if (!known) {
      this.offers.push(offer);
    }
    const at = now.getTime();
    const leadMs = preheatMinutes * MINUTE_MS;
    for (const event of events) {
      const start = event.start.getTime();
      const end = event.end.getTime();
      let announcedNow = false;

      if (end > at && !this.has(TRANSITIONS.ANNOUNCED, event)) {
        this.mark(TRANSITIONS.ANNOUNCED, event);
        if (known) {
          found.push({ transition: TRANSITIONS.ANNOUNCED, event });
          announcedNow = true;
        }
      }

      const preheatStart = start - leadMs;
      if (
        leadMs > 0 &&
        at >= preheatStart &&
        at < start &&
        !this.has(TRANSITIONS.PREHEAT, event) &&
        (announcedNow || at - preheatStart <= GRACE_MS)
      ) {
        this.mark(TRANSITIONS.PREHEAT, event);
        found.push({ transition: TRANSITIONS.PREHEAT, event });
      }

      if (
        at >= start &&
        at < end &&
        !this.has(TRANSITIONS.STARTED, event) &&
        (announcedNow || at - start <= GRACE_MS)
      ) {
        this.mark(TRANSITIONS.STARTED, event);
        found.push({ transition: TRANSITIONS.STARTED, event });
      }

      if (
        at >= end &&
        at - end <= END_CATCH_UP_MS &&
        this.has(TRANSITIONS.STARTED, event) &&
        !this.has(TRANSITIONS.ENDED, event)
      ) {
        this.mark(TRANSITIONS.ENDED, event);
        found.push({ transition: TRANSITIONS.ENDED, event });
      }
    }
    return found;
  }
}
