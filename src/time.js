// -----------------------------------------------------------------------------
// Québec time.
//
// A peak is "this morning" or "tomorrow evening" on Québec's clock, whatever
// the clock of the container (UTC by default). Every day boundary and every
// time shown to the user is computed here, in America/Toronto — the zone of
// the Hydro-Québec dataset, which Montréal and Québec City share.
//
// Dates are built from `formatToParts` with numeric parts only: a Node built
// with small-icu has no locale data and would silently print en-US dates for
// any other locale, but numeric parts and time zones work in every build. The
// words (weekday names) are ours, in the four languages of the interface.
// -----------------------------------------------------------------------------

import { pick } from './i18n.js';

export const QUEBEC_TIME_ZONE = 'America/Toronto';

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: QUEBEC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  // `hour12: false` can print midnight as 24:00 on some ICU versions.
  hourCycle: 'h23',
});

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** `{ year, month, day, hour, minute, weekday }` of a moment, in Québec. */
export function quebecParts(date) {
  const parts = {};
  for (const { type, value } of PARTS.formatToParts(date)) {
    parts[type] = value;
  }
  return { ...parts, weekday: WEEKDAYS[parts.weekday] ?? 0 };
}

/** The Québec calendar day of a moment, `YYYY-MM-DD`. */
export function quebecDay(date) {
  const { year, month, day } = quebecParts(date);
  return `${year}-${month}-${day}`;
}

/** `YYYY-MM-DD` shifted by `days` (calendar arithmetic, no time zone involved). */
export function addDays(day, days) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** `HH:MM` in Québec. */
export function quebecTime(date) {
  const { hour, minute } = quebecParts(date);
  return `${hour}:${minute}`;
}

/** `YYYY-MM-DD HH:MM` in Québec: the wording of the text features. */
export function quebecDateTime(date) {
  return `${quebecDay(date)} ${quebecTime(date)}`;
}

/** `YYYY-MM-DD HH:MM–HH:MM`: a peak, in one line, language neutral. */
export function formatSpan({ start, end }) {
  const sameDay = quebecDay(start) === quebecDay(end);
  return `${quebecDateTime(start)}–${sameDay ? quebecTime(end) : quebecDateTime(end)}`;
}

const WEEKDAY_NAMES = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  de: ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'],
  es: ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.'],
};

/**
 * A peak for a person: `Mon 12/15, 06:00–09:00` (en), `lun. 15/12, 06:00–09:00`
 * (fr, de with dots, es).
 *
 * @param {{ start: Date, end: Date }} event
 * @param {string} language
 */
export function describeSpan({ start, end }, language) {
  const { month, day, weekday } = quebecParts(start);
  const weekdayName = pick(language, WEEKDAY_NAMES)[weekday];
  const date = pick(language, {
    en: `${month}/${day}`,
    fr: `${day}/${month}`,
    de: `${day}.${month}.`,
    es: `${day}/${month}`,
  });
  return `${weekdayName} ${date}, ${quebecTime(start)}–${quebecTime(end)}`;
}
