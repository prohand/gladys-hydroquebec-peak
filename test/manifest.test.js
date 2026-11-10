// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but nothing there knows which
// handlers the code registers, nor the defaults it falls back on: these tests
// keep both sides in sync, and catch the store rules easiest to miss.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/actions.js';
import { SCENE_ACTIONS, SCENE_TRIGGER_KEYS } from '../src/capabilities/scenes.js';
import { PEAKS_SHOWN, WIDGETS } from '../src/capabilities/widget.js';
import { DEFAULT_CONFIG, PREHEAT_BOUNDS, REFRESH_BOUNDS } from '../src/config.js';
import { KNOWN_OFFERS } from '../src/hydroquebec/offers.js';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const REPOSITORY = 'prohand/gladys-hydroquebec-peak';

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];
const field = (key) => manifest.config_schema.find((f) => f.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('Gladys 5.3.0 or later: categories, capabilities, SDK 0.16', () => {
  assert.ok(isAtLeast(minGladysVersion(), [5, 3, 0]));
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(manifest.categories.includes('energy'));
});

test('a cloud integration: the data comes from Hydro-Québec servers', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widget has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  const setting = manifest.widgets[0].settings.find((s) => s.key === 'peaks');
  assert.deepEqual(
    { min: setting.min, max: setting.max, default: setting.default },
    { min: PEAKS_SHOWN.min, max: PEAKS_SHOWN.max, default: PEAKS_SHOWN.default },
  );
});

test('every trigger the code fires is declared, and every declared one is fired', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
});

test('config defaults and bounds are the ones the code falls back on', () => {
  for (const f of manifest.config_schema) {
    if (f.default !== undefined) {
      assert.deepEqual(DEFAULT_CONFIG[f.key], f.default, `DEFAULT_CONFIG.${f.key}`);
    }
  }
  assert.deepEqual(
    { min: field('preheat_minutes').min, max: field('preheat_minutes').max },
    PREHEAT_BOUNDS,
  );
  assert.deepEqual(
    { min: field('poll_frequency').min, max: field('poll_frequency').max },
    REFRESH_BOUNDS,
  );
});

test('the offers of the select are the known offers, codes untouched', () => {
  assert.deepEqual(
    field('offers').options.map((option) => option.value),
    KNOWN_OFFERS.map((offer) => offer.code),
  );
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamic.length > 0);
  for (const f of dynamic) {
    assert.equal(f.source, 'devices');
    assert.equal(f.options, undefined, `field "${f.key}": source and options together`);
  }
});

test('the version is the package version, the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/${REPOSITORY}:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    `https://raw.githubusercontent.com/${REPOSITORY}/main/cover.png`,
  );
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('placeholders are multi-language objects', () => {
  const withPlaceholder = allFields.filter((f) => f.placeholder !== undefined);
  assert.ok(withPlaceholder.length > 0);
  for (const f of withPlaceholder) {
    assert.equal(typeof f.placeholder, 'object', `field "${f.key}": placeholder`);
  }
});

test('every text of the manifest exists in English, French, German and Spanish', () => {
  const missing = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!node || typeof node !== 'object') {
      return;
    }
    if (typeof node.en === 'string') {
      for (const language of LANGUAGES) {
        if (typeof node[language] !== 'string' || node[language].trim() === '') {
          missing.push(`${path}.${language}`);
        }
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      walk(value, `${path}.${key}`);
    }
  };
  walk(manifest, 'manifest');
  assert.deepEqual(missing, []);
});
