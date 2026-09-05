import { describe, it, expect } from 'vitest';
import { themes, resolveTheme, pluginPalettes } from './theme.jsx';
import { LINK_STRENGTHS, getStrengthFromConfidence } from './constants.jsx';
import { REQUIRED_THEME_KEYS } from '../plugins/core/engine.js';

/**
 * Le thème doit piloter les couleurs d'ÉTAT.
 *
 * Il définissait `danger` et `success` sans que presque personne ne les
 * utilise : 12 usages contre 174 valeurs écrites en hexadécimal - dont deux
 * verts et deux rouges différents dans la même application. Conséquence, le
 * sélecteur de thème ne changeait ni les pastilles de confiance, ni les
 * statuts, ni les flèches de lien.
 */

const JETONS_SEMANTIQUES = ['success', 'danger', 'warning', 'info'];

describe('jetons de thème', () => {
  it('chaque thème intégré porte les jetons sémantiques', () => {
    for (const [nom, palette] of Object.entries(themes)) {
      for (const k of JETONS_SEMANTIQUES) {
        expect(palette[k], `${nom}.${k}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('les thèmes clair et sombre ne partagent pas les mêmes valeurs d’état', () => {
    // Sinon le thème clair afficherait des couleurs pensées pour du sombre.
    for (const k of JETONS_SEMANTIQUES) {
      expect(themes.light[k]).not.toBe(themes.dark[k]);
    }
  });

  it('les thèmes intégrés couvrent toutes les clés exigées des plugins', () => {
    for (const [nom, palette] of Object.entries(themes)) {
      const manquantes = REQUIRED_THEME_KEYS.filter(k => !palette[k]);
      expect(manquantes, `${nom}`).toEqual([]);
    }
  });
});

describe('fiabilité des liens', () => {
  it('chaque palier désigne un jeton, pas une teinte', () => {
    // `tone: "success"` et non `badgeColor: "#10b981"` : c'est ce qui permet
    // au thème de reprendre la main.
    for (const s of LINK_STRENGTHS) {
      expect(s.badgeColor, `${s.id} ne doit plus porter de couleur en dur`).toBeUndefined();
      expect(typeof s.tone).toBe('string');
    }
  });

  it('chaque jeton existe dans tous les thèmes', () => {
    for (const s of LINK_STRENGTHS) {
      for (const [nom, palette] of Object.entries(themes)) {
        expect(palette[s.tone], `${nom}.${s.tone} (palier ${s.id})`).toBeTruthy();
      }
    }
  });

  it('les paliers se résolvent en couleurs distinctes', () => {
    // Deux paliers de fiabilité qui rendent la même couleur seraient
    // indiscernables sur le graphe.
    const rendus = LINK_STRENGTHS.map(s => themes.dark[s.tone]);
    expect(new Set(rendus).size).toBe(LINK_STRENGTHS.length);
  });

  it('les seuils de confiance restent 70 / 30 / 1', () => {
    expect(getStrengthFromConfidence(70).id).toBe('confirmed');
    expect(getStrengthFromConfidence(69).id).toBe('probable');
    expect(getStrengthFromConfidence(30).id).toBe('probable');
    expect(getStrengthFromConfidence(29).id).toBe('possible');
    expect(getStrengthFromConfidence(0).id).toBe('unknown');
  });
});

/**
 * `om_theme` ne contient pas seulement `dark` ou `light` : le graphe y écrit
 * aussi les thèmes de plugin, préfixés. Une lecture directe de `themes[id]`
 * rendait `undefined`, et l'écran plantait à la première couleur lue -
 * le tableau de bord était inaccessible dès qu'on avait choisi « Café crème ».
 */
describe('résolution du thème courant', () => {
  const cafe = { ...themes.dark, surfaceAlt: '#e8dcc8' };

  it('résout les thèmes intégrés', () => {
    expect(resolveTheme('dark')).toBe(themes.dark);
    expect(resolveTheme('light')).toBe(themes.light);
  });

  it('résout un thème apporté par un plugin', () => {
    expect(resolveTheme('themes:cafe', { 'themes:cafe': cafe })).toBe(cafe);
  });

  /** Le cas exact du plantage : identifiant de plugin, sans palette fournie. */
  it('retombe sur dark pour un identifiant inconnu, jamais undefined', () => {
    for (const id of ['themes:cafe', 'inexistant', '', null, undefined]) {
      const t = resolveTheme(id);
      expect(t, String(id)).toBeTruthy();
      expect(t.surfaceAlt, String(id)).toBeTruthy();
    }
  });

  it('retombe sur dark quand le plugin fournisseur a été désactivé', () => {
    // getThemes() ne rend que les plugins activés : la palette disparaît de
    // `extra` alors que l'identifiant reste stocké.
    expect(resolveTheme('themes:cafe', {})).toBe(themes.dark);
  });

  it('aplatit les thèmes de plugin en palettes', () => {
    const engine = { getThemes: () => ({ 'themes:cafe': { id: 'cafe', colors: cafe } }) };
    expect(pluginPalettes(engine)).toEqual({ 'themes:cafe': cafe });
  });

  it('tolère un moteur absent ou un thème sans couleurs', () => {
    expect(pluginPalettes(null)).toEqual({});
    expect(pluginPalettes({ getThemes: () => ({ 'x:y': { id: 'y' } }) })).toEqual({});
  });
});
