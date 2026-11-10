// -----------------------------------------------------------------------------
// The buttons of the Configuration screen (manifest `actions`).
//
//   test_connection  read the feed now and say, per followed offer, how many
//                    peaks are announced and which one comes next
//   list_offers      list every offer the feed publishes, with the code to
//                    type in "Other offers" for the ones the select lacks
//
// The answer is shown under the button, in the reader's language.
// -----------------------------------------------------------------------------

import { followedOffers } from './config.js';
import { NO_OFFER_MESSAGE } from './engine.js';
import { offerCode, offerName, sameOffer } from './hydroquebec/offers.js';
import { eventsOf, snapshot } from './hydroquebec/schedule.js';
import { localize, pick } from './i18n.js';
import { describeSpan } from './time.js';

/** Keys of the manifest `actions`. Never renamed. */
export const ACTION_KEYS = {
  TEST_CONNECTION: 'test_connection',
  LIST_OFFERS: 'list_offers',
};

function failure(err) {
  const reason = String(err?.message ?? err).slice(0, 200);
  return localize((language) =>
    pick(language, {
      en: `Hydro-Québec open data could not be read: ${reason}`,
      fr: `Impossible de lire les données ouvertes d'Hydro-Québec : ${reason}`,
      de: `Die offenen Daten von Hydro-Québec konnten nicht gelesen werden: ${reason}`,
      es: `No se pudieron leer los datos abiertos de Hydro-Québec: ${reason}`,
    }),
  );
}

function offerLine(engine, code, language) {
  const feed = engine.feed;
  const listed = feed.offers.some((offer) => sameOffer(offer, code));
  const snap = snapshot(feed.events, code, engine.now(), engine.config.preheat_minutes);
  const season = eventsOf(feed.events, code).length;
  const name = offerName(code, language);
  if (!listed && season === 0) {
    return pick(language, {
      en: `${name}: unknown to Hydro-Québec this season — check the code with "List the offers".`,
      fr: `${name} : inconnue d'Hydro-Québec cette saison — vérifiez le code avec « Lister les offres ».`,
      de: `${name}: Hydro-Québec in dieser Saison unbekannt — prüfe den Code mit „Angebote auflisten“.`,
      es: `${name}: desconocida para Hydro-Québec esta temporada — compruebe el código con «Listar las ofertas».`,
    });
  }
  const upcoming = snap.upcoming.length;
  const next = snap.focus ? describeSpan(snap.focus, language) : null;
  return pick(language, {
    en: `${name}: ${upcoming} peak(s) announced${next ? `, next ${next}` : ''}; ${season} published this season.`,
    fr: `${name} : ${upcoming} pointe(s) annoncée(s)${next ? `, prochaine ${next}` : ''} ; ${season} publiée(s) cette saison.`,
    de: `${name}: ${upcoming} Spitze(n) angekündigt${next ? `, nächste ${next}` : ''}; ${season} in dieser Saison veröffentlicht.`,
    es: `${name}: ${upcoming} punta(s) anunciada(s)${next ? `, próxima ${next}` : ''}; ${season} publicada(s) esta temporada.`,
  });
}

export const ACTIONS = {
  async [ACTION_KEYS.TEST_CONNECTION](engine) {
    try {
      await engine.refreshNow();
    } catch (err) {
      return failure(err);
    }
    const offers = followedOffers(engine.config);
    if (offers.length === 0) {
      return NO_OFFER_MESSAGE;
    }
    return localize((language) => {
      const head = pick(language, {
        en: `Hydro-Québec open data reached (${engine.feed.offers.length} offers published).`,
        fr: `Données ouvertes d'Hydro-Québec jointes (${engine.feed.offers.length} offres publiées).`,
        de: `Offene Daten von Hydro-Québec erreicht (${engine.feed.offers.length} Angebote veröffentlicht).`,
        es: `Datos abiertos de Hydro-Québec alcanzados (${engine.feed.offers.length} ofertas publicadas).`,
      });
      return [head, ...offers.map((code) => offerLine(engine, code, language))].join('\n');
    });
  },

  async [ACTION_KEYS.LIST_OFFERS](engine) {
    try {
      await engine.refreshNow();
    } catch (err) {
      return failure(err);
    }
    const codes = [...new Set(engine.feed.offers.map(offerCode))];
    return localize((language) => {
      const head = pick(language, {
        en: `Offers published by Hydro-Québec this season (code to type in "Other offers"):`,
        fr: `Offres publiées par Hydro-Québec cette saison (code à saisir dans « Autres offres ») :`,
        de: `Von Hydro-Québec in dieser Saison veröffentlichte Angebote (Code für „Weitere Angebote“):`,
        es: `Ofertas publicadas por Hydro-Québec esta temporada (código para «Otras ofertas»):`,
      });
      return [head, ...codes.map((code) => `- ${code}`)].join('\n');
    });
  },
};
