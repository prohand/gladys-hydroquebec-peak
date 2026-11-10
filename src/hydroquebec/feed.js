// -----------------------------------------------------------------------------
// The Hydro-Québec peak events feed.
//
// Hydro-Québec publishes its winter peak events as open data (licence
// CC BY-NC 4.0, no account, no key). Two doors open on the same data:
//
//   - the Opendatasoft dataset `evenements-pointe` on donnees.hydroquebec.com,
//     whose API is rate limited (429) and meant for occasional queries;
//   - the static file below, which the dataset is built from: a few kilobytes
//     behind a CDN, answering a conditional request (`If-None-Match`) with a
//     bodyless 304 while nothing changed.
//
// This module reads the static file: polling it every few minutes costs
// Hydro-Québec next to nothing. Its shape:
//
//   {
//     "offresDisponibles": ["Credit hivernal Residentiel (CPC-D)", "OEA", …],
//     "derniereExecution": ["2026-11-10 04:21:24"],        (naive local time)
//     "evenements": [{ "offre", "dateDebut", "dateFin",     (ISO, with offset)
//                      "plageHoraire" (AM|PM), "duree" (PT03H00MS),
//                      "secteurClient" (Residentiel|Affaires) }]
//   }
//
// The file is served as text/plain: the body is parsed here, never trusted to
// a content type.
// -----------------------------------------------------------------------------

import { offerCode, offerKey } from './offers.js';

export const FEED_URL =
  'https://donnees.solutions.hydroquebec.com/donnees-ouvertes/data/json/pointeshivernales.json';

/** The public page of the dataset, linked from the configuration screen. */
export const DATASET_URL = 'https://donnees.hydroquebec.com/explore/dataset/evenements-pointe/';

/** A request that has not answered after this long is abandoned. */
export const REQUEST_TIMEOUT_MS = 30 * 1000;

/** The time slots of an event, as published. */
export const SLOTS = { AM: 'AM', PM: 'PM' };

/** Why the feed could not be read: a short code a scene or a test can rely on. */
export const FEED_ERRORS = {
  NETWORK: 'NETWORK',
  HTTP: 'HTTP',
  PARSE: 'PARSE',
};

export class FeedError extends Error {
  /**
   * @param {string} code one of FEED_ERRORS
   * @param {string} message
   * @param {object} [details]
   * @param {number} [details.status] the HTTP status, for FEED_ERRORS.HTTP
   */
  constructor(code, message, { status } = {}) {
    super(message);
    this.name = 'FeedError';
    this.code = code;
    this.status = status;
  }
}

/**
 * The identity of an event: its offer and its two ends. Hydro-Québec gives
 * none, and the same peak published twice must be recognized as one — the
 * `peak_announced` trigger fires once per identity.
 */
export function eventId({ code, start, end }) {
  return `${offerKey(code)}|${start.toISOString()}|${end.toISOString()}`;
}

function parseDate(value) {
  // An ISO date without an offset would be read in the container's time zone
  // (UTC by default), five hours off in Québec: such a date is refused.
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/.test(value.trim())) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseEvent(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const start = parseDate(item.dateDebut);
  const end = parseDate(item.dateFin);
  const offer = typeof item.offre === 'string' ? item.offre.trim() : '';
  if (!offer || !start || !end || end <= start) {
    return null;
  }
  const code = offerCode(offer);
  const slot =
    item.plageHoraire === SLOTS.AM || item.plageHoraire === SLOTS.PM ? item.plageHoraire : null;
  const event = {
    offer,
    code,
    start,
    end,
    // Hydro-Québec says AM or PM; derived from the start when it says neither.
    slot: slot ?? (Number(quebecHour(start)) < 12 ? SLOTS.AM : SLOTS.PM),
    sector: typeof item.secteurClient === 'string' ? item.secteurClient : null,
  };
  return { ...event, id: eventId(event) };
}

const HOUR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  hour: '2-digit',
  hourCycle: 'h23',
});

function quebecHour(date) {
  return HOUR.format(date);
}

/**
 * Parse the feed document.
 *
 * A malformed event is skipped and counted, not fatal: one bad line must not
 * hide the peaks of every other offer. A document without its two arrays is
 * fatal — it is not the feed.
 *
 * @param {unknown} data the parsed JSON
 * @returns {{ offers: string[], events: object[], skipped: number, lastExecution: string | null }}
 *   events sorted by start, duplicates removed
 */
export function parseFeed(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new FeedError(FEED_ERRORS.PARSE, 'The feed is not a JSON object');
  }
  if (!Array.isArray(data.offresDisponibles) || !Array.isArray(data.evenements)) {
    throw new FeedError(FEED_ERRORS.PARSE, 'The feed has no offresDisponibles / evenements arrays');
  }
  const offers = data.offresDisponibles
    .filter((offer) => typeof offer === 'string' && offer.trim() !== '')
    .map((offer) => offer.trim());
  const byId = new Map();
  let skipped = 0;
  for (const item of data.evenements) {
    const event = parseEvent(item);
    if (!event) {
      skipped += 1;
    } else if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }
  const events = [...byId.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  const lastExecution =
    Array.isArray(data.derniereExecution) && typeof data.derniereExecution[0] === 'string'
      ? data.derniereExecution[0]
      : null;
  return { offers, events, skipped, lastExecution };
}

/**
 * Reads the feed, revalidating the last copy with its ETag.
 */
export class FeedClient {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] injected by the tests
   * @param {string} [options.url]
   * @param {number} [options.timeoutMs]
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, url = FEED_URL, timeoutMs } = {}) {
    this.fetch = fetchImpl;
    this.url = url;
    this.timeoutMs = timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.etag = null;
    /** @type {ReturnType<typeof parseFeed> | null} */
    this.feed = null;
  }

  /**
   * The current feed: the one in memory when the server says it did not
   * change (304), the new one otherwise.
   *
   * @returns {Promise<{ feed: ReturnType<typeof parseFeed>, changed: boolean }>}
   * @throws {FeedError}
   */
  async read() {
    const headers = { accept: 'application/json, text/plain;q=0.9' };
    if (this.etag && this.feed) {
      headers['if-none-match'] = this.etag;
    }
    let response;
    try {
      response = await this.fetch(this.url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new FeedError(
        FEED_ERRORS.NETWORK,
        `Hydro-Québec open data unreachable: ${err.message}`,
      );
    }
    if (response.status === 304 && this.feed) {
      return { feed: this.feed, changed: false };
    }
    if (!response.ok) {
      throw new FeedError(
        FEED_ERRORS.HTTP,
        `Hydro-Québec open data answered HTTP ${response.status}`,
        {
          status: response.status,
        },
      );
    }
    let data;
    try {
      data = JSON.parse(await response.text());
    } catch {
      throw new FeedError(FEED_ERRORS.PARSE, 'The feed is not valid JSON');
    }
    const feed = parseFeed(data);
    this.feed = feed;
    this.etag = response.headers?.get?.('etag') ?? null;
    return { feed, changed: true };
  }
}
