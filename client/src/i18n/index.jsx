/**
 * Application translation (FR / EN / DE).
 *
 * Home-grown, dependency-free: the need comes down to substitution,
 * interpolation and plurals, and `Intl.PluralRules` is built in. Adding i18next
 * would cost ~40 kB gzipped in an already heavy bundle.
 *
 * ── What is NOT translated ──────────────────────────────────────────────────
 * Investigation data: titles, entity labels, notes, comments, chat, action log.
 * They belong to the user. A graph built in French stays in French for a
 * colleague reading the interface in German - translating it would falsify a
 * piece of evidence.
 *
 * ── Loading ─────────────────────────────────────────────────────────────────
 * French is imported statically: it is the source language AND the fallback for
 * any key missing elsewhere. English and German arrive through `import()`, so
 * only the active language is downloaded.
 */
import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import fr from './fr.js';

export const LANGUES = [
  { code: 'fr', nom: 'Français', drapeau: '🇫🇷' },
  { code: 'en', nom: 'English', drapeau: '🇬🇧' },
  { code: 'de', nom: 'Deutsch', drapeau: '🇩🇪' },
];
export const CODES = LANGUES.map(l => l.code);
const CLE_STOCKAGE = 'om_lang';

const chargeurs = {
  fr: async () => fr,
  en: () => import('./en.js').then(m => m.default),
  de: () => import('./de.js').then(m => m.default),
};
const cache = { fr };

/** Language on first render: remembered choice, else the browser's, else FR. */
export function langueInitiale() {
  try {
    const memorisee = localStorage.getItem(CLE_STOCKAGE);
    if (CODES.includes(memorisee)) return memorisee;
  } catch { /* storage denied: carry on */ }
  const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  return CODES.includes(nav) ? nav : 'fr';
}

const manquantes = new Set();
function signalerManquante(cle, langue) {
  const signature = `${langue}:${cle}`;
  if (manquantes.has(signature)) return;
  manquantes.add(signature);
  if (import.meta.env?.DEV) console.warn(`[i18n] clé manquante : ${cle} (${langue})`);
}

/**
 * Substitutes `{nom}` with `params.nom`. A missing value leaves the placeholder
 * in place rather than writing "undefined" into the interface.
 */
function interpoler(chaine, params) {
  if (!params) return chaine;
  return chaine.replace(/\{(\w+)\}/g, (marqueur, nom) =>
    params[nom] === undefined || params[nom] === null ? marqueur : String(params[nom]));
}

/**
 * Resolves a key, taking plurals into account when `params.n` is given: `cle`
 * is looked up as `cle#one`, `cle#other`… depending on the category returned by
 * `Intl.PluralRules`. The separator is "#" and not "_": real ids end in
 * `_other` (`entites.type.person_other`, "Other / Unknown") and would be
 * mistaken for plural forms.
 *
 * French and English only have two forms, but the rule differs at zero:
 * "0 enquête" is singular in French, "0 investigations" plural in English.
 */
function resoudre(dico, cle, params, pluriels) {
  if (params && typeof params.n === 'number') {
    const categorie = pluriels.select(params.n);
    const variante = dico[`${cle}#${categorie}`] ?? dico[`${cle}#other`];
    if (variante !== undefined) return variante;
  }
  return dico[cle];
}

export function creerT(dico, langue) {
  const pluriels = new Intl.PluralRules(langue);
  return function t(cle, params) {
    let valeur = resoudre(dico, cle, params, pluriels);
    if (valeur === undefined) {
      signalerManquante(cle, langue);
      valeur = resoudre(fr, cle, params, new Intl.PluralRules('fr'));
    }
    if (valeur === undefined) return cle;   // visible, therefore fixable
    return interpoler(valeur, params);
  };
}

const Contexte = createContext({ langue: 'fr', t: creerT(fr, 'fr'), changerLangue: () => {}, pret: true });

export function I18nProvider({ children }) {
  const [langue, setLangue] = useState(langueInitiale);
  const [dico, setDico] = useState(() => cache[langueInitiale()] || fr);
  const [pret, setPret] = useState(() => Boolean(cache[langueInitiale()]));

  useEffect(() => {
    let vivant = true;
    document.documentElement.lang = langue;
    localeCourante = langue;
    if (cache[langue]) { setDico(cache[langue]); setPret(true); return; }
    setPret(false);
    chargeurs[langue]().then(d => {
      cache[langue] = d;
      if (vivant) { setDico(d); setPret(true); }
    }).catch(() => {
      // Dictionary unreachable: stay in French rather than showing raw keys.
      // The user gets a coherent interface either way.
      if (vivant) { setDico(fr); setPret(true); }
    });
    return () => { vivant = false; };
  }, [langue]);

  const changerLangue = useCallback((code) => {
    if (!CODES.includes(code)) return;
    setLangue(code);
    try { localStorage.setItem(CLE_STOCKAGE, code); } catch { /* storage denied */ }
  }, []);

  const valeur = useMemo(() => {
    const t = creerT(dico, langue);
    tCourant = t;   // for `traduire()`, outside components
    return { langue, pret, changerLangue, t };
  }, [langue, dico, pret, changerLangue]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/** The usual hook: `const t = useT();` then `t('ma.cle')`. */
export function useT() { return useContext(Contexte).t; }

/**
 * Current locale, for date formatters that are not components.
 *
 * `fmtDate` and friends live at module level in the monolith and are called
 * from dozens of places: passing the language as a parameter would mean
 * touching every call site. We therefore expose the value, kept up to date by
 * the provider. Do NOT use `undefined` as the locale: that follows the
 * BROWSER's language, not the one chosen in the application.
 */
let localeCourante = 'fr';
export const getLocale = () => localeCourante;

/**
 * Translation usable OUTSIDE components (`lib/api.js`, PDF export…).
 *
 * `useT()` remains the normal path: this shortcut exists for modules that have
 * no React context. It returns `repli` when the key is missing, which lets us
 * show the server's raw message rather than a key.
 */
let tCourant = creerT(fr, 'fr');
export function traduire(cle, params, repli) {
  const dico = cache[localeCourante] || fr;
  if (!(cle in dico) && !(`${cle}#other` in dico)) return repli !== undefined ? repli : cle;
  return tCourant(cle, params);
}

/** For components that also need to read or change the language. */
export function useLangue() {
  const { langue, changerLangue, pret } = useContext(Contexte);
  return { langue, changerLangue, pret };
}
