# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for the **Hydro-Québec winter peak events**
(_événements de pointe_), read from Hydro-Québec's public open data — no account, no key,
manifest transport `cloud`. One device per followed offer (CPC-D, TPC-DPC, CPC-G, TPC-GPC…),
scene triggers (peak announced, pre-heat window opens, peak starts, peak ends), a scene action
(`refresh_now`) and a "Hydro-Québec peaks" widget. Requires Gladys 5.3+. Unofficial: never use
Hydro-Québec's logo or imply an affiliation.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/transitions.test.js        # one file
node --test --test-name-pattern "restart"   # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, plus the store checks and a Docker
build on pull requests. Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, rolls `CHANGELOG.md`, re-runs Prettier, tags, builds, publishes the
GitHub Release).

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/engine.js                reads the feed when due, evaluates every minute, publishes
                             states (publishChangedStates), scene events, status, nudges
src/hydroquebec/feed.js      the static feed (ETag, 304), parse + validation
src/hydroquebec/offers.js    offer codes: `Label (CODE)` and `CODE` are the same offer
src/hydroquebec/schedule.js  pure: where an offer stands at a given instant
src/hydroquebec/transitions.js  announced / preheat / started / ended, once each, remembered
src/devices/peakEvents.js    the device of an offer, its features and states
src/devices/index.js         registry + read pacing (createPoller)
src/capabilities/            Gladys 5.1 scenes (triggers + refresh_now) and widget
src/actions.js               "Test the connection", "List the offers"
src/store.js                 JSON memory in /data/state.json (atomic, never fatal)
src/time.js                  Québec time (America/Toronto), numeric formatToParts only
src/config.js                DEFAULT_CONFIG (= manifest defaults), bounds, followedOffers
```

### Invariants worth knowing

- **The feed, not the Opendatasoft API.** The static JSON behind a CDN is polled (default
  900 s, floor 300 s) with `If-None-Match`; the Opendatasoft API is rate limited (429). It is
  served as `text/plain`: parse the body yourself.
- **Offers are compared by code** (`offerKey`): the feed has used both `CPC-D` and
  `Credit hivernal Residentiel (CPC-D)`. The device external id is `offer:<slug of the code>`
  — never derive it from the label.
- **Québec time for every day boundary** (`src/time.js`). The container runs in UTC; 20:00 in
  Québec is already tomorrow in UTC. Dates without an offset are refused by the parser.
- **A peak is `[start, end)`**: at 09:00 the 06:00–09:00 peak is over.
- **One event per transition.** `TransitionTracker` marks before publishing and `unmark`s on a
  failed delivery. Starts are fired within `GRACE_MS` (10 min) only, ends up to 12 h late if
  their start was fired. The peaks already published when an offer is first seen are taken as
  known silently (no announcement flood at install).
- **Ticks never overlap** (`engine.queue`): the minute timer, Gladys' polls, `refresh_now`, the
  widget button and the actions all go through it.
- **Polling**: `poll_frequency` published to Gladys is `DEVICE_POLL_FREQUENCIES.EVERY_MINUTES`
  (ms, enum). The configured `poll_frequency` is seconds and only paces the feed reads.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text included (0/0).
- Trigger, action, widget, feature and offer keys are stored by users: never rename them.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with the code:
handlers for every action / scene action / widget, every fired trigger declared, defaults and
bounds, the offers of the select, `transports: ["cloud"]`, version/image coupling, and **every
text in en, fr, de and es**.

## Testing

No network: `test/helpers/feed.js` serves the recorded feeds of `test/fixtures/` through a fake
`fetch` (ETag + 304), `test/helpers/engine.js` wires the engine to the SDK's
`createFakeGladys()` and a hand-moved clock, `MemoryStore` replaces `/data`.

## Conventions

Prettier formats, ESLint catches mistakes. Comments explain **why**, in English. User-facing
text is `{ en, fr, de, es }` (built with `src/i18n.js`); user docs in `docs/en.md`,
`docs/fr.md`, `docs/de.md` and `docs/es.md`, kept in sync. Every user-visible change adds a line
under `## [Unreleased]` in `CHANGELOG.md`; never write a version heading by hand.
