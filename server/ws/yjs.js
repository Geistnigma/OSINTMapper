/**
 * Serveur de synchronisation Yjs - authentifié.
 *
 * Avant : `npx y-websocket` tournait en process séparé sur le port 1234, sans
 * aucune authentification. Le token passé par le client en query string était
 * purement décoratif - n'importe qui connaissant un caseId pouvait lire et
 * écrire le graphe, contournant JWT, RBAC et chiffrement.
 *
 * Maintenant : le endpoint vit dans le process Express (partage Prisma et la
 * config JWT). Chaque connexion doit présenter un token valide ET disposer d'un
 * accès à l'enquête demandée, sinon la socket est fermée avant tout échange.
 *
 * Le protocole de synchronisation lui-même reste celui de y-websocket
 * (setupWSConnection) : on ne réimplémente pas le CRDT, on ne fait que garder
 * la porte. Le fichier bin/utils.cjs n'est pas déclaré dans les `exports` du
 * paquet, d'où la résolution manuelle via package.json.
 */
import path from 'path';
import { createRequire } from 'module';
import { verifyWsToken, getUserById } from '../middleware/auth.js';
import { resolveCaseRole } from '../middleware/caseAccess.js';
import { consumeTicket } from '../services/wsTicket.js';

import * as decoding from 'lib0/decoding';

const require = createRequire(import.meta.url);
const yWebsocketDir = path.dirname(require.resolve('y-websocket/package.json'));
const { setupWSConnection, getYDoc, docs } = require(path.join(yWebsocketDir, 'bin', 'utils.cjs'));
const { removeAwarenessStates } = require('y-protocols/awareness');

// Codes de fermeture WebSocket applicatifs (plage 4000-4999)
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
/** Le rôle de l'utilisateur sur l'enquête a changé : reconnecte-toi. */
export const CLOSE_ROLE_CHANGED = 4410;

// Protocole y-websocket (bin/utils.cjs) : premier varint = type de message.
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
// Sous-types de MSG_SYNC (y-protocols/sync)
const SYNC_STEP1 = 0; // « voici ce que j'ai, envoie-moi le reste » - lecture
const SYNC_STEP2 = 1; // « voici ce qui te manque » - ÉCRITURE
const SYNC_UPDATE = 2; // mise à jour incrémentale - ÉCRITURE

/**
 * Un message modifie-t-il le document ?
 *
 * Le rôle VIEWER n'était appliqué que sur les routes HTTP. En collaboratif, ce
 * n'est pas /save qui porte les modifications mais le CRDT : un VIEWER écrivait
 * donc librement dans le graphe, et c'est un AUTRE client (le save-leader) qui
 * persistait son travail - contournant son propre 403.
 *
 * On laisse passer SYNC_STEP1 (le viewer demande l'état) et l'awareness (son
 * curseur, sa présence). On refuse STEP2 et UPDATE, qui appliquent ses données
 * au document partagé.
 */
export function isWriteMessage(data) {
  try {
    const dec = decoding.createDecoder(new Uint8Array(data));
    const type = decoding.readVarUint(dec);
    if (type === MSG_AWARENESS) return false;
    if (type !== MSG_SYNC) return true; // type inconnu : on refuse par défaut
    const sub = decoding.readVarUint(dec);
    return sub === SYNC_STEP2 || sub === SYNC_UPDATE;
  } catch {
    return true; // illisible → refusé, plutôt que laissé passer
  }
}

/**
 * Registre des connexions par enquête, pour pouvoir agir sur un utilisateur
 * précis (changement de rôle). `docs` de y-websocket ne connaît pas les
 * utilisateurs, seulement les sockets.
 */
const connections = new Map(); // caseId → Set<{ ws, userId, readOnly }>

function trackConnection(caseId, entry) {
  if (!connections.has(caseId)) connections.set(caseId, new Set());
  connections.get(caseId).add(entry);
}

function untrackConnection(caseId, entry) {
  const set = connections.get(caseId);
  if (!set) return;
  set.delete(entry);
  if (set.size === 0) connections.delete(caseId);
}

/**
 * Coupe les connexions Yjs d'un utilisateur sur une enquête, pour qu'il
 * reconnecte avec son nouveau rôle. Le filtre lecture seule est figé à
 * l'ouverture de la socket : sans cela, une promotion VIEWER → ANALYST ne
 * prendrait effet qu'au prochain rechargement de page.
 */
export function reconnectYjsUser(caseId, userId) {
  const set = connections.get(caseId);
  if (!set) return 0;
  let n = 0;
  for (const entry of set) {
    if (entry.userId !== userId) continue;
    try { entry.ws.close(CLOSE_ROLE_CHANGED, 'role-changed'); n++; } catch { /* déjà fermée */ }
  }
  return n;
}

export function setupYjsWs(app) {
  app.ws('/yjs/:room', async (ws, req) => {
    const caseId = req.params.room;

    // La socket est déjà ouverte quand ce handler s'exécute : le client peut
    // envoyer son sync step 1 pendant que l'on interroge la base. On met ces
    // trames de côté et on les rejoue une fois le protocole attaché, sinon la
    // synchronisation initiale échoue de façon intermittente.
    const buffered = [];
    const bufferEarly = (data) => buffered.push(data);
    ws.on('message', bufferEarly);

    let user = null;
    try {
      // Voie normale : un ticket éphémère lié à cette seule enquête, pour que
      // les logs nginx ne contiennent jamais de JWT de session.
      const ticket = req.query?.ticket;
      const claim = ticket ? consumeTicket(ticket, caseId) : null;
      if (claim) {
        user = await getUserById(claim.userId);
      } else if (req.cookies?.token) {
        // Repli : le cookie de session, envoyé par le navigateur au handshake.
        // Il est `HttpOnly`, donc le client ne peut pas le recopier dans l'URL -
  // et c'est précisément le but : plus aucun jeton n'est lisible en JS.
        user = await verifyWsToken(req.cookies.token);
      } else if (req.query?.token) {
        // Dernier repli : JWT en query string (clients non mis à jour). À
        // retirer une fois le parc à jour - l'URL d'un WebSocket atterrit dans
        // les logs nginx.
        user = await verifyWsToken(req.query.token);
      }
    } catch (e) {
      console.error('  [yjs] auth error:', e.message);
    }

    if (!user) {
      ws.close(CLOSE_UNAUTHORIZED, 'unauthorized');
      return;
    }

    let role = null;
    try {
      role = await resolveCaseRole(user, caseId);
    } catch (e) {
      console.error('  [yjs] access error:', e.message);
    }

    if (!role) {
      console.warn(`  [yjs/${caseId}] accès refusé à ${user.username}`);
      ws.close(CLOSE_FORBIDDEN, 'forbidden');
      return;
    }

    // La socket a pu se fermer pendant les requêtes asynchrones
    if (ws.readyState !== 1) return;

    ws.off('message', bufferEarly);

    // Le handler de fermeture doit être posé AVANT setupWSConnection : les
    // listeners s'exécutent dans l'ordre d'ajout, et celui de y-websocket
    // retire la connexion de doc.conns - après quoi on ne saurait plus quels
    // clients d'awareness lui appartenaient.
    // VIEWER = lecture seule. Le rôle vient de la base, jamais du client.
    const readOnly = role === 'VIEWER';
    const entry = { ws, userId: user.id, readOnly };
    trackConnection(caseId, entry);

    const doc = getYDoc(caseId, true);
    ws.on('close', () => {
      untrackConnection(caseId, entry);
      // Purge des états d'awareness de ce client. Sans cela son curseur et son
      // verrou d'édition restent visibles pour les autres indéfiniment : un
      // plantage navigateur bloquerait définitivement l'entité en cours d'édition.
      const controlled = doc.conns.get(ws);
      if (controlled && controlled.size > 0) {
        removeAwarenessStates(doc.awareness, Array.from(controlled), null);
      }

      // Sans persistance disque, y-websocket garde le document en mémoire même
      // quand plus personne n'est connecté. Un rechargement ultérieur repartirait
      // alors de cet état résiduel plutôt que du fichier JSON - qui est la source
      // de vérité de l'application. On libère donc le doc quand la salle se vide.
      setTimeout(() => {
        const d = docs.get(caseId);
        if (d && d.conns.size === 0) {
          docs.delete(caseId);
          d.destroy();
          console.log(`  [yjs/${caseId}] salle vide - document libéré`);
        }
      }, 100);
    });

    setupWSConnection(ws, req, { docName: caseId, gc: true });

    // Filtre lecture seule : on enveloppe les listeners posés par
    // setupWSConnection plutôt que d'en ajouter un - un EventEmitter appelle
    // TOUS ses listeners, il n'existe pas de « stopPropagation » qui
    // empêcherait y-websocket de traiter le message.
    if (readOnly) {
      const inner = ws.listeners('message');
      ws.removeAllListeners('message');
      for (const listener of inner) {
        ws.on('message', (data, isBinary) => {
          if (isWriteMessage(data)) {
            console.warn(`  [yjs/${caseId}] écriture refusée à ${user.username} (VIEWER)`);
            return;
          }
          listener(data, isBinary);
        });
      }
    }

    // Les trames reçues pendant les vérifications passent par le même filtre.
    for (const data of buffered) ws.emit('message', data);

    console.log(`  [yjs/${caseId}] ${user.username} connecté (${role}${readOnly ? ', lecture seule' : ''})`);
  });
}

/** Code de fermeture : l'enquête a été restaurée, le client doit recharger. */
export const CLOSE_RESTORED = 4409;

/**
 * Ferme une salle Yjs et libère son document.
 *
 * Indispensable à la restauration d'un instantané : tant qu'une salle est
 * ouverte, c'est le document en mémoire qui fait foi, et le client élu
 * réécrirait le fichier restauré avec l'ancien état en moins d'une seconde.
 * On coupe donc les connexions et on jette le document ; les clients se
 * reconnectent sur une salle vide, qui repart du fichier - désormais restauré.
 *
 * @returns {number} nombre de connexions fermées
 */
export function closeYjsRoom(caseId, code = CLOSE_RESTORED, reason = 'restored') {
  const d = docs.get(caseId);
  if (!d) return 0;
  const conns = Array.from(d.conns.keys());
  for (const ws of conns) {
    try { ws.close(code, reason); } catch { /* socket déjà morte */ }
  }
  docs.delete(caseId);
  try { d.destroy(); } catch { /* déjà détruit */ }
  console.log(`  [yjs/${caseId}] salle fermée (${conns.length} client(s)) - ${reason}`);
  return conns.length;
}

/** Nombre de documents Yjs actifs en mémoire - exposé par /api/health. */
export function getYjsStats() {
  return { docs: docs.size, rooms: Array.from(docs.keys()) };
}
