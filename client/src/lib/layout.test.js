import { describe, it, expect } from 'vitest';
import {
  ENT_W, ENT_H, MIN_GAP_ENT,
  entitiesOverlap, countOverlaps, resolveOverlapPositions, maxPassesOverlap,
} from './layout.js';

/** Applique le résultat et rend la nouvelle liste. */
const appliquer = (items, figees) => {
  const { positions } = resolveOverlapPositions(items, figees);
  return items.map(e => ({ ...e, ...positions.get(e.id) }));
};

describe('anti-chevauchement', () => {
  it('sépare deux entités superposées', () => {
    // L'ancienne version poussait de `pénétration / 2`, ce qui laissait
    // 70 px de recouvrement : diviser par deux suppose que les DEUX bougent.
    const out = appliquer([{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 150, y: 120 }], 'A');
    expect(entitiesOverlap(out[0], out[1])).toBe(false);
  });

  it("ne déplace jamais l'entité figée", () => {
    const out = appliquer([{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 150, y: 120 }], 'A');
    expect(out[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('fige un lot entier sans altérer son agencement interne', () => {
    const lot = [{ id: 'L0', x: 500, y: 300 }, { id: 'L1', x: 740, y: 300 }, { id: 'L2', x: 620, y: 400 }];
    const autres = [{ id: 'X', x: 560, y: 320 }, { id: 'Y', x: 700, y: 380 }];
    const out = appliquer([...lot, ...autres], lot.map(e => e.id));
    for (const e of lot) expect(out.find(o => o.id === e.id)).toMatchObject({ x: e.x, y: e.y });
    expect(countOverlaps(out)).toBe(0);
  });

  it('résout en cascade au lieu de projeter B dans C', () => {
    // Une seule passe faisait passer le graphe de 1 à 2 chevauchements.
    const out = appliquer(
      [{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 180, y: 100 }, { id: 'C', x: 400, y: 100 }], 'A');
    expect(countOverlaps(out)).toBe(0);
  });

  it("traite les paires qui ne touchent pas l'entité déplacée", () => {
    const out = appliquer(
      [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 600, y: 300 }, { id: 'C', x: 640, y: 320 }], 'A');
    expect(countOverlaps(out)).toBe(0);
  });

  it("ne déplace que l'axe de moindre pénétration", () => {
    const out = appliquer([{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 280, y: 150 }], 'A');
    const b = out[1];
    expect((b.x !== 280) !== (b.y !== 150)).toBe(true); // un seul axe a bougé
  });

  it('sépare deux entités aux coordonnées identiques', () => {
    const out = appliquer([{ id: 'A', x: 200, y: 200 }, { id: 'B', x: 200, y: 200 }], 'A');
    expect(entitiesOverlap(out[0], out[1])).toBe(false);
  });

  it('laisse la marge demandée entre les entités séparées', () => {
    const out = appliquer([{ id: 'A', x: 100, y: 100 }, { id: 'B', x: 150, y: 100 }], 'A');
    const dx = Math.abs(out[0].x - out[1].x), dy = Math.abs(out[0].y - out[1].y);
    expect(dx >= ENT_W + MIN_GAP_ENT || dy >= ENT_H + MIN_GAP_ENT).toBe(true);
  });

  it('ne signale aucun déplacement quand rien ne se chevauche', () => {
    const { moved } = resolveOverlapPositions(
      [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 500, y: 500 }], 'A');
    expect(moved).toHaveLength(0);
  });

  it('ne dégrade jamais la situation (200 dispositions aléatoires)', () => {
    // C'était le défaut majeur de la version d'origine : sur 25 entités et
    // 200 déplacements, elle passait de 17 chevauchements à 21.
    let rng = 99; const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let pires = 0;
    for (let k = 0; k < 200; k++) {
      const items = Array.from({ length: 12 }, (_, i) => ({
        id: 'e' + i, x: Math.round(rnd() * 900), y: Math.round(rnd() * 500),
      }));
      const avant = countOverlaps(items);
      if (countOverlaps(appliquer(items, items[0].id)) > avant) pires++;
    }
    expect(pires).toBe(0);
  });

  it('respecte le budget de temps sur un graphe insoluble', () => {
    // Surface très inférieure à la place nécessaire : aucune disposition ne
    // sépare tout le monde. Le budget évite d'y perdre du temps.
    const items = Array.from({ length: 60 }, (_, i) => ({ id: 'e' + i, x: (i % 8) * 40, y: Math.floor(i / 8) * 20 }));
    let t = 0;
    const res = resolveOverlapPositions(items, null, { now: () => (t += 5) });
    expect(res.budgetHit).toBe(true);
    expect(res.passes).toBeLessThan(maxPassesOverlap(items.length));
  });

  it('borne le nombre de passes selon la taille du graphe', () => {
    expect(maxPassesOverlap(5)).toBe(40);      // plancher
    expect(maxPassesOverlap(30)).toBe(90);
    expect(maxPassesOverlap(500)).toBe(150);   // plafond
  });
});
