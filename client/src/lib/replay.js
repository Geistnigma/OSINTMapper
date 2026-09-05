/**
 * Rejeu chronologique d'une enquête.
 *
 * Rejoue la construction du graphe à partir de la date d'ajout des éléments
 * (`createdAt`), pour voir comment le raisonnement s'est bâti : quelles entités
 * d'abord, quels liens ensuite, quels moments d'accélération.
 *
 * Logique pure, sans DOM ni React - le composant se contente de l'afficher.
 */

/**
 * Éléments dépourvus de `createdAt`.
 *
 * Ce champ n'a été posé sur les liens, stickers et post-its qu'après coup : les
 * enquêtes antérieures n'ont donc aucun horodatage pour eux, et rien ne permet
 * de le reconstituer (le journal d'actions ne stocke que du texte libre).
 * On les considère **antérieurs à tout** plutôt que de les masquer : une
 * enquête ancienne se rejoue ainsi depuis un socle déjà présent, au lieu
 * d'apparaître vide.
 */
export const SANS_DATE = 'sans-date';

const horodatage = (el) => {
  const d = el?.createdAt ? new Date(el.createdAt) : null;
  return d && !isNaN(d.getTime()) ? d.getTime() : null;
};

/**
 * Prépare un rejeu.
 *
 * @param {{entities:Array, links:Array, stickers:Array, postits:Array}} graphe
 * @returns {{debut:number, fin:number, etapes:number[], sansDate:number, total:number}}
 *   `etapes` : instants distincts où quelque chose apparaît, triés.
 */
export function buildReplay(graphe) {
  const tous = [
    ...(graphe.entities || []), ...(graphe.links || []),
    ...(graphe.stickers || []), ...(graphe.postits || []),
  ];
  const dates = tous.map(horodatage).filter(t => t !== null);
  const sansDate = tous.length - dates.length;

  if (dates.length === 0) {
    return { debut: 0, fin: 0, etapes: [], sansDate, total: tous.length };
  }
  const debut = Math.min(...dates);
  const fin = Math.max(...dates);
  const etapes = [...new Set(dates)].sort((a, b) => a - b);
  return { debut, fin, etapes, sansDate, total: tous.length };
}

/**
 * Filtre le graphe à un instant donné.
 *
 * Un lien n'est visible que si **ses deux extrémités le sont** : afficher une
 * relation vers une entité pas encore apparue produirait un trait dans le vide.
 * Cela vaut aussi pour les post-its, qui peuvent être reliés (`postit_<id>`).
 *
 * @param {object} graphe
 * @param {number|null} instant  null = pas de rejeu, tout est visible
 */
export function visibleAt(graphe, instant) {
  if (instant == null) return graphe;

  const avant = (el) => {
    const t = horodatage(el);
    return t === null || t <= instant;   // sans date = présent depuis toujours
  };

  const entities = (graphe.entities || []).filter(avant);
  const stickers = (graphe.stickers || []).filter(avant);
  const postits = (graphe.postits || []).filter(avant);

  const presents = new Set([
    ...entities.map(e => e.id),
    ...postits.map(p => `postit_${p.id}`),
  ]);
  const links = (graphe.links || [])
    .filter(avant)
    .filter(l => presents.has(l.from) && presents.has(l.to));

  return { entities, links, stickers, postits };
}

/**
 * Instant suivant où quelque chose apparaît.
 * Avance par ÉTAPES et non par pas de temps constant : une enquête menée sur
 * six mois avec trois journées actives ne doit pas se rejouer en six mois de
 * vide. Rend `null` quand la fin est atteinte.
 */
export function prochaineEtape(etapes, instant) {
  return etapes.find(t => t > instant) ?? null;
}

/** Nombre d'éléments apparus jusqu'à cet instant, pour l'indicateur d'avancement. */
export function compteA(graphe, instant) {
  const v = visibleAt(graphe, instant);
  return v.entities.length + v.links.length + v.stickers.length + v.postits.length;
}
