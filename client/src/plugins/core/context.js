/**
 * Contexte passé aux composants de plugin.
 *
 * Avant, chaque point d'intégration composait sa propre liste de props : le
 * panneau plein écran en fournissait 19, l'onglet d'entité seulement 8. Un
 * plugin déclarant les deux hooks fonctionnait dans un mode et échouait dans
 * l'autre sur un `addEntity is not a function`, masqué par l'ErrorBoundary.
 *
 * Désormais tout hook reçoit LA MÊME forme. Ce qui n'est pas disponible dans un
 * mode donné vaut `null` - jamais `undefined` - pour qu'un plugin puisse tester
 * une capacité au lieu de la découvrir en plantant :
 *
 *   if (!ctx.addEntity) return <p>Indisponible dans ce mode</p>;
 */

import { api } from '../../lib/api.js';

// 2.2.0 - ajout de `ctx.bulkAdd`. Ajout de capacité uniquement, comme `ctx.api`
// en 2.1.0 : les plugins existants ne s'en servent pas et continuent de
// fonctionner, d'où une mineure (la compatibilité est vérifiée sur la majeure,
// côté serveur comme client).
export const SDK_VERSION = '2.2.0';

/** Modes d'intégration possibles. */
export const PLUGIN_MODES = ['fullscreen', 'entity-tab'];

/**
 * Accès HTTP à l'API de l'application, pour les plugins qui ont besoin du
 * serveur (historique de versions, exports, ressources métier…).
 *
 * Le chemin est relatif et préfixé par `/api` : Vite proxifie `/api` en
 * développement, donc l'appel reste same-origin des deux côtés - un plugin n'a
 * pas à deviner le port 4444. Le jeton de session est joint automatiquement,
 * ainsi que le cookie : un auteur de plugin n'a aucune authentification à gérer.
 *
 * Ce n'est PAS un bac à sable : le plugin s'exécute avec les droits de
 * l'utilisateur connecté, et le serveur reste seul juge des accès.
 */
function buildApi() {
  const call = (method) => (path, body) => {
    if (typeof path !== 'string' || !path.startsWith('/')) {
      return Promise.reject(new Error('chemin d\'API invalide (doit commencer par "/")'));
    }
    return api(`/api${path}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };
  return {
    get: call('GET'),
    post: call('POST'),
    put: call('PUT'),
    del: call('DELETE'),
  };
}

/**
 * Construit le contexte normalisé d'un plugin.
 * Toute clé absente de `src` est explicitement mise à null.
 */
export function buildPluginContext(src = {}) {
  const cap = (v) => (v === undefined ? null : v);

  return {
    // ─── Métadonnées d'exécution ───
    host: {
      sdkVersion: SDK_VERSION,
      mode: src.mode || 'fullscreen',
      pluginId: cap(src.pluginId),
    },

    // ─── Données (lecture seule) ───
    entity: cap(src.entity),          // uniquement en mode entity-tab
    entities: src.entities || [],
    links: src.links || [],
    stickers: src.stickers || [],
    postits: src.postits || [],

    // ─── Mutations (synchronisées via Yjs) ───
    addEntity: cap(src.addEntity),
    updateEntity: cap(src.updateEntity),
    deleteEntity: cap(src.deleteEntity),
    addLink: cap(src.addLink),
    updateLink: cap(src.updateLink),
    deleteLink: cap(src.deleteLink),

    /**
     * Insertion en masse - SDK 2.2.
     *
     * Un import n'est pas une suite de créations : appeler `addEntity` en
     * boucle produit autant de pas d'annulation que d'éléments (annuler un
     * import de 24 entités demanderait 57 Ctrl+Z), rejoue l'anti-chevauchement
     * à chaque appel - ce qui défait la disposition importée au fur et à
     * mesure qu'on la pose - et relie mal : `addEntity` rend un identifiant
     * qu'il faut avoir avant de créer les liens.
     *
     * `bulkAdd` fait le tout en UNE transaction : un pas d'annulation, un seul
     * passage d'anti-chevauchement à la fin, et une résolution `ref` → id qui
     * permet de décrire les liens avec les identifiants du fichier source.
     *
     *   const { idByRef } = ctx.bulkAdd({
     *     entities: [{ ref: 'a', subtype: 'person_male', label: 'Dupont' }],
     *     links:    [{ from: 'a', to: 'b', label: 'connaît' }],
     *   });
     *
     * Vaut `null` hors du mode plein écran et pour un VIEWER.
     */
    bulkAdd: cap(src.bulkAdd),

    // ─── Sélection ───
    selectedId: cap(src.selectedId),
    setSelectedId: cap(src.setSelectedId),

    // ─── Présentation ───
    theme: src.theme || {},
    onClose: cap(src.onClose),

    // ─── Réglages du plugin ───
    settings: src.settings || {},
    updateSettings: cap(src.updateSettings),

    // ─── Serveur ───
    api: buildApi(),

    // ─── Contexte applicatif ───
    caseId: cap(src.caseId),
    userName: cap(src.userName),
    collab: cap(src.collab),
    isViewer: !!src.isViewer,
    canEdit: !src.isViewer && !!src.updateEntity,
  };
}
