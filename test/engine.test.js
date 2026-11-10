import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../src/devices/peakEvents.js';
import { NO_OFFER_MESSAGE } from '../src/engine.js';
import { MemoryStore } from '../src/store.js';
import { setup } from './helpers/engine.js';
import { fakeFetch } from './helpers/feed.js';

const feature = (key, offer = 'cpc-d') => `ext:test-integration:offer:${offer}:${key}`;
const keys = (gladys) => gladys.fake.sceneEvents.map((event) => event.key);

test('a winter day: states on the minute, one scene event per transition', async () => {
  const { gladys, clock, engine } = await setup({ at: '2025-01-08T03:58:30-05:00' });
  await engine.tick();
  assert.equal(gladys.fake.lastState(feature(FEATURES.TODAY_AM)), 1);
  assert.equal(gladys.fake.lastState(feature(FEATURES.PREHEAT_ACTIVE)), 0);
  assert.deepEqual(keys(gladys), [], 'the peaks known at install are not announced');

  clock.set('2025-01-08T04:00:01-05:00');
  await engine.tick();
  assert.equal(gladys.fake.lastState(feature(FEATURES.PREHEAT_ACTIVE)), 1);

  clock.set('2025-01-08T06:00:01-05:00');
  await engine.tick();
  await engine.tick();
  assert.equal(gladys.fake.lastState(feature(FEATURES.PEAK_ACTIVE)), 1);
  assert.equal(gladys.fake.lastState(feature(FEATURES.PREHEAT_ACTIVE)), 0);

  clock.set('2025-01-08T09:00:01-05:00');
  await engine.tick();
  assert.equal(gladys.fake.lastState(feature(FEATURES.PEAK_ACTIVE)), 0);
  assert.deepEqual(keys(gladys), ['preheat_started', 'peak_started', 'peak_ended']);
  assert.ok(gladys.fake.widgetRefreshes.includes('peaks'), 'the widget is nudged');
});

test('the feed is read at the configured interval, not every tick', async () => {
  const { clock, engine, fetch } = await setup({
    config: { offers: ['CPC-D'], poll_frequency: 900 },
  });
  await engine.tick();
  clock.set(clock.now.getTime() + 60_000);
  await engine.tick();
  assert.equal(fetch.calls.length, 1);
  clock.set(clock.now.getTime() + 900_000);
  await engine.tick();
  assert.equal(fetch.calls.length, 2);
  assert.ok(fetch.calls[1].headers['if-none-match'], 'revalidated with the ETag');
});

test('a new peak published while running is announced', async () => {
  const fetch = fakeFetch();
  const winter = JSON.parse(fetch.body);
  const later = winter.evenements.pop();
  fetch.body = JSON.stringify(winter);
  const { gladys, clock, engine } = await setup({ fetch });
  await engine.tick();

  winter.evenements.push(later);
  fetch.body = JSON.stringify(winter);
  clock.set(clock.now.getTime() + 900_000);
  await engine.tick();
  assert.deepEqual(keys(gladys), ['peak_announced']);
  assert.equal(gladys.fake.sceneEvents[0].data.start, '2025-01-22 06:00');
});

test('the memory is saved, so a restart repeats nothing', async () => {
  const store = new MemoryStore();
  const first = await setup({ at: '2025-01-08T05:59:00-05:00', store });
  await first.engine.tick();
  first.clock.set('2025-01-08T06:00:01-05:00');
  await first.engine.tick();
  assert.deepEqual(keys(first.gladys), ['peak_started']);

  const second = await setup({ at: '2025-01-08T06:01:01-05:00', store });
  await second.engine.tick();
  assert.deepEqual(keys(second.gladys), []);
  second.clock.set('2025-01-08T09:00:01-05:00');
  await second.engine.tick();
  assert.deepEqual(keys(second.gladys), ['peak_ended']);
});

test('an undelivered scene event is retried at the next tick', async (t) => {
  const { gladys, clock, engine } = await setup({ at: '2025-01-08T05:59:00-05:00' });
  await engine.tick();
  const original = gladys.publishSceneEvent.bind(gladys);
  let fail = true;
  t.mock.method(gladys, 'publishSceneEvent', async (key, data) => {
    if (fail) {
      fail = false;
      throw new Error('socket closed');
    }
    return original(key, data);
  });
  clock.set('2025-01-08T06:00:01-05:00');
  await engine.tick();
  assert.deepEqual(keys(gladys), []);
  clock.set('2025-01-08T06:01:01-05:00');
  await engine.tick();
  assert.deepEqual(keys(gladys), ['peak_started']);
});

test('the connection status follows the feed, and is told only when it changes', async () => {
  const fetch = fakeFetch({ status: 500 });
  const { gladys, clock, engine } = await setup({ fetch });
  await engine.tick();
  clock.set(clock.now.getTime() + 900_000);
  await engine.tick();
  assert.equal(gladys.fake.connectionStatuses.length, 1);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /injoignables/);

  fetch.status = 200;
  clock.set(clock.now.getTime() + 900_000);
  await engine.tick();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(gladys.fake.connectionStatuses.length, 2);
});

test('no offer followed: nothing published, the status says what to do', async () => {
  const { gladys, engine } = await setup({ config: {} });
  await engine.tick();
  assert.equal(gladys.fake.states.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.deepEqual(gladys.fake.connectionStatus.message, NO_OFFER_MESSAGE);
});

test('refreshNow throws when the feed cannot be read', async () => {
  const { engine } = await setup({ fetch: fakeFetch({ status: 503 }) });
  await assert.rejects(engine.refreshNow(), /HTTP 503/);
});

test('the timer ticks on the minute', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { engine, fetch } = await setup({ at: '2025-01-07T12:00:30-05:00' });
  engine.startTimer();
  try {
    t.mock.timers.tick(29_000);
    await engine.queue;
    assert.equal(fetch.calls.length, 0, 'not before the minute');
    t.mock.timers.tick(2_000);
    await engine.queue;
    assert.equal(fetch.calls.length, 1);
  } finally {
    engine.stopTimer();
  }
});
