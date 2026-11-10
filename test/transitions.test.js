import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/hydroquebec/feed.js';
import { eventsOf } from '../src/hydroquebec/schedule.js';
import {
  END_CATCH_UP_MS,
  MEMORY_MS,
  TRANSITIONS,
  TransitionTracker,
} from '../src/hydroquebec/transitions.js';
import { WINTER, fixtureText } from './helpers/feed.js';

const { events } = parseFeed(JSON.parse(fixtureText(WINTER)));
const cpcd = eventsOf(events, 'CPC-D');
const OFFER = 'cpc-d';
const names = (found) =>
  found.map(({ transition, event }) => `${transition} ${event.start.toISOString()}`);

function walk(tracker, list, times, lead = 120) {
  return times.flatMap((time) => tracker.detect(list, new Date(time), lead, OFFER));
}

test('the peaks published before an offer is first seen are known, not announced', () => {
  const tracker = new TransitionTracker();
  assert.deepEqual(tracker.detect(cpcd, new Date('2025-01-07T12:00:00-05:00'), 120, OFFER), []);
  assert.deepEqual(tracker.detect(cpcd, new Date('2025-01-07T12:01:00-05:00'), 120, OFFER), []);
});

test('a peak published later is announced once', () => {
  const tracker = new TransitionTracker();
  const first = cpcd.slice(0, 2);
  tracker.detect(first, new Date('2025-01-07T12:00:00-05:00'), 120, OFFER);
  const found = tracker.detect(cpcd, new Date('2025-01-07T12:15:00-05:00'), 120, OFFER);
  assert.deepEqual(
    found.map((f) => f.transition),
    [TRANSITIONS.ANNOUNCED, TRANSITIONS.ANNOUNCED, TRANSITIONS.ANNOUNCED],
  );
  assert.deepEqual(tracker.detect(cpcd, new Date('2025-01-07T12:30:00-05:00'), 120, OFFER), []);
});

test('one event per transition, minute after minute, in order', () => {
  const tracker = new TransitionTracker();
  const minutes = [];
  for (
    let t = Date.parse('2025-01-08T03:00:00-05:00');
    t <= Date.parse('2025-01-08T10:00:00-05:00');
    t += 60000
  ) {
    minutes.push(t);
  }
  const found = walk(tracker, cpcd, minutes);
  assert.deepEqual(names(found), [
    'preheat 2025-01-08T11:00:00.000Z',
    'started 2025-01-08T11:00:00.000Z',
    'ended 2025-01-08T11:00:00.000Z',
  ]);
});

test('the memory survives a restart: nothing fires twice', () => {
  const tracker = new TransitionTracker();
  walk(tracker, cpcd, ['2025-01-08T03:00:00-05:00', '2025-01-08T06:00:30-05:00']);
  const restarted = new TransitionTracker(JSON.parse(JSON.stringify(tracker.toJSON())));
  assert.deepEqual(restarted.detect(cpcd, new Date('2025-01-08T06:02:00-05:00'), 120, OFFER), []);
  assert.deepEqual(
    names(restarted.detect(cpcd, new Date('2025-01-08T09:00:30-05:00'), 120, OFFER)),
    ['ended 2025-01-08T11:00:00.000Z'],
  );
});

test('a start seen too late is not pretended, and then no end follows', () => {
  const tracker = new TransitionTracker();
  tracker.detect(cpcd, new Date('2025-01-07T12:00:00-05:00'), 120, OFFER);
  // Down from 03:00 to 07:30: the peak started 90 minutes ago.
  assert.deepEqual(tracker.detect(cpcd, new Date('2025-01-08T07:30:00-05:00'), 120, OFFER), []);
  assert.deepEqual(tracker.detect(cpcd, new Date('2025-01-08T09:01:00-05:00'), 120, OFFER), []);
});

test('a start within the grace period still fires, and its end follows even late', () => {
  const tracker = new TransitionTracker();
  tracker.detect(cpcd, new Date('2025-01-07T12:00:00-05:00'), 120, OFFER);
  assert.deepEqual(names(tracker.detect(cpcd, new Date('2025-01-08T06:05:00-05:00'), 120, OFFER)), [
    'started 2025-01-08T11:00:00.000Z',
  ]);
  // Back two hours after the end: the scene waiting to restore the heating runs.
  assert.deepEqual(names(tracker.detect(cpcd, new Date('2025-01-08T11:00:00-05:00'), 120, OFFER)), [
    'ended 2025-01-08T11:00:00.000Z',
  ]);
  const late = new TransitionTracker();
  late.detect(cpcd, new Date('2025-01-08T06:00:00-05:00'), 120, OFFER);
  const tooLate = new Date(cpcd[0].end.getTime() + END_CATCH_UP_MS + 60000);
  assert.ok(
    !late.detect(cpcd, tooLate, 120, OFFER).some((f) => f.transition === TRANSITIONS.ENDED),
  );
});

test('a peak announced inside its pre-heat window fires the pre-heat at once', () => {
  const tracker = new TransitionTracker();
  tracker.detect([], new Date('2025-01-08T00:00:00-05:00'), 120, OFFER);
  const found = tracker.detect(cpcd.slice(0, 1), new Date('2025-01-08T05:10:00-05:00'), 120, OFFER);
  assert.deepEqual(
    found.map((f) => f.transition),
    [TRANSITIONS.ANNOUNCED, TRANSITIONS.PREHEAT],
  );
});

test('no pre-heat transition when the lead time is 0', () => {
  const tracker = new TransitionTracker();
  const found = walk(tracker, cpcd, ['2025-01-08T03:00:00-05:00', '2025-01-08T06:00:30-05:00'], 0);
  assert.deepEqual(
    found.map((f) => f.transition),
    [TRANSITIONS.STARTED],
  );
});

test('an undelivered transition can be fired again', () => {
  const tracker = new TransitionTracker();
  walk(tracker, cpcd, ['2025-01-08T03:00:00-05:00']);
  const [started] = tracker.detect(cpcd, new Date('2025-01-08T06:00:30-05:00'), 120, OFFER);
  tracker.unmark(started.transition, started.event);
  assert.deepEqual(names(tracker.detect(cpcd, new Date('2025-01-08T06:01:30-05:00'), 120, OFFER)), [
    'started 2025-01-08T11:00:00.000Z',
  ]);
});

test('old peaks are forgotten after a few days', () => {
  const tracker = new TransitionTracker();
  walk(tracker, cpcd, ['2025-01-08T03:00:00-05:00', '2025-01-08T06:00:30-05:00']);
  const before = Object.keys(tracker.fired).length;
  assert.equal(tracker.prune(new Date('2025-01-08T12:00:00-05:00')), false);
  const later = new Date(cpcd[0].end.getTime() + MEMORY_MS + 1);
  assert.equal(tracker.prune(later), true);
  assert.ok(Object.keys(tracker.fired).length < before);
});

test('a corrupted memory is ignored, not fatal', () => {
  const tracker = new TransitionTracker({ fired: { 'a|b': 'x', 'c|d': 12 }, offers: [1, 'cpc-d'] });
  assert.deepEqual(tracker.toJSON(), { offers: ['cpc-d'], fired: { 'c|d': 12 } });
  assert.deepEqual(new TransitionTracker(null).toJSON(), { offers: [], fired: {} });
});
