# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

### Changed

- Declared for Canada only (`countries: ["CA"]`): the Gladys catalog of an
  instance located elsewhere no longer lists it in its browse views (the
  search still finds it). Requires Gladys 5.3.0 or later.

## [1.0.1] - 2026-11-10

### Added

- Hydro-Québec winter peak events, read from Hydro-Québec's open data (no account, no key):
  one device per followed offer (Winter Credit Option CPC-D, Rate Flex D TPC-DPC, business
  offers, and any other offer by its code).
- Features per offer: peak in progress, pre-heat window, peak this morning / this evening /
  tomorrow morning / tomorrow evening, minutes until the next peak, next peak.
- Flags re-evaluated every minute, on the minute, in Québec time; the feed is revalidated with
  its ETag at the configured interval (15 minutes by default).
- Scene triggers (Gladys 5.1+): a peak is announced, the pre-heat window opens, a peak starts,
  a peak ends — once each, remembered across restarts.
- Scene action: read the Hydro-Québec peaks now, with the state of the offer as outputs.
- "Hydro-Québec peaks" dashboard widget: countdown, announced peaks, state of each offer,
  refresh button.
- "Test the connection" and "List the offers" actions.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/prohand/gladys-hydroquebec-peak/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-hydroquebec-peak/releases/tag/v1.0.1
