# Hydro-Québec Peaks — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com)
to the **winter peak events** Hydro-Québec publishes as open data — the
_événements de pointe_ of the Winter Credit Option (CPC-D), Rate Flex D
(TPC-DPC) and the business offers — so a house can pre-heat, shed load during
the peak and put everything back afterwards, on its own.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
Requires **Gladys 5.3.0 or later**. No account, no API key.

> Unofficial integration, not affiliated with nor endorsed by Hydro-Québec. It
> reads public data published under the CC BY-NC 4.0 licence.

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) · [Deutsch](./docs/de.md) ·
[Español](./docs/es.md).

## What it does

One device per followed offer, with read-only features:

| Feature                   | Gladys feature          | Meaning                                                |
| ------------------------- | ----------------------- | ------------------------------------------------------ |
| Peak in progress          | switch / binary (0-1)   | a peak of the offer is running                         |
| Pre-heat window           | switch / binary (0-1)   | the configured lead time before a peak has begun       |
| Peak this morning/evening | switch / binary (0-1)   | an AM / PM peak is announced today (Québec time)       |
| Peak tomorrow morning/eve | switch / binary (0-1)   | the same, tomorrow                                     |
| Minutes until next peak   | duration / integer, min | 0 during a peak, -1 when none is announced, ≤ 7 days   |
| Next peak                 | text                    | `YYYY-MM-DD HH:MM–HH:MM` in Québec time, `—` when none |

Since Gladys 5.1 it also extends the scene editor and the dashboard
(`src/capabilities/`):

- **scene triggers** — `peak_announced`, `preheat_started`, `peak_started`,
  `peak_ended`, filtered by offer and time slot (AM/PM), each carrying the
  offer code, the start, the end and the duration of the peak;
- **scene action** — `refresh_now`: read the data now and hand the scene
  `peak_in_progress`, `preheat_in_progress`, `next_peak_start` and
  `minutes_until_next_peak`;
- **widget** — `peaks`: countdown to the next peak (or to the end of the
  running one), the announced peaks, the state of each offer, and a refresh
  button.

The **Configuration screen** offers _Test the connection_ (peaks announced per
offer) and _List the offers_ (every offer code the feed publishes, for the
_Other offers_ field).

## Where the data comes from

One transport, declared in the manifest: **cloud** — Hydro-Québec's open data.

The integration reads the static file the Opendatasoft dataset
[`evenements-pointe`](https://donnees.hydroquebec.com/explore/dataset/evenements-pointe/)
is built from:
`https://donnees.solutions.hydroquebec.com/donnees-ouvertes/data/json/pointeshivernales.json`.
A few kilobytes behind a CDN, revalidated with its ETag (`If-None-Match` → a
bodyless `304` while nothing changed), every 15 minutes by default. The
Opendatasoft API itself is rate limited and is not polled.

Two details of that feed shape the code:

- an offer appears either as its bare code (`CPC-D`) or inside a label
  (`Credit hivernal Residentiel (CPC-D)`): `src/hydroquebec/offers.js` compares
  offers **by code**, so both shapes reach the same device;
- dates carry their UTC offset (`2026-01-09T06:00:00-05:00`); "today" and
  "tomorrow" are computed on Québec's clock (`America/Toronto`), never on the
  container's (UTC).

The flags are re-evaluated **every minute, on the minute**, from the copy in
memory: a peak starts at 06:00 without anything new being published. The
transitions already fired are remembered in `/data/state.json`, so a restart
announces nothing twice.

## Project structure

```
.
├─ index.js                          # SDK bootstrap + event wiring (no business logic)
├─ src/
│  ├─ config.js                      # config defaults, bounds, followed offers
│  ├─ engine.js                      # read the feed, evaluate every minute, publish
│  ├─ actions.js                     # "Test the connection", "List the offers"
│  ├─ store.js                       # the JSON memory under /data
│  ├─ time.js                        # Québec time: days, hours, wording
│  ├─ i18n.js                        # the languages of user-facing text (en, fr, de, es)
│  ├─ hydroquebec/                   # the open data driver
│  │  ├─ feed.js                     #   fetch (ETag) + parse the feed
│  │  ├─ offers.js                   #   offer codes, names, matching
│  │  ├─ schedule.js                 #   where an offer stands at a given minute
│  │  └─ transitions.js              #   announced / pre-heat / start / end, once each
│  ├─ capabilities/                  # Gladys 5.1: scenes and dashboard
│  │  ├─ scenes.js                   #   scene triggers and the refresh_now action
│  │  └─ widget.js                   #   the "Hydro-Québec peaks" dashboard widget
│  └─ devices/
│     ├─ index.js                    #   registry + read pacing
│     └─ peakEvents.js               #   the device of an offer and its states
├─ docs/                             # user documentation, re-hosted by Gladys
├─ test/                             # node --test, fake Gladys, recorded feeds
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
└─ .github/workflows/                # CI + UI-driven release, multi-arch image
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="hydroquebec-peak" \
DATA_DIR=/tmp/gladys-hydroquebec-peak \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its sandboxed container. `DATA_DIR` moves the memory
out of `/data` for a run outside the container.

## Quality checks

The same three checks run on every push and pull request (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
npm run format:check   # Prettier: is everything formatted?
npm run lint           # ESLint: catch real mistakes
npm test               # Unit tests, via the built-in `node --test` runner
```

The tests never touch the network: they replay two recorded feeds
(`test/fixtures/`) — the one served on 2026-11-10 and a winter one built from
the real peaks of January 2025 — against the SDK's fake Gladys.

Before tagging a release, the store validation can be run locally:

```bash
npx github:GladysAssistant/integration-store .
```

## Release

**Actions → Release → Run workflow**, pick `patch`, `minor` or `major`: the
workflow bumps the version everywhere (`package.json` + manifest
`version`/`docker_image`), moves the `[Unreleased]` section of
`CHANGELOG.md`, pushes the `vX.Y.Z` tag, builds the `linux/amd64` +
`linux/arm64` image to `ghcr.io` and publishes the GitHub Release. The
decentralized indexer then picks up the new manifest version — the repository
must be public and carry the `gladys-assistant-integration` GitHub topic.

## Credits

Peak events: [Hydro-Québec open data](https://donnees.hydroquebec.com/explore/dataset/evenements-pointe/),
licence CC BY-NC 4.0. The reading of the feed follows the one of the Home
Assistant `hydroquebec_peak` integration and its `hydropeak-opendata` library.
This project is not affiliated with Hydro-Québec.

## License

Apache-2.0
