import { traduire } from '../i18n';

const BASE = import.meta.env.VITE_API_URL || '';

/**
 * L'authentification repose UNIQUEMENT sur le cookie de session.
 *
 * Le JWT était auparavant recopié dans `localStorage` sous la clé `om_token`,
 * *en plus* du cookie - ce qui annulait tout l'intérêt du `HttpOnly` : un XSS
 * lisait un jeton valable 24 h, et il survivait à la fermeture de l'onglet. La
 * copie était de surcroît inutile, le serveur acceptant déjà le cookie
 * (`middleware/auth.js`). Ne pas réintroduire de jeton lisible en JS : les
 * bundles de plugins s'exécutent avec les droits de l'application.
 *
 * Corollaire : **tout `fetch` vers l'API doit porter `credentials: 'include'`**.
 * En développement le client (5173) et l'API (4444) sont d'origines
 * différentes ; ils restent *same-site* (le port ne compte pas), donc le cookie
 * `SameSite=Lax` part bien, y compris au handshake des WebSockets.
 */
export const fetchOpts = { credentials: 'include' };

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (res.status === 401) {
    // Cookie expiré ou absent : le serveur fait foi, il n'y a plus d'état
    // d'authentification à effacer côté client.
    if (window.location.pathname !== '/login') window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(messageErreur(data));
  return data;
}

/**
 * Message d'erreur à afficher, dans la langue de l'interface.
 *
 * Le serveur renvoie un `code` STABLE (`case_not_found`) accompagné d'un
 * message français : le code est ce qui fait foi, le message n'est là que pour
 * les journaux et pour un client non mis à jour. Une erreur sans code connu
 * retombe donc sur le texte du serveur plutôt que d'afficher une clé.
 */
export function messageErreur(data) {
  if (!data) return traduire('erreurs.server_error');
  const params = { ...(data.params || {}) };
  // Le serveur envoie une CLÉ d'action ('demote'…), pas un mot déjà traduit.
  if (params.action) params.action = traduire(`erreurs.action.${params.action}`, null, params.action);
  if (data.code) return traduire(`erreurs.${data.code}`, params, data.error || data.code);
  return data.error || traduire('erreurs.server_error');
}

/**
 * Télécharge un fichier binaire d'une route authentifiée.
 *
 * `api()` ne convient pas : il appelle `res.json()` sur toute réponse. On
 * récupère donc le corps en blob avant de le remettre au navigateur.
 */
export async function apiDownload(path, fallbackName = 'export') {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });

  if (!res.ok) {
    // Le serveur répond en JSON sur erreur, en binaire sinon.
    let msg = traduire('erreurs.download_failed');
    try { msg = messageErreur(await res.json()); } catch { /* corps non JSON */ }
    throw new Error(msg);
  }

  const nom = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  // Sans révocation, le blob reste en mémoire jusqu'au rechargement de l'onglet.
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return {
    uploads: Number(res.headers.get('X-Archive-Uploads') || 0),
    missing: Number(res.headers.get('X-Archive-Missing') || 0),
  };
}

// `getWsUrl()` a été retiré : il renvoyait `ws://<hôte>:4444/ws` en dur, sans
// distinction dev/prod et sans `wss://`. Aucun appelant ne s'en servait - c'est
// useCollaboration.js qui construit les URLs de socket, correctement. Laissé
// tel quel, le premier code qui l'aurait utilisé aurait ouvert une socket en
// clair vers un port fermé en production.
