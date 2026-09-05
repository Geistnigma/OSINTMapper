/**
 * Regroupement des événements de la frise chronologique.
 *
 * Deux lectures d'une même enquête :
 *   - **par nature** : Dates, Commentaires, Actions, Collaborateurs - répond à
 *     « que s'est-il passé ? » ;
 *   - **par acteur** : une voie par entité concernée - répond à « qui fait
 *     quoi, et quand ? », la question d'une enquête complexe.
 *
 * Extrait du composant pour être testable : la logique est purement
 * arithmétique et n'a pas besoin de vis-timeline ni du DOM.
 */

/**
 * Voies du mode « nature ». Le libellé et l'infobulle viennent du dictionnaire
 * (`frise.voie.<id>`) : ce module reste pur et testable sans contexte React,
 * `buildGroups` reçoit donc la fonction de traduction en paramètre.
 */
export const GROUPS_NATURE = [
  { id: 'date', icone: '📅' },
  { id: 'comment', icone: '💬' },
  { id: 'action', icone: '⚡' },
  { id: 'remote', icone: '👥' },
];

/** Voie fourre-tout du mode acteur. */
export const GROUPE_PONCTUELS = '__autres';

/** Nombre minimum d'événements pour qu'une entité obtienne sa propre voie. */
export const MIN_EVENEMENTS_VOIE = 2;

/**
 * Acteurs d'un événement, restreints aux entités réellement présentes.
 * Un événement de lien porte ses deux extrémités (`acteurs`), un événement
 * d'entité porte `entityId`.
 */
export function acteursDe(evt, entities) {
  const ids = evt.acteurs || (evt.entityId ? [evt.entityId] : []);
  return ids.filter(id => entities.some(e => e.id === id));
}

/**
 * Construit les voies et la fonction d'affectation d'un item.
 *
 * @param {Array<{evt:object, when:Date}>} dated événements datés
 * @param {string} mode 'nature' | 'acteur'
 * @param {Array<{id:string,label:string}>} entities
 * @returns {{groups:Array, itemGroupe:(evt:object)=>string}}
 */
export function buildGroups(dated, mode, entities = [], tr = (k) => k) {
  if (mode !== 'acteur') {
    const used = new Set(dated.map(({ evt }) => evt.kind));
    return {
      groups: GROUPS_NATURE.filter(g => used.has(g.id))
        .map(g => ({ id: g.id, content: `${g.icone} ${tr('frise.voie.' + g.id)}`, title: tr('frise.voie.' + g.id + '.titre') })),
      itemGroupe: evt => evt.kind,
    };
  }

  const parEntite = new Map(); // id → { n, premier }
  for (const { evt, when } of dated) {
    for (const id of acteursDe(evt, entities)) {
      const cur = parEntite.get(id) || { n: 0, premier: when };
      cur.n++;
      if (when < cur.premier) cur.premier = when;
      parEntite.set(id, cur);
    }
  }

  // Une entité à événement unique ne mérite pas une voie : sur cinquante
  // entités, la frise deviendrait un mur de lignes vides. Tri par première
  // apparition - l'ordre de lecture naturel d'une chronologie.
  const nommes = [...parEntite.entries()]
    .filter(([, v]) => v.n >= MIN_EVENEMENTS_VOIE)
    .sort((a, b) => a[1].premier - b[1].premier)
    .map(([id]) => id);
  const nommesSet = new Set(nommes);

  const groups = nommes.map(id => ({
    id,
    content: entities.find(x => x.id === id)?.label || id,
    title: tr('frise.voie.evenements', { n: parEntite.get(id).n }),
  }));

  const itemGroupe = evt =>
    acteursDe(evt, entities).find(id => nommesSet.has(id)) || GROUPE_PONCTUELS;

  if (dated.some(({ evt }) => itemGroupe(evt) === GROUPE_PONCTUELS)) {
    groups.push({
      id: GROUPE_PONCTUELS,
      content: `⋯ ${tr('frise.voie.ponctuels')}`,
      title: tr('frise.voie.ponctuels.titre'),
    });
  }

  return { groups, itemGroupe };
}
