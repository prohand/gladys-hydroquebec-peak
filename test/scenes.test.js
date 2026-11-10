import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SCENE_ACTIONS,
  SCENE_ACTION_KEYS,
  SCENE_TRIGGER_KEYS,
  sceneEventOf,
} from '../src/capabilities/scenes.js';
import { TRANSITIONS } from '../src/hydroquebec/transitions.js';
import { setup } from './helpers/engine.js';
import { fakeFetch } from './helpers/feed.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);

test('every event carries only the keys its trigger declares, as primitives', async () => {
  const { gladys, engine } = await setup();
  await engine.tick();
  const event = engine.feed.events.find((e) => e.code === 'CPC-D');
  for (const transition of Object.values(TRANSITIONS)) {
    const { key, data } = sceneEventOf(gladys, 'CPC-D', transition, event, engine.config);
    assert.ok(SCENE_TRIGGER_KEYS.includes(key));
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(
        value === null || typeof value !== 'object',
        `${key}: data.${name} not a primitive`,
      );
    }
    for (const name of declared) {
      assert.ok(name in data, `${key}: declared ${name} is never sent`);
    }
    assert.equal(data.device, 'ext:test-integration:offer:cpc-d');
    const slots = trigger.fields.find((field) => field.key === 'slot').options.map((o) => o.value);
    assert.ok(slots.includes(data.slot));
  }
});

test('refresh_now reads the feed and returns the declared outputs', async () => {
  const { engine, fetch } = await setup({ at: '2025-01-08T05:00:00-05:00' });
  const outputs = await SCENE_ACTIONS[SCENE_ACTION_KEYS.REFRESH_NOW](engine, {
    fields: { device: 'ext:test-integration:offer:cpc-d' },
  });
  assert.equal(fetch.calls.length, 1);
  assert.deepEqual(outputs, {
    offer: 'CPC-D',
    peak_in_progress: false,
    preheat_in_progress: true,
    next_peak_start: '2025-01-08 06:00',
    minutes_until_next_peak: 60,
  });
  const declared = keysOf(declarationOf('scene_actions', SCENE_ACTION_KEYS.REFRESH_NOW).outputs);
  assert.deepEqual(Object.keys(outputs).sort(), [...declared].sort());
});

test('refresh_now answers from the last copy when the network blinks', async () => {
  const fetch = fakeFetch();
  const { engine } = await setup({ at: '2025-01-08T07:00:00-05:00', fetch });
  await engine.tick();
  fetch.error = new Error('ECONNRESET');
  const outputs = await SCENE_ACTIONS.refresh_now(engine, { fields: {} });
  assert.equal(outputs.peak_in_progress, true);
  assert.equal(outputs.minutes_until_next_peak, 0);
});

test('refresh_now fails without any copy of the feed, or without an offer', async () => {
  const down = await setup({ fetch: fakeFetch({ status: 503 }) });
  await assert.rejects(SCENE_ACTIONS.refresh_now(down.engine, { fields: {} }), /HTTP 503/);
  const none = await setup({ config: {} });
  await assert.rejects(
    SCENE_ACTIONS.refresh_now(none.engine, { fields: {} }),
    /No Hydro-Québec offer/,
  );
});

test('a scene action never fires a scene event (no loops)', async () => {
  const { gladys, engine } = await setup({ at: '2025-01-08T05:00:00-05:00' });
  await engine.tick();
  const before = gladys.fake.sceneEvents.length;
  await SCENE_ACTIONS.refresh_now(engine, { fields: {} });
  assert.equal(gladys.fake.sceneEvents.length, before);
});
