import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, localize, pick } from '../src/i18n.js';

test('the four languages of the interface, English first', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('pick falls back to English, localize builds every language', () => {
  assert.equal(pick('it', { en: 'peak', fr: 'pointe' }), 'peak');
  assert.deepEqual(
    localize((language) => language.toUpperCase()),
    { en: 'EN', fr: 'FR', de: 'DE', es: 'ES' },
  );
});
