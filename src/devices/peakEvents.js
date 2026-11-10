// -----------------------------------------------------------------------------
// Device type: PEAK EVENTS of one Hydro-Québec offer.
//
// One virtual device per followed offer — a household enrolled in the Winter
// Credit Option follows CPC-D, one on Rate Flex D follows TPC-DPC, and a
// business may follow several. Its features are read-only and say where the
// offer stands now (see src/hydroquebec/schedule.js):
//
//   peak-active          a peak is running                         0 / 1
//   preheat-active       the pre-heat window before a peak is open 0 / 1
//   today-am / today-pm  a morning / evening peak is announced today
//   tomorrow-am / -pm    the same, tomorrow
//   minutes-until-next   minutes until the next peak starts: 0 during a peak,
//                        -1 when none is announced
//   next-peak            the running or next peak, `YYYY-MM-DD HH:MM–HH:MM`
//                        in Québec time, `—` when none is announced
//
// The flags are what scenes are written against ("a peak is announced
// tomorrow morning: lower the water heater tonight"); the triggers of
// src/capabilities/scenes.js say WHEN each of them flips.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { offerSlug } from '../hydroquebec/offers.js';
import { MAX_MINUTES_UNTIL, NO_PEAK_MINUTES } from '../hydroquebec/schedule.js';
import { formatSpan } from '../time.js';

/** The "type" part of the external ids. Never renamed: Gladys keys devices on it. */
export const DEVICE_TYPE = 'offer';

/** Feature keys. Never renamed either: the history and the scenes follow them. */
export const FEATURES = {
  PEAK_ACTIVE: 'peak-active',
  PREHEAT_ACTIVE: 'preheat-active',
  TODAY_AM: 'today-am',
  TODAY_PM: 'today-pm',
  TOMORROW_AM: 'tomorrow-am',
  TOMORROW_PM: 'tomorrow-pm',
  MINUTES_UNTIL_NEXT: 'minutes-until-next',
  NEXT_PEAK: 'next-peak',
};

/** What the next-peak text says when no peak is announced. */
export const NO_PEAK_TEXT = '—';

/** The external ids of the device of an offer. */
export function idsOf(gladys, code) {
  return gladys.externalIds(DEVICE_TYPE, offerSlug(code));
}

// A read-only on/off flag. A `switch` the user cannot toggle is how Gladys
// shows a yes/no state: the dashboard draws it as a badge, and a scene can
// test it. `min`/`max` are NOT NULL in the core, flags included.
function flag(ids, key, name, keepHistory) {
  return {
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.SWITCH,
    type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
    min: 0,
    max: 1,
    read_only: true,
    has_feedback: false,
    keep_history: keepHistory,
  };
}

/**
 * The discovery payload of the device of an offer.
 * @param {object} gladys the SDK instance
 * @param {string} code the offer code
 */
export function buildDevice(gladys, code) {
  const ids = idsOf(gladys, code);
  return {
    name: `Hydro-Québec ${code}`,
    external_id: ids.device,
    // Polled once a minute (the slowest pace Gladys knows): the poll only
    // re-reads the feed at the configured interval (see createPoller), but a
    // minute is what keeps the countdown and the flags on time.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      // The two that draw the winter on a chart keep their history.
      flag(ids, FEATURES.PEAK_ACTIVE, 'Peak in progress', true),
      flag(ids, FEATURES.PREHEAT_ACTIVE, 'Pre-heat window', true),
      flag(ids, FEATURES.TODAY_AM, 'Peak this morning', false),
      flag(ids, FEATURES.TODAY_PM, 'Peak this evening', false),
      flag(ids, FEATURES.TOMORROW_AM, 'Peak tomorrow morning', false),
      flag(ids, FEATURES.TOMORROW_PM, 'Peak tomorrow evening', false),
      {
        name: 'Minutes until next peak',
        external_id: ids.feature(FEATURES.MINUTES_UNTIL_NEXT),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.MINUTES,
        min: NO_PEAK_MINUTES,
        max: MAX_MINUTES_UNTIL,
        read_only: true,
        has_feedback: false,
        // A countdown is not a measure: its history is a saw blade.
        keep_history: false,
      },
      {
        name: 'Next peak',
        external_id: ids.feature(FEATURES.NEXT_PEAK),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    ],
  };
}

/**
 * The states of the device of an offer, from its snapshot.
 * @param {object} gladys
 * @param {ReturnType<import('../hydroquebec/schedule.js').snapshot>} snap
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function statesOf(gladys, snap) {
  const ids = idsOf(gladys, snap.code);
  const bit = (value) => (value ? 1 : 0);
  return [
    { device_feature_external_id: ids.feature(FEATURES.PEAK_ACTIVE), state: bit(snap.peakActive) },
    {
      device_feature_external_id: ids.feature(FEATURES.PREHEAT_ACTIVE),
      state: bit(snap.preheatActive),
    },
    { device_feature_external_id: ids.feature(FEATURES.TODAY_AM), state: bit(snap.todayAm) },
    { device_feature_external_id: ids.feature(FEATURES.TODAY_PM), state: bit(snap.todayPm) },
    { device_feature_external_id: ids.feature(FEATURES.TOMORROW_AM), state: bit(snap.tomorrowAm) },
    { device_feature_external_id: ids.feature(FEATURES.TOMORROW_PM), state: bit(snap.tomorrowPm) },
    {
      device_feature_external_id: ids.feature(FEATURES.MINUTES_UNTIL_NEXT),
      state: snap.minutesUntilNext,
    },
    {
      device_feature_external_id: ids.feature(FEATURES.NEXT_PEAK),
      text: snap.focus ? formatSpan(snap.focus) : NO_PEAK_TEXT,
    },
  ];
}
