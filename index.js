// -----------------------------------------------------------------------------
// Entry point of the Hydro-Québec peak events integration.
//
// Wiring only: the SDK on one side, the engine (src/engine.js) on the other.
// Handlers are registered BEFORE connect(). The SDK reads the three variables
// the Gladys supervisor injects (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR) by itself.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { buildDiscoveredDevices, offerOfDevice } from './src/devices/index.js';
import { PeakEngine } from './src/engine.js';
import { ACTIONS } from './src/actions.js';
import { SCENE_ACTIONS } from './src/capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './src/capabilities/widget.js';

const gladys = new GladysIntegration();
const engine = new PeakEngine({ gladys });

async function publishDevices() {
  await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, engine.config));
}

// --- Discovery ---------------------------------------------------------------
gladys.onScanRequest(async () => {
  await publishDevices();
});

// --- Polling -------------------------------------------------------------------
// Gladys polls each offer device once a minute: one engine beat serves them
// all (the feed is read at the configured interval, the states are published
// only when they change), so the poll of an offer no longer followed is ignored.
gladys.onPoll(async (device) => {
  if (!offerOfDevice(gladys, engine.config, device.external_id)) {
    logger.debug(`onPoll ignored: ${device.external_id} is not a followed offer`);
    return;
  }
  await engine.tick();
});

// --- Configuration screen buttons ----------------------------------------------
for (const [key, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(key, (fields) => handler(engine, { fields }));
}

// --- Scene actions (Gladys 5.1+) -------------------------------------------------
// The triggers need no handler: the engine fires them with publishSceneEvent.
for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, (fields) => handler(engine, { fields }));
}

// --- Dashboard widget (Gladys 5.1+) --------------------------------------------
for (const [key, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => widget.get(engine, request));
  gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
    widget.action(engine, { actionKey, params, settings }),
  );
}

// --- Configuration updated -------------------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('Configuration updated');
  engine.setConfig(normalizeConfig(newConfig));
  await publishDevices();
  await engine.reportStatus();
  await engine.tick();
  refreshWidgets(gladys);
});

// --- Connection lifecycle --------------------------------------------------------
gladys.on('connected', async () => {
  try {
    engine.setConfig(normalizeConfig(await gladys.getConfig()));
    await publishDevices();
    // Gladys may have lost what was published while the socket was down:
    // publish every state again, and say the status again.
    gladys.forgetPublishedStates();
    engine.resetStatus();
    await engine.reportStatus();
    await engine.tick();
    refreshWidgets(gladys);
    engine.startTimer();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Protokollen der Integration nach.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

gladys.on('disconnected', () => {
  engine.stopTimer();
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  engine.stopTimer();
});

logger.info('Starting the Hydro-Québec peak events integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
