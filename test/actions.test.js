import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, ACTION_KEYS } from '../src/actions.js';
import { NO_OFFER_MESSAGE } from '../src/engine.js';
import { setup } from './helpers/engine.js';
import { NOVEMBER, fakeFetch, fixtureText } from './helpers/feed.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

test('test_connection reports every followed offer, in every language', async () => {
  const { engine } = await setup({
    at: '2025-01-07T20:00:00-05:00',
    config: { offers: ['CPC-D'], other_offers: 'NOPE_42' },
  });
  const message = await ACTIONS[ACTION_KEYS.TEST_CONNECTION](engine);
  for (const language of LANGUAGES) {
    assert.ok(message[language], `no ${language} text`);
  }
  assert.match(message.fr, /5 pointe\(s\) annoncée\(s\), prochaine mer\. 08\/01, 06:00–09:00/);
  assert.match(message.en, /NOPE_42: unknown to Hydro-Québec/);
});

test('test_connection says why it failed, or that no offer is followed', async () => {
  const down = await setup({ fetch: fakeFetch({ status: 404 }) });
  assert.match((await ACTIONS.test_connection(down.engine)).en, /HTTP 404/);
  const none = await setup({ config: {} });
  assert.deepEqual(await ACTIONS.test_connection(none.engine), NO_OFFER_MESSAGE);
});

test('list_offers gives the code of every offer the feed publishes', async () => {
  const { engine } = await setup({ fetch: fakeFetch({ body: fixtureText(NOVEMBER) }) });
  const message = await ACTIONS[ACTION_KEYS.LIST_OFFERS](engine);
  assert.match(message.en, /^- CPC-D$/m);
  assert.match(message.en, /^- ENG_100H_2F_7J$/m);
  assert.match(message.en, /^- Chaine de bloc$/m);
  assert.equal(message.en.split('\n').length, 40);
});
