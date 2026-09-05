import { describe, it, expect } from 'vitest';
import { buildReplay, visibleAt, prochaineEtape, compteA } from './replay.js';

const T = iso => new Date(iso).getTime();
const ent = (id, iso) => ({ id, label: id, createdAt: iso });
const lien = (id, from, to, iso) => ({ id, from, to, createdAt: iso });

const graphe = {
  entities: [ent('e1', '2024-01-01T10:00:00Z'), ent('e2', '2024-01-02T10:00:00Z'), ent('e3', '2024-01-05T10:00:00Z')],
  links: [lien('l1', 'e1', 'e2', '2024-01-03T10:00:00Z'), lien('l2', 'e2', 'e3', '2024-01-06T10:00:00Z')],
  stickers: [],
  postits: [],
};

describe('préparation du rejeu', () => {
  it('borne la période sur le premier et le dernier ajout', () => {
    const r = buildReplay(graphe);
    expect(r.debut).toBe(T('2024-01-01T10:00:00Z'));
    expect(r.fin).toBe(T('2024-01-06T10:00:00Z'));
  });

  it('ne retient que les instants distincts, triés', () => {
    const r = buildReplay(graphe);
    expect(r.etapes).toHaveLength(5);
    expect(r.etapes).toEqual([...r.etapes].sort((a, b) => a - b));
  });

  it('compte les éléments sans date d’ajout', () => {
    // Les liens n'ont reçu `createdAt` qu'après coup : une enquête antérieure
    // en contient forcément.
    const r = buildReplay({ ...graphe, links: [...graphe.links, { id: 'vieux', from: 'e1', to: 'e2' }] });
    expect(r.sansDate).toBe(1);
    expect(r.total).toBe(6);
  });

  it('tolère un graphe entièrement dépourvu de dates', () => {
    const r = buildReplay({ entities: [{ id: 'a' }], links: [], stickers: [], postits: [] });
    expect(r.etapes).toEqual([]);
    expect(r.sansDate).toBe(1);
  });

  it('tolère un graphe vide', () => {
    expect(buildReplay({}).total).toBe(0);
  });
});

describe('filtrage à un instant', () => {
  it('ne montre que ce qui existait alors', () => {
    const v = visibleAt(graphe, T('2024-01-02T12:00:00Z'));
    expect(v.entities.map(e => e.id)).toEqual(['e1', 'e2']);
    expect(v.links).toHaveLength(0);
  });

  it('révèle le lien une fois ses deux extrémités présentes', () => {
    const v = visibleAt(graphe, T('2024-01-03T12:00:00Z'));
    expect(v.links.map(l => l.id)).toEqual(['l1']);
  });

  it('masque un lien dont une extrémité n’est pas encore apparue', () => {
    // Un trait vers une entité absente serait un trait dans le vide.
    const bancal = { ...graphe, links: [lien('l3', 'e1', 'e3', '2024-01-01T11:00:00Z')] };
    expect(visibleAt(bancal, T('2024-01-02T00:00:00Z')).links).toHaveLength(0);
  });

  it('affiche dès le début les éléments sans date', () => {
    const avec = { ...graphe, entities: [...graphe.entities, { id: 'ancien', label: 'Ancien' }] };
    const v = visibleAt(avec, T('2024-01-01T00:00:00Z'));
    expect(v.entities.map(e => e.id)).toEqual(['ancien']);
  });

  it('relie les post-its comme les entités', () => {
    const g = {
      entities: [ent('e1', '2024-01-01T10:00:00Z')],
      postits: [{ id: 'p1', createdAt: '2024-01-04T10:00:00Z' }],
      links: [lien('lp', 'e1', 'postit_p1', '2024-01-02T10:00:00Z')],
      stickers: [],
    };
    expect(visibleAt(g, T('2024-01-03T00:00:00Z')).links).toHaveLength(0);
    expect(visibleAt(g, T('2024-01-05T00:00:00Z')).links).toHaveLength(1);
  });

  it('rend le graphe intact hors rejeu', () => {
    expect(visibleAt(graphe, null)).toBe(graphe);
  });

  it('montre tout à la date finale', () => {
    const r = buildReplay(graphe);
    const v = visibleAt(graphe, r.fin);
    expect(v.entities).toHaveLength(3);
    expect(v.links).toHaveLength(2);
  });
});

describe('avance par étapes', () => {
  it('saute au prochain instant où quelque chose apparaît', () => {
    // Une enquête menée sur six mois avec trois journées actives ne doit pas
    // se rejouer en six mois de vide.
    const { etapes, debut } = buildReplay(graphe);
    expect(prochaineEtape(etapes, debut)).toBe(T('2024-01-02T10:00:00Z'));
  });

  it('rend null une fois la fin atteinte', () => {
    const { etapes, fin } = buildReplay(graphe);
    expect(prochaineEtape(etapes, fin)).toBeNull();
  });
});

describe('avancement', () => {
  it('progresse de façon monotone', () => {
    const { etapes } = buildReplay(graphe);
    const comptes = etapes.map(t => compteA(graphe, t));
    for (let i = 1; i < comptes.length; i++) expect(comptes[i]).toBeGreaterThanOrEqual(comptes[i - 1]);
  });

  it('atteint le total à la fin', () => {
    const { fin } = buildReplay(graphe);
    expect(compteA(graphe, fin)).toBe(5);
  });
});
