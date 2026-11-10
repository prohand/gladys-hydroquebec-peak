import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/hydroquebec/feed.js';
import { NO_PEAK_MINUTES, snapshot } from '../src/hydroquebec/schedule.js';
import { WINTER, fixtureText } from './helpers/feed.js';

const { events } = parseFeed(JSON.parse(fixtureText(WINTER)));
const at = (date, code = 'CPC-D', lead = 120) => snapshot(events, code, new Date(date), lead);

test('the day before: tomorrow morning and evening are announced', () => {
  const snap = at('2025-01-07T20:00:00-05:00');
  assert.equal(snap.peakActive, false);
  assert.equal(snap.todayAm || snap.todayPm, false);
  assert.equal(snap.tomorrowAm, true);
  assert.equal(snap.tomorrowPm, true);
  assert.equal(snap.minutesUntilNext, 10 * 60);
  assert.equal(snap.upcoming.length, 5);
});

test('days follow the Québec clock, not UTC', () => {
  // 20:30 in Québec is already the 8th at 01:30 UTC: "today" is still the 7th.
  const snap = at('2025-01-07T20:30:00-05:00');
  assert.equal(snap.todayAm, false);
  assert.equal(snap.tomorrowAm, true);
  // 00:01 in Québec: the peaks of the 8th are today's now.
  const after = at('2025-01-08T00:01:00-05:00');
  assert.equal(after.todayAm, true);
  assert.equal(after.todayPm, true);
  assert.equal(after.tomorrowAm, false);
});

test('the pre-heat window opens the lead time before the start', () => {
  assert.equal(at('2025-01-08T03:59:00-05:00').preheatActive, false);
  const snap = at('2025-01-08T04:00:00-05:00');
  assert.equal(snap.preheatActive, true);
  assert.equal(snap.minutesUntilNext, 120);
  assert.equal(at('2025-01-08T04:00:00-05:00', 'CPC-D', 0).preheatActive, false, '0 = no pre-heat');
});

test('during a peak: active, no pre-heat, countdown at 0', () => {
  const snap = at('2025-01-08T07:00:00-05:00');
  assert.equal(snap.peakActive, true);
  assert.equal(snap.preheatActive, false);
  assert.equal(snap.minutesUntilNext, 0);
  assert.equal(snap.focus, snap.current);
});

test('a peak ends at its end: 09:00 is no longer the 06:00–09:00 peak', () => {
  const snap = at('2025-01-08T09:00:00-05:00');
  assert.equal(snap.peakActive, false);
  assert.equal(snap.next.start.toISOString(), '2025-01-08T21:00:00.000Z');
});

test('another offer only sees its own peaks', () => {
  const snap = at('2025-01-08T07:00:00-05:00', 'TPC-GPC');
  assert.equal(snap.peakActive, false);
  assert.equal(snap.todayPm, true);
  assert.equal(snap.todayAm, false);
});

test('nothing announced: the countdown says -1', () => {
  const snap = at('2025-02-01T12:00:00-05:00');
  assert.equal(snap.next, null);
  assert.equal(snap.focus, null);
  assert.equal(snap.minutesUntilNext, NO_PEAK_MINUTES);
});
