import { describe, it, expect } from 'vitest';
import { buildGroups, acteursDe, GROUPE_PONCTUELS } from './timelineGroups.js';

const d = (iso, evt) => ({ evt, when: new Date(iso) });
const entities = [
  { id: 'e1', label: 'Jean Martin' },
  { id: 'e2', label: 'Société X' },
  { id: 'e3', label: 'Compte FR76' },
];

describe('acteurs d’un événement', () => {
  it('lit entityId pour un événement d’entité', () => {
    expect(acteursDe({ entityId: 'e1' }, entities)).toEqual(['e1']);
  });

  it('lit les deux extrémités d’un événement de lien', () => {
    // Sans ce champ, les événements de lien n'avaient aucun acteur et
    // tombaient tous dans le fourre-tout.
    expect(acteursDe({ acteurs: ['e1', 'e2'] }, entities)).toEqual(['e1', 'e2']);
  });

  it('ignore un acteur qui n’existe plus', () => {
    // Une entité supprimée laisse des commentaires et des liens derrière elle.
    expect(acteursDe({ acteurs: ['e1', 'disparue'] }, entities)).toEqual(['e1']);
  });

  it('rend un tableau vide pour un événement sans acteur', () => {
    expect(acteursDe({ kind: 'action' }, entities)).toEqual([]);
  });
});

describe('regroupement par nature', () => {
  it('ne crée que les voies effectivement utilisées', () => {
    const dated = [d('2024-01-01', { kind: 'date' }), d('2024-01-02', { kind: 'action' })];
    const { groups } = buildGroups(dated, 'nature', entities);
    expect(groups.map(g => g.id)).toEqual(['date', 'action']);
  });

  it('affecte chaque item à sa nature', () => {
    const { itemGroupe } = buildGroups([d('2024-01-01', { kind: 'comment' })], 'nature', entities);
    expect(itemGroupe({ kind: 'comment' })).toBe('comment');
  });
});

describe('regroupement par acteur', () => {
  const dated = [
    d('2024-03-01', { kind: 'date', entityId: 'e1' }),
    d('2024-02-01', { kind: 'comment', entityId: 'e1' }),
    d('2024-04-01', { kind: 'date', acteurs: ['e2', 'e3'] }),
    d('2024-05-01', { kind: 'comment', acteurs: ['e2', 'e3'] }),
    d('2024-06-01', { kind: 'action' }),                       // sans acteur
  ];

  it('donne une voie aux entités ayant au moins deux événements', () => {
    const { groups } = buildGroups(dated, 'acteur', entities);
    expect(groups.map(g => g.id)).toContain('e1');
    expect(groups.map(g => g.id)).toContain('e2');
  });

  it('nomme les voies avec le libellé de l’entité', () => {
    const { groups } = buildGroups(dated, 'acteur', entities);
    expect(groups.find(g => g.id === 'e1').content).toBe('Jean Martin');
  });

  it('trie les voies par première apparition', () => {
    // e1 apparaît en février, e2 en avril : l'ordre de lecture d'une chronologie.
    const { groups } = buildGroups(dated, 'acteur', entities);
    const ids = groups.map(g => g.id).filter(id => id !== GROUPE_PONCTUELS);
    expect(ids.indexOf('e1')).toBeLessThan(ids.indexOf('e2'));
  });

  it('regroupe les événements sans acteur dans « Ponctuels »', () => {
    const { itemGroupe } = buildGroups(dated, 'acteur', entities);
    expect(itemGroupe({ kind: 'action' })).toBe(GROUPE_PONCTUELS);
  });

  it('n’ajoute la voie « Ponctuels » que si elle sert', () => {
    const propres = [
      d('2024-01-01', { kind: 'date', entityId: 'e1' }),
      d('2024-01-02', { kind: 'comment', entityId: 'e1' }),
    ];
    const { groups } = buildGroups(propres, 'acteur', entities);
    expect(groups.map(g => g.id)).toEqual(['e1']);
  });

  it('renvoie une entité à événement unique vers « Ponctuels »', () => {
    // Sur cinquante entités, une voie par entité rendrait la frise illisible.
    const unSeul = [d('2024-01-01', { kind: 'date', entityId: 'e3' })];
    const { groups, itemGroupe } = buildGroups(unSeul, 'acteur', entities);
    expect(groups.map(g => g.id)).toEqual([GROUPE_PONCTUELS]);
    expect(itemGroupe({ entityId: 'e3' })).toBe(GROUPE_PONCTUELS);
  });

  it('place un événement de lien dans la voie d’une de ses extrémités', () => {
    const { itemGroupe } = buildGroups(dated, 'acteur', entities);
    expect(['e2', 'e3']).toContain(itemGroupe({ acteurs: ['e2', 'e3'] }));
  });

  it('tolère une liste d’entités vide', () => {
    const { groups, itemGroupe } = buildGroups(dated, 'acteur', []);
    expect(groups.map(g => g.id)).toEqual([GROUPE_PONCTUELS]);
    expect(itemGroupe({ entityId: 'e1' })).toBe(GROUPE_PONCTUELS);
  });

  it('affecte chaque événement daté à une voie existante', () => {
    // Invariant : aucun item ne doit pointer vers une voie absente, sinon
    // vis-timeline l'écarte silencieusement.
    const { groups, itemGroupe } = buildGroups(dated, 'acteur', entities);
    const ids = new Set(groups.map(g => g.id));
    for (const { evt } of dated) expect(ids.has(itemGroupe(evt))).toBe(true);
  });
});
