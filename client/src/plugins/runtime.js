/**
 * Chargement des plugins installés à l'exécution.
 *
 * Les plugins natifs sont résolus par Vite à la compilation (`import.meta.glob`).
 * Ceux-ci arrivent du serveur : leur bundle est un module ESM récupéré par
 * `import()` dynamique, ce qui permet d'ajouter un plugin sans rebuild ni
 * redéploiement.
 *
 * Seuls les plugins que l'utilisateur a activés sont téléchargés : contrairement
 * aux plugins natifs, chargés d'office même désactivés, ceux-ci ne coûtent rien
 * tant qu'ils ne servent pas.
 *
 * Le bundle doit exporter :
 *   export const manifest = { id, name, sdkVersion, hooks, ... }  (facultatif -
 *     le manifeste enregistré côté serveur fait foi)
 *   export default function Panel(ctx) { ... }
 *
 * React est fourni par l'hôte via `window.__OM_REACT__` : un plugin doit le
 * déclarer externe à son build, sinon deux copies de React coexistent et les
 * hooks échouent.
 */
import React from 'react';
import { traduire } from '../i18n';
// L'authentification passe par le cookie de session : aucun jeton n'est lisible
// en JS (cf. lib/api.js). Chaque fetch porte `credentials: 'include'`.

// Exposé pour que les bundles externes réutilisent l'instance de l'hôte.
if (typeof window !== 'undefined') window.__OM_REACT__ = React;

// Chemin relatif : même origine que la page, comme `lib/api.js`. La règle
// « port ∉ {80,443} ⇒ :4444 » traînait ici aussi ; en développement elle
// sortait du proxy Vite, et ailleurs elle visait un port fermé.
const BASE = '';

/** Récupère la liste des plugins runtime visibles par l'utilisateur. */
export async function fetchRuntimePlugins() {
  const r = await fetch(`${BASE}/api/plugins`, { credentials: 'include' });
  if (!r.ok) return [];
  return r.json();
}

/**
 * Charge le bundle d'un plugin et retourne son composant Panel.
 * @returns {Promise<{Panel: Function, manifest: Object}|null>}
 */
export async function loadRuntimePlugin(id, bundleHash) {
  try {
    // Le hash sert de cache-buster : une réinstallation change l'URL, donc le
    // navigateur ne resservira pas l'ancien module depuis son cache.
    const url = `${BASE}/api/plugins/${encodeURIComponent(id)}/bundle?v=${encodeURIComponent(bundleHash || '')}`;
    const mod = await import(/* @vite-ignore */ url);
    const Panel = mod.default || mod.Panel;
    if (typeof Panel !== 'function') {
      console.error(`[plugins] "${id}" : le bundle n'exporte pas de composant Panel`);
      return null;
    }
    return { Panel, manifest: mod.manifest || null };
  } catch (e) {
    console.error(`[plugins] "${id}" : échec de chargement -`, e.message);
    return null;
  }
}

// L'authentification vient du cookie de session : il ne reste qu'un en-tête de
// type de contenu, et `credentials: 'include'` sur chaque appel.
const authHeaders = () => ({ 'Content-Type': 'application/json' });

/**
 * Lit un bundle .js et en extrait le manifeste.
 *
 * Le module est importé depuis un Blob pour récupérer son export `manifest` :
 * cela exécute le code dans l'onglet de l'administrateur, ce qui est acceptable
 * puisqu'il s'apprête précisément à l'installer - mais ce n'est pas une
 * inspection sûre d'un fichier inconnu.
 */
export async function readPluginBundle(file) {
  const code = await file.text();
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    const manifest = mod.manifest;
    if (!manifest?.id) throw new Error(traduire('store.bundleSansManifeste'));
    if (typeof (mod.default || mod.Panel) !== 'function') throw new Error(traduire('store.bundleSansPanel'));
    return { manifest, code, docs: mod.docs || null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Installe un plugin (ADMIN). */
export async function installPlugin({ manifest, code, docs }) {
  const r = await fetch(`${BASE}/api/plugins`, {
    method: 'POST', headers: authHeaders(), credentials: 'include',
    body: JSON.stringify({ manifest, code, docs }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || traduire('store.installationEchouee'));
  return d;
}

/** Désinstalle un plugin (ADMIN). */
export async function uninstallPlugin(id) {
  const r = await fetch(`${BASE}/api/plugins/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: authHeaders(), credentials: 'include',
  });
  if (!r.ok) throw new Error(traduire('store.desinstallationEchouee'));
}

/** Enregistre l'activation d'un plugin runtime pour l'utilisateur courant. */
export async function setPluginPreference(id, enabled) {
  const r = await fetch(`${BASE}/api/plugins/${encodeURIComponent(id)}/preference`, {
    method: 'PUT', headers: authHeaders(), credentials: 'include',
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) throw new Error(traduire('store.preferenceNonEnregistree'));
}

/**
 * Enregistre dans le moteur tous les plugins runtime activés par l'utilisateur.
 * @returns {Promise<{loaded: string[], failed: string[]}>}
 */
export async function registerRuntimePlugins(engine) {
  const loaded = [];
  const failed = [];

  let list = [];
  try { list = await fetchRuntimePlugins(); } catch { return { loaded, failed }; }

  for (const p of list) {
    if (!p.enabled) continue; // pas activé → pas téléchargé
    const mod = await loadRuntimePlugin(p.id, p.bundleHash);
    if (!mod) { failed.push(p.id); continue; }

    const manifest = {
      ...(p.manifest || {}),
      id: p.id,
      name: p.name,
      version: p.version,
      sdkVersion: p.sdkVersion || p.manifest?.sdkVersion,
      description: p.description,
      author: p.author,
      category: p.category,
      icon: p.icon,
      docs: p.docs || p.manifest?.docs || null,
      source: 'runtime',
      bundleHash: p.bundleHash,
    };

    const res = engine.register(manifest, { Panel: mod.Panel });
    if (res?.ok === false) { failed.push(p.id); continue; }

    // La préférence serveur fait foi : ce plugin a été activé par l'utilisateur.
    engine.enable(p.id);
    loaded.push(p.id);
  }

  return { loaded, failed };
}
