import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { buildDiscoveredDevices, createPoller, offerOfDevice } from '../src/devices/index.js';
import { FEATURES, NO_PEAK_TEXT, buildDevice, statesOf } from '../src/devices/peakEvents.js';
import { parseFeed } from '../src/hydroquebec/feed.js';
import { snapshot } from '../src/hydroquebec/schedule.js';
import { WINTER, fixtureText } from './helpers/feed.js';

const { events } = parseFeed(JSON.parse(fixtureText(WINTER)));
const config = normalizeConfig({ offers: ['CPC-D', 'TPC-DPC'], other_offers: 'Chaine de bloc' });

test('one device per followed offer, accepted by Gladys', async () => {
  const gladys = createFakeGladys();
  const devices = buildDiscoveredDevices(gladys, config);
  assert.deepEqual(
    devices.map((device) => device.external_id),
    [
      'ext:test-integration:offer:cpc-d',
      'ext:test-integration:offer:tpc-dpc',
      'ext:test-integration:offer:chaine-de-bloc',
    ],
  );
  // The fake Gladys refuses what the host API refuses: unknown category,
  // type, unit, a poll_frequency outside the enum.
  await gladys.publishDiscoveredDevices(devices);
  assert.equal(gladys.fake.discoveredDevices.length, 3);
});

test('every feature declares min and max, and only the right ones keep history', () => {
  const device = buildDevice(createFakeGladys(), 'CPC-D');
  assert.equal(device.features.length, Object.keys(FEATURES).length);
  for (const feature of device.features) {
    assert.equal(typeof feature.min, 'number', `${feature.external_id} min`);
    assert.equal(typeof feature.max, 'number', `${feature.external_id} max`);
    assert.equal(feature.read_only, true);
  }
  const kept = device.features
    .filter((f) => f.keep_history)
    .map((f) => f.external_id.split(':').pop());
  assert.deepEqual(kept, [FEATURES.PEAK_ACTIVE, FEATURES.PREHEAT_ACTIVE]);
});

test('the states of a snapshot are accepted by Gladys', async () => {
  const gladys = createFakeGladys();
  const states = statesOf(
    gladys,
    snapshot(events, 'CPC-D', new Date('2025-01-08T07:00:00-05:00'), 120),
  );
  await gladys.publishStates(states);
  const id = (key) => `ext:test-integration:offer:cpc-d:${key}`;
  assert.equal(gladys.fake.lastState(id(FEATURES.PEAK_ACTIVE)), 1);
  assert.equal(gladys.fake.lastState(id(FEATURES.TODAY_AM)), 1);
  assert.equal(gladys.fake.lastState(id(FEATURES.MINUTES_UNTIL_NEXT)), 0);
  const text = states.find((s) => s.device_feature_external_id === id(FEATURES.NEXT_PEAK)).text;
  assert.equal(text, '2025-01-08 06:00–09:00');
});

test('no peak announced: the text says so, the countdown is -1', () => {
  const gladys = createFakeGladys();
  const states = statesOf(
    gladys,
    snapshot(events, 'CPC-D', new Date('2025-03-01T12:00:00-05:00'), 120),
  );
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s]),
  );
  assert.equal(byKey[FEATURES.NEXT_PEAK].text, NO_PEAK_TEXT);
  assert.equal(byKey[FEATURES.MINUTES_UNTIL_NEXT].state, -1);
});

test('a device is routed back to its offer, a stale one to nothing', () => {
  const gladys = createFakeGladys();
  assert.equal(offerOfDevice(gladys, config, 'ext:test-integration:offer:tpc-dpc'), 'TPC-DPC');
  assert.equal(offerOfDevice(gladys, config, 'ext:test-integration:offer:cpc-g'), null);
});

test('the poller reads at the configured interval, give or take half a minute', () => {
  let now = 0;
  const poller = createPoller({ now: () => now });
  const cfg = normalizeConfig({ poll_frequency: 900 });
  assert.equal(poller.due(cfg), true);
  poller.done();
  now = 60_000;
  assert.equal(poller.due(cfg), false);
  now = 870_000;
  assert.equal(poller.due(cfg), true, 'within the tolerance');
  poller.done();
  poller.reset();
  assert.equal(poller.due(cfg), true);
});
