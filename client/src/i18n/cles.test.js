/**
 * Garde-fou de la traduction.
 *
 * Avec ~900 clés sur trois langues, la dérive est mécaniquement certaine :
 * une clé ajoutée en français et oubliée ailleurs ne se voit qu'en changeant
 * de langue, écran par écran. Ces tests la font échouer au build.
 *
 * Ils vérifient aussi la cohérence des marqueurs d'interpolation : une
 * traduction qui écrit `{name}` là où le français écrit `{nom}` afficherait le
 * marqueur brut à l'utilisateur, et rien ne le signalerait à l'exécution.
 */
import { describe, it, expect } from 'vitest';
import fr from './fr.js';
import en from './en.js';
import de from './de.js';
import { creerT } from './index.jsx';
import { CATEGORIES, LINK_TYPES } from '../lib/constants.jsx';

const langues = { en, de };
const marqueurs = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('dictionnaires', () => {
  it('le français ne contient aucune valeur vide', () => {
    const vides = Object.entries(fr).filter(([, v]) => !String(v).trim()).map(([k]) => k);
    expect(vides).toEqual([]);
  });

  for (const [code, dico] of Object.entries(langues)) {
    it(`${code} : aucune clé manquante par rapport au français`, () => {
      expect(Object.keys(fr).filter(k => !(k in dico))).toEqual([]);
    });

    it(`${code} : aucune clé en trop`, () => {
      expect(Object.keys(dico).filter(k => !(k in fr))).toEqual([]);
    });

    it(`${code} : aucune valeur vide`, () => {
      expect(Object.entries(dico).filter(([, v]) => !String(v).trim()).map(([k]) => k)).toEqual([]);
    });

    it(`${code} : autant de sauts de ligne que le français`, () => {
      // Un générateur qui ré-échappe une valeur transforme « \n » en deux
      // caractères littéraux : le message s'affiche alors sur une seule ligne
      // avec un « \n » visible, et aucun test de clés ne le remarque.
      const compte = (s) => (String(s).match(/\n/g) || []).length;
      const ecarts = Object.keys(fr)
        .filter(k => k in dico && compte(fr[k]) !== compte(dico[k]))
        .map(k => `${k} : fr=${compte(fr[k])} ${code}=${compte(dico[k])}`);
      expect(ecarts).toEqual([]);
    });

    it(`${code} : aucune séquence d'échappement littérale`, () => {
      const suspects = Object.entries(dico).filter(([, v]) => /\\[nt]/.test(String(v))).map(([k]) => k);
      expect(suspects).toEqual([]);
    });

    it(`${code} : mêmes marqueurs d'interpolation que le français`, () => {
      const ecarts = Object.keys(fr)
        .filter(k => k in dico)
        .filter(k => marqueurs(fr[k]).join() !== marqueurs(dico[k]).join())
        .map(k => `${k} : fr={${marqueurs(fr[k])}} ${code}={${marqueurs(dico[k])}}`);
      expect(ecarts).toEqual([]);
    });
  }

  it('toute clé au pluriel a ses deux formes dans les trois langues', () => {
    // Le séparateur est « # » : des identifiants d'entité se terminent par
    // `_other` (« Autre / Inconnu ») et seraient pris pour des pluriels.
    const bases = new Set(Object.keys(fr).filter(k => /#(one|other)$/.test(k)).map(k => k.replace(/#(one|other)$/, '')));
    const manques = [];
    for (const base of bases) {
      for (const [code, dico] of Object.entries({ fr, ...langues })) {
        for (const forme of ['one', 'other']) {
          if (!(`${base}#${forme}` in dico)) manques.push(`${code}:${base}_${forme}`);
        }
      }
    }
    expect(manques).toEqual([]);
  });
});

describe('familles de clés construites à l\'exécution', () => {
  // `tr('statut.' + id)` est invisible pour un contrôle statique : la clé
  // n'existe qu'au moment de l'appel. Ces familles sont donc listées ici, avec
  // toutes leurs valeurs possibles - une valeur ajoutée au code sans sa
  // traduction fait échouer le test.
  const familles = {
    'statut.': ['confirmed', 'unverified', 'denied', 'archived'],
    'sticker.': ['thumbsup', 'thumbsdown', 'question', 'exclamation', 'warning', 'check', 'cross',
                 'star', 'fire', 'eye', 'lock', 'flag', 'target', 'clock2', 'skull', 'money'],
    'admin.onglet.': ['users', 'stats', 'audit'],
    'admin.role.': ['ADMIN', 'ANALYST', 'VIEWER'],
    'otan.fiab.': ['A', 'B', 'C', 'D', 'E', 'F'],
    'otan.cred.': ['1', '2', '3', '4', '5', '6'],
    'frise.voie.': ['date', 'comment', 'action', 'remote', 'ponctuels'],
    'erreurs.action.': ['demote', 'deactivate', 'delete'],
  };

  for (const [prefixe, valeurs] of Object.entries(familles)) {
    it(`${prefixe}* est complet dans les trois langues`, () => {
      const manques = [];
      for (const [code, dico] of Object.entries({ fr, en, de })) {
        for (const v of valeurs) if (!(`${prefixe}${v}` in dico)) manques.push(`${code}:${prefixe}${v}`);
      }
      expect(manques).toEqual([]);
    });
  }

  it('les échelles OTAN ont aussi leurs descriptions', () => {
    const manques = [];
    for (const [code, dico] of Object.entries({ fr, en, de })) {
      for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) if (!(`otan.fiab.${id}.desc` in dico)) manques.push(`${code}:otan.fiab.${id}.desc`);
      for (const id of ['1', '2', '3', '4', '5', '6']) if (!(`otan.cred.${id}.desc` in dico)) manques.push(`${code}:otan.cred.${id}.desc`);
    }
    expect(manques).toEqual([]);
  });

  it('chaque catégorie et sous-type du catalogue a sa traduction', () => {
    const manques = [];
    for (const c of CATEGORIES) {
      for (const [code, dico] of Object.entries({ fr, en, de })) {
        if (!(`entites.cat.${c.id}` in dico)) manques.push(`${code}:entites.cat.${c.id}`);
        for (const it of c.items) {
          if (!(`entites.type.${it.id}` in dico)) manques.push(`${code}:entites.type.${it.id}`);
          if (!(`entites.type.${it.id}.desc` in dico)) manques.push(`${code}:entites.type.${it.id}.desc`);
        }
      }
    }
    expect(manques).toEqual([]);
  });

  it('chaque type de lien a sa traduction', () => {
    const manques = [];
    for (const l of LINK_TYPES) {
      for (const [code, dico] of Object.entries({ fr, en, de })) {
        if (!(`liens.type.${l.id}` in dico)) manques.push(`${code}:liens.type.${l.id}`);
      }
    }
    expect(manques).toEqual([]);
  });
});

describe('creerT', () => {
  it('substitue les paramètres', () => {
    const t = creerT({ 'x': 'Bonjour {nom}' }, 'fr');
    expect(t('x', { nom: 'Alice' })).toBe('Bonjour Alice');
  });

  it('laisse le marqueur en place plutôt que d\'écrire « undefined »', () => {
    const t = creerT({ 'x': 'Bonjour {nom}' }, 'fr');
    expect(t('x', {})).toBe('Bonjour {nom}');
  });

  it('choisit la forme du pluriel selon la langue', () => {
    const dico = { 'c#one': '{n} enquête', 'c#other': '{n} enquêtes' };
    const tf = creerT(dico, 'fr');
    expect(tf('c', { n: 1 })).toBe('1 enquête');
    expect(tf('c', { n: 2 })).toBe('2 enquêtes');
    // Zéro : singulier en français, pluriel en anglais. C'est exactement le
    // genre d'écart qu'une implémentation maison rate si elle teste `n > 1`.
    expect(tf('c', { n: 0 })).toBe('0 enquête');
    const te = creerT({ 'c#one': '{n} case', 'c#other': '{n} cases' }, 'en');
    expect(te('c', { n: 0 })).toBe('0 cases');
  });

  it('retombe sur le français quand la clé manque', () => {
    const t = creerT({}, 'en');
    expect(t('commun.annuler')).toBe(fr['commun.annuler']);
  });

  it('rend la clé elle-même si elle n\'existe nulle part — visible, donc corrigeable', () => {
    const t = creerT({}, 'en');
    expect(t('zone.inconnue')).toBe('zone.inconnue');
  });
});
