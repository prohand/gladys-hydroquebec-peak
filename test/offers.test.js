import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_OFFERS,
  offerCode,
  offerKey,
  offerName,
  offerSlug,
  sameOffer,
} from '../src/hydroquebec/offers.js';

test('the code of an offer is read from both shapes Hydro-Québec publishes', () => {
  assert.equal(offerCode('Credit hivernal Residentiel (CPC-D)'), 'CPC-D');
  assert.equal(offerCode('Flex Residentiel (TPC-DPC) '), 'TPC-DPC');
  assert.equal(offerCode('CPC-D'), 'CPC-D');
  assert.equal(offerCode('ENG_100H_2F_7J'), 'ENG_100H_2F_7J');
  assert.equal(offerCode('  Chaine de bloc '), 'Chaine de bloc');
  assert.equal(offerCode(undefined), '');
});

test('two names of the same offer are one offer, whatever the case or accents', () => {
  assert.ok(sameOffer('Credit hivernal Residentiel (CPC-D)', 'CPC-D'));
  assert.ok(sameOffer('cpc-d', 'CPC-D'));
  assert.ok(sameOffer('Chaîne  de bloc', 'Chaine de bloc'));
  assert.ok(!sameOffer('Credit hivernal Affaires (CPC-G)', 'CPC-D'));
  assert.equal(offerKey('Flex Residentiel (TPC-DPC)'), 'tpc-dpc');
});

test('the slug of an offer is safe in an external id', () => {
  assert.equal(offerSlug('CPC-D'), 'cpc-d');
  assert.equal(offerSlug('Chaine de bloc'), 'chaine-de-bloc');
  assert.equal(offerSlug('ENG_100H_2F_7J'), 'eng-100h-2f-7j');
  assert.equal(offerSlug('Credit hivernal Residentiel (CPC-D)'), 'cpc-d');
});

test('known offers are named in the four languages, others by their code', () => {
  for (const offer of KNOWN_OFFERS) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      assert.ok(offer.label[language], `${offer.code} has no ${language} label`);
    }
  }
  assert.equal(offerName('CPC-D', 'fr'), 'Tarif D avec option de crédits hivernaux (CPC-D)');
  assert.equal(offerName('ENG_20H_1F_5J', 'fr'), 'ENG_20H_1F_5J');
});
