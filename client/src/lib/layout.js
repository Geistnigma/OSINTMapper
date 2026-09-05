/**
 * Géométrie de disposition du graphe.
 *
 * Extraite du monolithe pour être testable : la logique vivait dans un
 * `useCallback` de `OSINTMapper.jsx`, donc impossible à exercer sans monter
 * tout le composant. C'est de l'arithmétique pure, elle n'a rien à y faire.
 */

export const ENT_W = 220;
export const ENT_H = 88;

/** Marge visible laissée entre deux entités. */
export const MIN_GAP_ENT = 10;

/** Budget de temps d'une résolution, en ms (voir `resolveOverlapPositions`). */
export const OVERLAP_BUDGET_MS = 30;

/**
 * Plafond de passes, indexé sur la taille du graphe.
 *
 * Un plafond fixe bas (20) laissait des chevauchements même sur de petits
 * graphes denses. Au-delà de 40 le gain devient nul sur les cas restants : ils
 * **oscillent** - une entité coincée entre deux voisins figés est repoussée de
 * l'un vers l'autre indéfiniment. Une variante par relaxation (accumuler les
 * poussées d'une passe puis appliquer la somme) a été mesurée et ne fait pas
 * mieux. C'est le budget de temps qui sert de vrai garde-fou.
 */
export const maxPassesOverlap = n => Math.max(40, Math.min(150, n * 3));

/** Deux entités se chevauchent-elles ? (sans tenir compte de la marge) */
export function entitiesOverlap(a, b) {
  return Math.abs(a.x - b.x) < ENT_W && Math.abs(a.y - b.y) < ENT_H;
}

/** Nombre de paires en chevauchement - utile aux tests et au diagnostic. */
export function countOverlaps(items) {
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) if (entitiesOverlap(items[i], items[j])) n++;
  }
  return n;
}

/**
 * Écarte les entités qui se chevauchent.
 *
 * La version d'origine était fautive à quatre titres, et pouvait **empirer** la
 * situation (mesuré : 17 chevauchements au départ, 21 après 200 déplacements) :
 *   1. la poussée valait `pénétration / 2`, ce qui n'est correct que si les DEUX
 *      entités s'écartent - or l'entité saisie reste fixe, donc la moitié du
 *      travail n'était jamais faite et elles restaient superposées ;
 *   2. une seule passe : écarter B de A la projetait dans C, sans reprise ;
 *   3. seules les paires touchant l'entité déplacée étaient examinées ;
 *   4. les deux axes bougeaient, envoyant l'entité en diagonale.
 *
 * @param {Array<{id:string,x:number,y:number}>} items
 * @param {string|string[]|null} figees  ids à ne pas bouger - l'entité saisie,
 *        ou tout un lot sélectionné : le geste de l'utilisateur fait autorité.
 * @param {{now?:()=>number}} [opts]     injection d'horloge, pour les tests
 * @returns {{positions:Map<string,{x:number,y:number}>, moved:Array, passes:number, budgetHit:boolean}}
 */
export function resolveOverlapPositions(items, figees, opts = {}) {
  const now = opts.now || (() => Date.now());
  const fixe = new Set(figees == null ? [] : (Array.isArray(figees) ? figees : [figees]));
  const EW = ENT_W + MIN_GAP_ENT, EH = ENT_H + MIN_GAP_ENT;

  const pos = new Map(items.map(e => [e.id, { x: e.x, y: e.y }]));
  const debut = now(), plafond = maxPassesOverlap(items.length);
  let passes = 0, budgetHit = false;

  for (let passe = 0; passe < plafond; passe++) {
    let conflit = false;
    passes = passe + 1;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const ida = items[i].id, idb = items[j].id;
        const a = pos.get(ida), b = pos.get(idb);
        const penX = EW - Math.abs(a.x - b.x);
        const penY = EH - Math.abs(a.y - b.y);
        if (penX <= 0 || penY <= 0) continue;          // pas de chevauchement
        const aFixe = fixe.has(ida), bFixe = fixe.has(idb);
        if (aFixe && bFixe) continue;                   // rien à déplacer
        conflit = true;
        // Séparation sur l'axe de MOINDRE pénétration : le trajet le plus court,
        // et un seul axe modifié au lieu d'un envoi en diagonale.
        const surX = penX < penY;
        const total = (surX ? penX : penY) + MIN_GAP_ENT;
        let signe = surX ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
        if (signe === 0) signe = 1;                     // superposition parfaite
        // Une seule entité mobile encaisse tout ; deux entités mobiles se
        // partagent le déplacement.
        const partA = aFixe ? 0 : (bFixe ? total : total / 2);
        const partB = bFixe ? 0 : (aFixe ? total : total / 2);
        if (surX) { a.x -= signe * partA; b.x += signe * partB; }
        else { a.y -= signe * partA; b.y += signe * partB; }
      }
    }
    if (!conflit) break;                                // stabilisé
    if (now() - debut > OVERLAP_BUDGET_MS) { budgetHit = true; break; }
  }

  const moved = [];
  for (const e of items) {
    const p = pos.get(e.id);
    const x = Math.round(p.x), y = Math.round(p.y);
    p.x = x; p.y = y;
    if (x !== e.x || y !== e.y) moved.push({ id: e.id, x, y });
  }
  return { positions: pos, moved, passes, budgetHit };
}
