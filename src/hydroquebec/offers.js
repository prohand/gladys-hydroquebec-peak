// -----------------------------------------------------------------------------
// Hydro-Québec peak offers: how an offer is named, and how two names of the
// same offer are recognized as one.
//
// The open data names an offer in two shapes. The Opendatasoft dataset
// (`evenements-pointe`) uses the bare code — `CPC-D`, `TPC-DPC` — while the
// static feed this integration reads lists its offers, and has dated its winter
// events, with a label around the code: `Credit hivernal Residentiel (CPC-D)`.
// Offers with no code of their own (`OEA`, `ENG_100H_2F_7J`, `Chaine de bloc`)
// appear as is in both. So the CODE is what identifies an offer: the text
// between the last parentheses when there are some, the whole name otherwise.
//
// The code is also what the device external id is built from: it must never
// change for an offer, whichever shape Hydro-Québec happens to publish.
// -----------------------------------------------------------------------------

/**
 * The offers the configuration screen lists, residential first. Their codes
 * are the `value`s of the manifest `offers` multi_select: never renamed, the
 * user's choice is stored as is. Any other offer of the feed is reachable
 * through the `other_offers` free-text field.
 */
export const KNOWN_OFFERS = [
  {
    code: 'CPC-D',
    sector: 'residential',
    label: {
      en: 'Rate D with Winter Credit Option',
      fr: 'Tarif D avec option de crédits hivernaux',
      de: 'Tarif D mit Winter-Gutschrift-Option',
      es: 'Tarifa D con opción de créditos de invierno',
    },
  },
  {
    code: 'TPC-DPC',
    sector: 'residential',
    label: {
      en: 'Rate Flex D',
      fr: 'Tarif Flex D',
      de: 'Tarif Flex D',
      es: 'Tarifa Flex D',
    },
  },
  {
    code: 'CPC-G',
    sector: 'business',
    label: {
      en: 'Winter Credit Option, business',
      fr: 'Option de crédits hivernaux, affaires',
      de: 'Winter-Gutschrift-Option, Geschäftskunden',
      es: 'Opción de créditos de invierno, empresas',
    },
  },
  {
    code: 'TPC-GPC',
    sector: 'business',
    label: {
      en: 'Rate Flex G, business',
      fr: 'Tarif Flex G, affaires',
      de: 'Tarif Flex G, Geschäftskunden',
      es: 'Tarifa Flex G, empresas',
    },
  },
  {
    code: 'GDP-Affaires',
    sector: 'business',
    label: {
      en: 'Demand response, business',
      fr: 'Gestion de la demande de puissance, affaires',
      de: 'Lastmanagement, Geschäftskunden',
      es: 'Gestión de la demanda, empresas',
    },
  },
  {
    code: 'OEA',
    sector: 'business',
    label: {
      en: 'OEA, business',
      fr: 'OEA, affaires',
      de: 'OEA, Geschäftskunden',
      es: 'OEA, empresas',
    },
  },
];

/**
 * The code of an offer, from either shape of its name.
 *
 * @param {unknown} name `CPC-D`, `Credit hivernal Residentiel (CPC-D)`, `OEA`…
 * @returns {string} the code, trimmed; `''` for an empty or missing name
 */
export function offerCode(name) {
  const text = String(name ?? '').trim();
  const match = /\(([^()]+)\)\s*$/.exec(text);
  return (match ? match[1] : text).trim();
}

/**
 * The key two names are compared on: the code, without accents, case or
 * repeated spaces — `Chaîne de bloc` typed by hand is the feed's
 * `Chaine de bloc`.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function offerKey(name) {
  return offerCode(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Whether an event published for `published` belongs to the offer `code`.
 * @param {unknown} published the `offre` of an event
 * @param {string} code a followed offer
 */
export function sameOffer(published, code) {
  return offerKey(published) === offerKey(code);
}

/**
 * The platform id of the device of an offer: stable, ASCII, safe in an
 * external id (`Chaine de bloc` -> `chaine-de-bloc`).
 *
 * @param {string} code
 * @returns {string}
 */
export function offerSlug(code) {
  return offerKey(code)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The display name of an offer in one language: the label of a known offer
 * followed by its code, the code alone otherwise.
 *
 * @param {string} code
 * @param {string} [language]
 * @returns {string}
 */
export function offerName(code, language = 'en') {
  const known = KNOWN_OFFERS.find((offer) => offerKey(offer.code) === offerKey(code));
  if (!known) {
    return code;
  }
  return `${known.label[language] ?? known.label.en} (${known.code})`;
}
