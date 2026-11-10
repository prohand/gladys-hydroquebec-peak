// Test helpers: the recorded feeds, and a fake `fetch` serving them.

import { readFileSync } from 'node:fs';

/** A recorded feed, as the raw text Hydro-Québec serves. */
export function fixtureText(name) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

/** The winter of 2025 (real CPC-D, CPC-G, TPC-DPC, TPC-GPC and OEA peaks). */
export const WINTER = 'feed-winter-2025.json';

/** The feed as it was on 2026-11-10: summer business events, the season's offer list. */
export const NOVEMBER = 'feed-2026-11-10.json';

/**
 * A fake `fetch`: serves `body` with an ETag, answers 304 to a matching
 * If-None-Match, and records every request.
 *
 * @param {object} [options]
 * @param {string} [options.body]
 * @param {number} [options.status]
 * @param {Error} [options.error] thrown instead of answering
 */
export function fakeFetch({ body = fixtureText(WINTER), status = 200, error } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, headers: { ...init.headers } });
    if (fetch.error ?? error) {
      throw fetch.error ?? error;
    }
    const etag = `"${fetch.body.length}"`;
    if (init.headers?.['if-none-match'] === etag) {
      return new Response(null, { status: 304, headers: { etag } });
    }
    return new Response(fetch.status === 200 ? fetch.body : 'error', {
      status: fetch.status,
      headers: { etag, 'content-type': 'text/plain' },
    });
  };
  fetch.body = body;
  fetch.status = status;
  fetch.error = null;
  fetch.calls = calls;
  return fetch;
}

/** A clock the test moves by hand. */
export function fakeClock(start) {
  const clock = { now: new Date(start) };
  clock.set = (date) => {
    clock.now = new Date(date);
  };
  clock.read = () => clock.now;
  return clock;
}
