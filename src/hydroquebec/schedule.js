// -----------------------------------------------------------------------------
// Where an offer stands at a given moment.
//
// Everything a device shows is a function of the published events AND of the
// clock: a peak starts without anything new being published. `snapshot` is
// that function, pure, so the minute timer, the poll, the scene action and the
// widget all see the same answer for the same instant.
// -----------------------------------------------------------------------------

import { sameOffer } from './offers.js';
import { SLOTS } from './feed.js';
import { addDays, quebecDay } from '../time.js';

const MINUTE_MS = 60 * 1000;

/** The longest wait the "minutes until the next peak" feature can show: a week. */
export const MAX_MINUTES_UNTIL = 7 * 24 * 60;

/** What that feature shows when no peak is announced. */
export const NO_PEAK_MINUTES = -1;

/**
 * The events of one offer.
 * @param {object[]} events parsed feed events, sorted by start
 * @param {string} code
 */
export function eventsOf(events, code) {
  return events.filter((event) => sameOffer(event.offer, code));
}

/**
 * The state of an offer at `now`.
 *
 * @param {object[]} events parsed feed events (any offer), sorted by start
 * @param {string} code the offer
 * @param {Date} now
 * @param {number} preheatMinutes the lead time before a peak, 0 = no pre-heat
 */
export function snapshot(events, code, now, preheatMinutes) {
  const mine = eventsOf(events, code);
  // A peak runs from its start included to its end excluded: at 09:00 the
  // 06:00–09:00 peak is over and the house can take its load back.
  const current = mine.find((event) => event.start <= now && now < event.end) ?? null;
  const next = mine.find((event) => event.start > now) ?? null;
  const upcoming = mine.filter((event) => event.end > now);

  const leadMs = preheatMinutes * MINUTE_MS;
  // Pre-heating is the time BEFORE a peak: during one, the next peak's
  // window is not "pre-heat" — the house is shedding load, not storing it.
  const preheat = !current && next && leadMs > 0 && next.start - now <= leadMs ? next : null;

  const today = quebecDay(now);
  const tomorrow = addDays(today, 1);
  const on = (day, slot) =>
    mine.some((event) => event.slot === slot && quebecDay(event.start) === day);

  let minutesUntilNext = NO_PEAK_MINUTES;
  if (current) {
    minutesUntilNext = 0;
  } else if (next) {
    minutesUntilNext = Math.min(MAX_MINUTES_UNTIL, Math.ceil((next.start - now) / MINUTE_MS));
  }

  return {
    code,
    current,
    next,
    preheat,
    upcoming,
    peakActive: Boolean(current),
    preheatActive: Boolean(preheat),
    todayAm: on(today, SLOTS.AM),
    todayPm: on(today, SLOTS.PM),
    tomorrowAm: on(tomorrow, SLOTS.AM),
    tomorrowPm: on(tomorrow, SLOTS.PM),
    minutesUntilNext,
    // The peak a person cares about: the one running, else the next one.
    focus: current ?? next,
  };
}
