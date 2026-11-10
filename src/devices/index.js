// -----------------------------------------------------------------------------
// Device registry: one peak events device per followed offer.
// -----------------------------------------------------------------------------

import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { followedOffers } from '../config.js';
import { buildDevice, idsOf } from './peakEvents.js';

/** The discovery payload: one device per followed offer. */
export function buildDiscoveredDevices(gladys, config) {
  return followedOffers(config).map((code) => buildDevice(gladys, code));
}

/**
 * The offer a device belongs to, from its external id — `null` for a device
 * of an offer the user no longer follows.
 *
 * @param {object} gladys
 * @param {object} config
 * @param {string} externalId
 * @returns {string | null}
 */
export function offerOfDevice(gladys, config, externalId) {
  return followedOffers(config).find((code) => idsOf(gladys, code).device === externalId) ?? null;
}

// Gladys' poll ticks drift by a few milliseconds: a read due within the next
// half-minute runs now, so a 900 s interval does not slip to 960 s.
const POLL_TOLERANCE_MS = DEVICE_POLL_FREQUENCIES.EVERY_MINUTES / 2;

/**
 * The read pacing of the template, shared by every device: the feed is ONE
 * file for every offer, so one read serves them all, at the interval the
 * user chose (`poll_frequency`, seconds). Resolves whether a read is due.
 *
 * @param {object} [options]
 * @param {() => number} [options.now]
 */
export function createPoller({ now = () => Date.now() } = {}) {
  let lastRead;
  return {
    /** Whether the feed should be read again now. */
    due(config) {
      return (
        lastRead === undefined ||
        now() - lastRead >= config.poll_frequency * 1000 - POLL_TOLERANCE_MS
      );
    },
    /** A read just succeeded. */
    done() {
      lastRead = now();
    },
    /** Forget the last read: the next `due` is true (new config, refresh_now). */
    reset() {
      lastRead = undefined;
    },
  };
}
