import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { PEAKS_WIDGET, WIDGETS, formatWait, refreshWidgets } from '../src/capabilities/widget.js';
import { setup } from './helpers/engine.js';
import { fakeFetch } from './helpers/feed.js';

const widget = WIDGETS[PEAKS_WIDGET];
const content = (engine, settings = {}) =>
  widget.get(engine, { settings, language: 'fr', units: 'metric' });

async function at(date, config) {
  const ctx = await setup({ at: date, ...(config ? { config } : {}) });
  await ctx.engine.tick();
  return ctx;
}

for (const [name, date] of [
  ['the day before', '2025-01-07T20:00:00-05:00'],
  ['during the pre-heat', '2025-01-08T05:00:00-05:00'],
  ['during a peak', '2025-01-08T07:00:00-05:00'],
  ['nothing announced', '2025-03-01T12:00:00-05:00'],
]) {
  test(`the content is rendered exactly as sent: ${name}`, async () => {
    const { engine } = await at(date, { offers: ['CPC-D', 'TPC-DPC', 'CPC-G', 'OEA'] });
    assert.deepEqual(validateWidgetContent(await content(engine)), []);
  });
}

test('during a peak: the tile counts down to its end, the row says until when', async () => {
  const { engine } = await at('2025-01-08T07:00:00-05:00');
  const { components } = await content(engine);
  const tile = components.find((c) => c.type === 'value');
  assert.equal(tile.value, '2 h 00');
  const row = components.find((c) => c.type === 'status').items[0];
  assert.equal(row.value.fr, "Pointe jusqu'à 09:00");
  assert.equal(row.color, 'danger');
});

test('the list follows the setting, soonest first', async () => {
  const { engine } = await at('2025-01-07T20:00:00-05:00');
  const list = (await content(engine, { peaks: 2 })).components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].title.fr, 'mer. 08/01, 06:00–09:00');
  assert.ok(list.items[0].date < list.items[1].date);
});

test('no offer, or no feed yet: a valid content that says why', async () => {
  const none = await setup({ config: {} });
  const empty = await content(none.engine);
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.match(empty.components[0].text.fr, /Aucune offre suivie/);

  const down = await setup({ fetch: fakeFetch({ status: 503 }) });
  await down.engine.tick();
  const waiting = await content(down.engine);
  assert.deepEqual(validateWidgetContent(waiting), []);
});

test('every button action is handled and answers a short toast', async () => {
  const { engine } = await at('2025-01-07T20:00:00-05:00');
  const buttons = (await content(engine)).components.filter((c) => c.type === 'button' && c.action);
  assert.ok(buttons.length > 0);
  for (const { action } of buttons) {
    const toast = await widget.action(engine, {
      actionKey: action.key,
      params: action.params ?? {},
    });
    assert.ok(toast.en.length <= 200);
    assert.match(toast.fr, /5 pointe/);
  }
  await assert.rejects(widget.action(engine, { actionKey: 'nope' }), /Unknown widget action/);
});

test('waits are short enough for a tile', () => {
  assert.equal(formatWait(45 * 60000), '45 min');
  assert.equal(formatWait(125 * 60000), '2 h 05');
  assert.equal(formatWait(3 * 24 * 60 * 60000).fr, '3 jours');
});

test('refreshWidgets nudges every widget', () => {
  const gladys = createFakeGladys();
  refreshWidgets(gladys);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(WIDGETS));
});
