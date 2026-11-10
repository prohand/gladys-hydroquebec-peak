import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, followedOffers, normalizeConfig } from '../src/config.js';

test('an empty config gets the defaults and follows no offer', () => {
  const config = normalizeConfig();
  assert.deepEqual(config.offers, []);
  assert.equal(config.preheat_minutes, DEFAULT_CONFIG.preheat_minutes);
  assert.equal(config.poll_frequency, DEFAULT_CONFIG.poll_frequency);
  assert.deepEqual(followedOffers(config), []);
});

test('numbers arriving as strings are typed and bounded', () => {
  const config = normalizeConfig({ preheat_minutes: '90', poll_frequency: '10' });
  assert.equal(config.preheat_minutes, 90);
  assert.equal(config.poll_frequency, 300, 'the refresh interval has a floor');
  assert.equal(normalizeConfig({ preheat_minutes: 9999 }).preheat_minutes, 360);
  assert.equal(normalizeConfig({ preheat_minutes: 'abc' }).preheat_minutes, 120);
  assert.equal(normalizeConfig({ preheat_minutes: 0 }).preheat_minutes, 0);
});

test('followed offers merge the ticked and the typed ones, by code, once each', () => {
  const config = normalizeConfig({
    offers: ['CPC-D', 'TPC-DPC'],
    other_offers: 'ENG_100H_2F_7J, cpc-d ,Credit hivernal Affaires (CPC-G),,',
  });
  assert.deepEqual(followedOffers(config), ['CPC-D', 'TPC-DPC', 'ENG_100H_2F_7J', 'CPC-G']);
});

test('a multi_select sent as one string still works', () => {
  assert.deepEqual(followedOffers(normalizeConfig({ offers: 'CPC-D,TPC-DPC' })), [
    'CPC-D',
    'TPC-DPC',
  ]);
});
