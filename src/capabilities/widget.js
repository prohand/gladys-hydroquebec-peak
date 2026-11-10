// -----------------------------------------------------------------------------
// The "Hydro-Québec peaks" dashboard widget (Gladys 5.1+).
//
// What a person glances at on a winter morning:
//   - a tile counting down to the next peak (or to the end of the running one);
//   - one status row per followed offer: peak now, pre-heat, next peak, none;
//   - the next announced peaks, every offer together, soonest first;
//   - a button to read the feed now, and one to the open data page.
//
// The content is computed from the clock and the feed, so it is served with a
// one-minute TTL, and the engine nudges it when a transition fires or the feed
// changes.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { followedOffers } from '../config.js';
import { DATASET_URL } from '../hydroquebec/feed.js';
import { offerName } from '../hydroquebec/offers.js';
import { snapshot } from '../hydroquebec/schedule.js';
import { localize, pick } from '../i18n.js';
import { describeSpan, quebecTime } from '../time.js';

/** Widget key, as declared in the manifest `widgets`. Never renamed. */
export const PEAKS_WIDGET = 'peaks';

/** Keys of the `button` actions of the content. */
export const WIDGET_ACTIONS = { REFRESH: 'refresh' };

/** Bounds of the `peaks` setting: how many announced peaks are listed. */
export const PEAKS_SHOWN = { min: 1, max: 8, default: 4 };

const MINUTE_MS = 60 * 1000;

/** `2 h 05` / `45 min`: short enough for a tile (12 characters). */
export function formatWait(ms) {
  const minutes = Math.max(0, Math.ceil(ms / MINUTE_MS));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours >= 48) {
    return localize((language) => `${Math.floor(hours / 24)} ${pick(language, DAYS)}`);
  }
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}

const DAYS = { en: 'days', fr: 'jours', de: 'Tage', es: 'días' };

function shownCount(settings) {
  const value = Number(settings?.peaks);
  if (!Number.isFinite(value)) {
    return PEAKS_SHOWN.default;
  }
  return Math.min(PEAKS_SHOWN.max, Math.max(PEAKS_SHOWN.min, Math.round(value)));
}

// The status row of one offer. Labels are capped at 40 characters by the core.
function statusRow(snap) {
  const label = localize((language) => offerName(snap.code, language).slice(0, 40));
  if (snap.current) {
    return {
      label,
      icon: 'zap-off',
      color: WIDGET_COLORS.DANGER,
      value: localize((language) =>
        pick(language, {
          en: `Peak until ${quebecTime(snap.current.end)}`,
          fr: `Pointe jusqu'à ${quebecTime(snap.current.end)}`,
          de: `Spitze bis ${quebecTime(snap.current.end)}`,
          es: `Punta hasta las ${quebecTime(snap.current.end)}`,
        }),
      ),
    };
  }
  if (snap.preheat) {
    return {
      label,
      icon: 'thermometer',
      color: WIDGET_COLORS.WARNING,
      value: localize((language) =>
        pick(language, {
          en: `Pre-heat, peak at ${quebecTime(snap.preheat.start)}`,
          fr: `Préchauffage, pointe à ${quebecTime(snap.preheat.start)}`,
          de: `Vorheizen, Spitze um ${quebecTime(snap.preheat.start)}`,
          es: `Precalentamiento, punta a las ${quebecTime(snap.preheat.start)}`,
        }),
      ),
    };
  }
  if (snap.next) {
    return {
      label,
      icon: 'calendar',
      color: WIDGET_COLORS.INFO,
      value: localize((language) => describeSpan(snap.next, language)),
    };
  }
  return {
    label,
    icon: 'check-circle',
    color: WIDGET_COLORS.SUCCESS,
    value: localize((language) =>
      pick(language, {
        en: 'No peak announced',
        fr: 'Aucune pointe annoncée',
        de: 'Keine Spitze angekündigt',
        es: 'Ninguna punta anunciada',
      }),
    ),
  };
}

function badgeOf(event, snap, now) {
  if (event.start <= now) {
    return {
      text: { en: 'Now', fr: 'En cours', de: 'Jetzt', es: 'Ahora' },
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (snap.preheat === event) {
    return {
      text: { en: 'Pre-heat', fr: 'Préchauffe', de: 'Vorheizen', es: 'Precalentar' },
      color: WIDGET_COLORS.WARNING,
    };
  }
  return { text: event.slot, color: WIDGET_COLORS.INFO };
}

/** The content of the widget. */
export function buildContent(engine, { settings = {} } = {}) {
  const offers = followedOffers(engine.config);
  const refreshButton = {
    type: 'button',
    label: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  };
  const linkButton = {
    type: 'button',
    label: { en: 'Open data', fr: 'Données ouvertes', de: 'Offene Daten', es: 'Datos abiertos' },
    icon: 'external-link',
    style: 'secondary',
    link: { url: DATASET_URL },
  };

  if (offers.length === 0) {
    return {
      ttl_seconds: 300,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'No offer followed yet: choose your Hydro-Québec offer in the integration configuration.',
            fr: "Aucune offre suivie : choisissez votre offre Hydro-Québec dans la configuration de l'intégration.",
            de: 'Noch kein Angebot verfolgt: Wähle dein Hydro-Québec-Angebot in der Konfiguration der Integration.',
            es: 'Todavía no se sigue ninguna oferta: elija su oferta de Hydro-Québec en la configuración de la integración.',
          },
        },
        linkButton,
      ],
    };
  }

  if (!engine.feed) {
    return {
      ttl_seconds: 60,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'Waiting for the Hydro-Québec open data…',
            fr: "En attente des données ouvertes d'Hydro-Québec…",
            de: 'Warten auf die offenen Daten von Hydro-Québec…',
            es: 'Esperando los datos abiertos de Hydro-Québec…',
          },
        },
        refreshButton,
        linkButton,
      ],
    };
  }

  const now = engine.now();
  const snapshots = offers.map((code) =>
    snapshot(engine.feed.events, code, now, engine.config.preheat_minutes),
  );
  const components = [];

  // The tile: the most pressing moment across the offers.
  const running = snapshots.filter((snap) => snap.current);
  const waiting = snapshots.filter((snap) => snap.next);
  if (running.length > 0) {
    const end = Math.max(...running.map((snap) => snap.current.end.getTime()));
    components.push({
      type: 'value',
      label: {
        en: 'Peak ends in',
        fr: 'Fin de pointe dans',
        de: 'Spitze endet in',
        es: 'Fin de punta en',
      },
      icon: 'zap-off',
      color: WIDGET_COLORS.DANGER,
      value: formatWait(end - now),
    });
  } else if (waiting.length > 0) {
    const start = Math.min(...waiting.map((snap) => snap.next.start.getTime()));
    const preheating = snapshots.some((snap) => snap.preheat);
    components.push({
      type: 'value',
      label: {
        en: 'Next peak in',
        fr: 'Prochaine pointe',
        de: 'Nächste Spitze',
        es: 'Próxima punta',
      },
      icon: 'clock',
      color: preheating ? WIDGET_COLORS.WARNING : WIDGET_COLORS.INFO,
      value: formatWait(start - now),
    });
  }

  // The announced peaks, every offer together (the same peak of two offers
  // appears twice: each offer has its own credits and rules).
  const items = snapshots
    .flatMap((snap) => snap.upcoming.map((event) => ({ snap, event })))
    .sort((a, b) => a.event.start - b.event.start)
    .slice(0, shownCount(settings))
    .map(({ snap, event }) => ({
      title: localize((language) => describeSpan(event, language)),
      subtitle: localize((language) => offerName(snap.code, language)),
      date: event.start.toISOString(),
      badge: badgeOf(event, snap, now),
    }));
  if (items.length > 0) {
    components.push({ type: 'card-list', display: 'list', items });
  } else {
    components.push({
      type: 'text',
      variant: 'caption',
      text: {
        en: 'No peak announced. They come in winter, usually the day before.',
        fr: 'Aucune pointe annoncée. Elles arrivent en hiver, souvent la veille.',
        de: 'Keine Spitze angekündigt. Sie kommen im Winter, meist am Vortag.',
        es: 'Ninguna punta anunciada. Llegan en invierno, normalmente la víspera.',
      },
    });
  }

  components.push({
    type: 'status',
    items: snapshots.map((snap) => statusRow(snap)).slice(0, 10),
  });
  components.push(refreshButton, linkButton);
  return { ttl_seconds: 60, components };
}

export const WIDGETS = {
  [PEAKS_WIDGET]: {
    async get(engine, request) {
      return buildContent(engine, request);
    },

    async action(engine, { actionKey }) {
      if (actionKey !== WIDGET_ACTIONS.REFRESH) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      await engine.refreshNow();
      const count = followedOffers(engine.config).reduce(
        (total, code) =>
          total + snapshot(engine.feed.events, code, engine.now(), 0).upcoming.length,
        0,
      );
      return localize((language) =>
        pick(language, {
          en: `Hydro-Québec data refreshed: ${count} peak(s) announced.`,
          fr: `Données Hydro-Québec actualisées : ${count} pointe(s) annoncée(s).`,
          de: `Hydro-Québec-Daten aktualisiert: ${count} Spitze(n) angekündigt.`,
          es: `Datos de Hydro-Québec actualizados: ${count} punta(s) anunciada(s).`,
        }),
      );
    },
  },
};

/** Ask the core to re-pull every widget now (rate-limited core-side). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
