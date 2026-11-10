// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module holds the defaults (they
// MUST match the manifest `default` values, see test/manifest.test.js) and
// turns the received object into one the rest of the code can trust: typed,
// bounded, never `undefined`.
// -----------------------------------------------------------------------------

import { KNOWN_OFFERS, offerCode, offerKey } from './hydroquebec/offers.js';

/** Bounds of the pre-heat lead time, in minutes (manifest `min` / `max`). */
export const PREHEAT_BOUNDS = { min: 0, max: 360 };

/**
 * Bounds of the refresh interval, in seconds (manifest `min` / `max`). The
 * feed is a small file behind a CDN, revalidated with an ETag, and Hydro-Québec
 * publishes an event hours ahead: every 15 minutes is plenty, 5 is the floor.
 */
export const REFRESH_BOUNDS = { min: 300, max: 3600 };

export const DEFAULT_CONFIG = {
  // multi_select: the offer codes ticked by the user. No manifest default: an
  // array default is not part of the store grammar, and following an offer
  // the user is not enrolled in would fire scenes for nothing.
  offers: [],
  // Free text: the offers the select does not list, separated by commas.
  other_offers: '',
  // Hydro-Québec advises pre-heating about two hours before a peak.
  preheat_minutes: 120,
  poll_frequency: 900,
};

function bounded(value, { min, max }, fallback) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/** A multi_select arrives as an array; an older form may send one string. */
function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value.split(',');
  }
  return [];
}

/**
 * Every offer the user follows, as canonical codes, without duplicates, in
 * the order the user gave them: the ticked ones first, then the typed ones.
 *
 * @param {object} config a normalized config
 * @returns {string[]}
 */
export function followedOffers(config) {
  const codes = [];
  for (const raw of [...config.offers, ...asList(config.other_offers)]) {
    const key = offerKey(raw);
    if (!key || codes.some((code) => offerKey(code) === key)) {
      continue;
    }
    // A known offer typed by hand (`cpc-d`) keeps its canonical spelling, so
    // its device is the one the select would have created.
    const known = KNOWN_OFFERS.find((offer) => offerKey(offer.code) === key);
    codes.push(known ? known.code : offerCode(raw));
  }
  return codes;
}

/**
 * Merge the user config with the defaults, with forced types.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    offers: asList(raw.offers).map(String),
    other_offers: typeof raw.other_offers === 'string' ? raw.other_offers : '',
    preheat_minutes: bounded(raw.preheat_minutes, PREHEAT_BOUNDS, DEFAULT_CONFIG.preheat_minutes),
    poll_frequency: bounded(raw.poll_frequency, REFRESH_BOUNDS, DEFAULT_CONFIG.poll_frequency),
  };
}
