// An engine wired to the SDK's fake Gladys, a fake feed and a fake clock.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../../src/config.js';
import { buildDiscoveredDevices } from '../../src/devices/index.js';
import { PeakEngine } from '../../src/engine.js';
import { FeedClient } from '../../src/hydroquebec/feed.js';
import { MemoryStore } from '../../src/store.js';
import { fakeClock, fakeFetch } from './feed.js';

export async function setup({
  config = { offers: ['CPC-D'] },
  at = '2025-01-07T12:00:00-05:00',
  fetch = fakeFetch(),
  store = new MemoryStore(),
} = {}) {
  const gladys = createFakeGladys();
  const clock = fakeClock(at);
  const engine = new PeakEngine({
    gladys,
    client: new FeedClient({ fetch }),
    store,
    now: clock.read,
  });
  engine.setConfig(normalizeConfig(config));
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, engine.config));
  return { gladys, clock, engine, fetch, store };
}
