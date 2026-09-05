import { describe, it, expect } from 'vitest';
import { LINK_TYPES, LINK_STRENGTHS, CATEGORIES } from './constants.jsx';
import { themes } from './theme.jsx';

/**
 * Deux familles de couleurs, deux règles.
 *
 * **Identité** (catégorie d'entité, type de relation) : la couleur désigne une
 * DONNÉE et reste stable d'un thème à l'autre - sinon un lieu changerait de
 * couleur en passant au thème sombre, et le repère visuel serait perdu.
 *
 * **État** (fiabilité d'un lien, statut d'une entité) : la couleur exprime une
 * qualification et doit suivre le thème, via un jeton.
 *
 * Confondre les deux a produit un `t is not defined` : trois entrées de
 * LINK_TYPES avaient été converties en jetons alors qu'elles sont définies au
 * niveau module, où `t` n'existe pas.
 */

describe('couleurs d’identité (stables)', () => {
  it('LINK_TYPES porte des teintes littérales, jamais de jeton', () => {
    for (const lt of LINK_TYPES) {
      expect(lt.color, `${lt.id}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('chaque type de relation a une icône', () => {
    // La copie du monolithe portait les icônes, pas celle de constants : la
    // consolidation ne doit pas les avoir perdues.
    for (const lt of LINK_TYPES) expect(lt.icon, `${lt.id}`).toBeTruthy();
  });

  it('les catégories d’entité gardent des teintes littérales', () => {
    for (const c of CATEGORIES) {
      if (c.color) expect(c.color, `${c.id}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('couleurs d’état (thématisées)', () => {
  it('LINK_STRENGTHS désigne des jetons, jamais des teintes', () => {
    for (const s of LINK_STRENGTHS) {
      expect(s.tone, `${s.id}`).toMatch(/^[a-zA-Z]+$/);
      expect(s.badgeColor, `${s.id}`).toBeUndefined();
    }
  });

  it('tous les jetons existent dans chaque thème', () => {
    for (const s of LINK_STRENGTHS) {
      for (const [nom, palette] of Object.entries(themes)) {
        expect(palette[s.tone], `${nom}.${s.tone}`).toBeTruthy();
      }
    }
  });
});

describe('source unique', () => {
  it('LINK_TYPES et LINK_STRENGTHS sont exportés depuis constants', () => {
    // Ils étaient dupliqués dans le monolithe, et les copies avaient divergé.
    expect(Array.isArray(LINK_TYPES)).toBe(true);
    expect(Array.isArray(LINK_STRENGTHS)).toBe(true);
  });

  it('aucun identifiant en double', () => {
    for (const table of [LINK_TYPES, LINK_STRENGTHS]) {
      const ids = table.map(x => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
