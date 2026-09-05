/**
 * Custom WS handler for features Yjs doesn't cover:
 *   - Join approval (pending / approve / deny)
 *   - Chat
 *   - Kick
 * 
 * Data sync (entities, links, stickers, postits) and awareness (cursors)
 * are handled entirely by the y-websocket server on port YJS_PORT.
 */
import { PrismaClient } from '@prisma/client';
import { verifyWsToken, getUserById } from '../middleware/auth.js';
import { resolveCaseRole } from '../middleware/caseAccess.js';
import { reconnectYjsUser } from './yjs.js';
import { consumeTicket } from '../services/wsTicket.js';

const prisma = new PrismaClient();

// In-memory rooms for custom features
const rooms = new Map(); // caseId → { clients: Map<ws, user>, owner, pending: Map<userId, {ws,user}> }

// Limite d'envoi du chat : 10 messages par tranche de 10 s et par connexion.
const CHAT_WINDOW_MS = 10000;
const CHAT_MAX_PER_WINDOW = 10;

function getRoom(caseId) {
  if (!rooms.has(caseId)) {
    rooms.set(caseId, { clients: new Map(), owner: null, ownerName: null, pending: new Map() });
  }
  return rooms.get(caseId);
}

function bc(room, msg, exclude = null) {
  const d = JSON.stringify(msg);
  for (const [ws] of room.clients) {
    if (ws !== exclude && ws.readyState === 1) ws.send(d);
  }
}

function bcAll(room, msg) {
  const d = JSON.stringify(msg);
  for (const [ws] of room.clients) {
    if (ws.readyState === 1) ws.send(d);
  }
}


/**
 * Fait entrer un client dans la salle : rôle, roster, notifications.
 *
 * Extrait du gestionnaire de `join` parce que l'approbation d'un modérateur
 * doit emprunter EXACTEMENT le même chemin. Dupliquer ces vingt lignes, c'est
 * garantir qu'un jour l'une des deux copies enverra un roster et pas l'autre.
 */
function admettre(room, ws, { user, collabRole, isOwner, isAdmin }) {
  if (!room.roles) room.roles = {};
  room.roles[user.id] = collabRole;

  // isOwner/isAdmin sont conservés côté serveur : les droits de modération se
  // vérifient sur cette entrée, jamais sur ce que le client prétend être.
  room.clients.set(ws, { ...user, collabRole, isOwner, isAdmin });
  ws.send(JSON.stringify({ type: 'custom:init', userId: user.id, isOwner: isOwner || isAdmin, collabRole }));

  bc(room, { type: 'user:joined', user: { ...user, collabRole } }, ws);

  const roster = [];
  for (const [, u] of room.clients) {
    roster.push({ id: u.id, name: u.name, color: u.color, collabRole: u.collabRole || room.roles[u.id] || 'viewer' });
  }
  ws.send(JSON.stringify({ type: 'roster', users: roster, roles: room.roles || {} }));
}


/**
 * Éjecte un utilisateur d'une salle après révocation de son accès.
 *
 * Sans cela, retirer quelqu'un de l'enquête ne l'expulsait de rien : sa socket
 * restait ouverte, il continuait de voir les curseurs, le chat et - via Yjs -
 * les modifications, jusqu'à ce qu'il recharge la page de lui-même. Le retrait
 * n'aurait pris effet qu'à sa prochaine visite.
 *
 * @returns {number} nombre de connexions fermées
 */
export function expulserDeLaSalle(caseId, userId, raison = 'access_revoked') {
  const room = rooms.get(caseId);
  if (!room) return 0;
  let n = 0;
  for (const [cws, cu] of [...room.clients]) {
    if (cu.id !== userId) continue;
    try {
      if (cws.readyState === 1) cws.send(JSON.stringify({ type: 'kicked', reason: raison }));
      cws.close(1000, raison);
    } catch { /* déjà fermée */ }
    room.clients.delete(cws);
    n++;
  }
  room.pending.delete(userId);
  room.approuves?.delete(userId);
  if (room.roles) delete room.roles[userId];
  if (n > 0) bcAll(room, { type: 'user:left', userId });
  return n;
}

export function setupCustomWs(app) {
  app.ws('/ws-custom', (ws, req) => {
    let caseId = null;
    let user = null;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      // ═══ JOIN ═══
      if (msg.type === 'join') {
        const roomId = msg.caseId || msg.roomId;
        if (!roomId) return;

        // Voie normale : le MÊME ticket éphémère que le socket Yjs, obtenu en
        // HTTP puis passé dans l'URL du handshake.
        //
        // Ne pas revenir à « le serveur lira le cookie du handshake » : en
        // production le cookie de session porte l'attribut `Secure`, que le
        // navigateur n'envoie que sur un canal sûr - donc pas sur `ws://`. Une
        // instance servie en HTTP (conteneur sans reverse-proxy TLS) perdait
        // ainsi toute la couche temps réel : ni présence, ni curseurs, ni chat,
        // pendant que le reste de l'application fonctionnait normalement.
        //
        // Le cookie et `msg.token` restent acceptés en repli (wss://, clients
        // non mis à jour).
        let authUser = null;
        const ticket = req.query?.ticket;
        const claim = ticket ? consumeTicket(ticket, roomId) : null;
        if (claim) authUser = await getUserById(claim.userId);
        if (!authUser && req.cookies?.token) authUser = await verifyWsToken(req.cookies.token);
        if (!authUser && msg.token) authUser = await verifyWsToken(msg.token);
        if (!authUser) return ws.send(JSON.stringify({ type: 'join:denied', reason: 'invalid_token' }));

        // L'accès à l'enquête est obligatoire : sans lui, un utilisateur
        // authentifié pouvait entrer dans le chat de n'importe quelle salle et,
        // s'il arrivait le premier, en devenir propriétaire.
        let dbRole = null;
        try {
          dbRole = await resolveCaseRole(authUser, roomId);
        } catch (e) {
          console.error('  [custom] access error:', e.message);
        }
        if (!dbRole) {
          console.warn(`  [custom/${roomId}] accès refusé à ${authUser.username}`);
          return ws.send(JSON.stringify({ type: 'join:denied', reason: 'no_access' }));
        }

        caseId = roomId;
        user = { id: authUser.id, name: authUser.displayName || authUser.username, role: authUser.role, color: msg.color || `hsl(${Math.random() * 360}, 70%, 60%)` };
        const room = getRoom(caseId);

        // Le propriétaire vient de la base, jamais de l'ordre d'arrivée.
        const isOwnerInDb = dbRole === 'OWNER';
        if (isOwnerInDb) { room.owner = user.id; room.ownerName = user.name; }

        const isAdmin = authUser.role === 'ADMIN';
        const isOwner = isOwnerInDb;

        // Le rôle collaboratif est le REFLET du rôle en base, pas un état
        // parallèle. Auparavant tout le monde était « editor » en mémoire et le
        // réglage disparaissait avec la salle : un VIEWER apparaissait éditeur,
        // et personne ne savait qui pouvait réellement écrire.
        const collabRole = dbRole === 'VIEWER' ? 'viewer' : 'editor';

        // ═══ APPROBATION D'ENTRÉE ═══
        //
        // Être invité donne l'ACCÈS à l'enquête ; entrer dans une session de
        // travail en cours reste soumis à l'accord d'un modérateur présent.
        // L'approbation avait été remplacée par un « auto-accept everyone » :
        // l'arrivant était admis d'office et le propriétaire n'était que
        // notifié, sans pouvoir refuser.
        //
        // Ce n'est PAS une barrière de sécurité - elle est en base
        // (`CaseAccess`), et le refus n'y touche pas. C'est un contrôle de
        // salle : savoir qui entre, et quand.
        const modérateurs = [...room.clients].filter(([, u]) => u.isOwner || u.isAdmin);
        if (!room.approuves) room.approuves = new Set();

        if (!isOwner && !isAdmin && modérateurs.length > 0 && !room.approuves.has(user.id)) {
          room.pending.set(user.id, { ws, user, collabRole, isOwner, isAdmin });
          ws.send(JSON.stringify({ type: 'join:pending' }));
          for (const [mws] of modérateurs) {
            if (mws.readyState === 1) mws.send(JSON.stringify({ type: 'join:request', user }));
          }
          console.log(`  [custom/${caseId}] ${user.name} en attente d'approbation`);
          return;
        }

        // Aucun modérateur connecté : personne ne pourrait approuver, et
        // l'arrivant attendrait indéfiniment. On admet, en le signalant.
        if (!isOwner && !isAdmin && modérateurs.length === 0) {
          console.log(`  [custom/${caseId}] ${user.name} admis sans approbation (aucun modérateur connecté)`);
        }

        admettre(room, ws, { user, collabRole, isOwner, isAdmin });

        console.log(`  [custom/${caseId}] ${user.name} joined as ${collabRole} (${isOwner ? 'owner' : isAdmin ? 'admin' : 'user'})`);
        return;
      }

      if (!caseId || !user) return;
      const room = rooms.get(caseId);
      if (!room) return;

      // Propriétaire de l'enquête ou ADMIN plateforme. L'UI affiche les contrôles
      // de modération aux deux (custom:init envoie isOwner || isAdmin) : la
      // vérification serveur doit suivre la même règle, sinon les actions d'un
      // admin échouent en silence.
      const self = room.clients.get(ws);
      const canModerate = !!(self?.isOwner || self?.isAdmin);

      // ═══ APPROBATION / REFUS D'UNE DEMANDE D'ENTRÉE ═══
      //
      // Le client émettait déjà `join:approve` et `join:deny` - le serveur ne
      // les écoutait plus depuis le passage à l'admission automatique.
      if ((msg.type === 'join:approve' || msg.type === 'join:deny') && msg.userId && canModerate) {
        const attente = room.pending.get(msg.userId);
        if (!attente) return;
        room.pending.delete(msg.userId);

        if (msg.type === 'join:deny') {
          if (attente.ws.readyState === 1) {
            attente.ws.send(JSON.stringify({ type: 'join:denied', reason: 'refused' }));
          }
          console.log(`  [custom/${caseId}] entrée refusée à ${attente.user.name} par ${user.name}`);
          return;
        }

        // Mémorisé pour la durée de la salle : une coupure réseau ne doit pas
        // renvoyer l'intéressé dans la file, ni redemander au modérateur.
        if (!room.approuves) room.approuves = new Set();
        room.approuves.add(msg.userId);

        if (attente.ws.readyState !== 1) return; // parti entre-temps
        admettre(room, attente.ws, attente);
        console.log(`  [custom/${caseId}] ${attente.user.name} admis par ${user.name} (${attente.collabRole})`);
        return;
      }

      // ═══ CHANGEMENT DE RÔLE (le propriétaire bascule lecture seule / éditeur) ═══
      //
      // Écrit en base (CaseAccess), et non plus dans une map mémoire perdue à la
      // fermeture de la salle. C'est ce rôle que le socket Yjs applique, donc
      // c'est le seul qui donne réellement le droit d'écrire.
      if (msg.type === 'role:set' && msg.targetUserId && msg.role && canModerate) {
        const newDbRole = msg.role === 'editor' ? 'ANALYST' : 'VIEWER';
        const newRole = msg.role === 'editor' ? 'editor' : 'viewer';

        try {
          const target = await prisma.caseAccess.findUnique({
            where: { caseId_userId: { caseId, userId: msg.targetUserId } },
          });
          // Aucune ligne CaseAccess : c'est le cas d'un ADMIN de la plateforme,
          // qui accède à TOUTES les enquêtes sans y être inscrit (`resolveCaseRole`
          // rend 'ADMIN' faute de ligne). Son rôle sur l'enquête n'existe donc
          // pas, et il n'y a rien à rétrograder.
          //
          // Ce cas retournait en SILENCE : le bouton 👁️ ne faisait rien, sans
          // message ni journal, et l'intéressé restait éditeur. On le dit.
          if (!target) {
            return ws.send(JSON.stringify({
              type: 'role:denied',
              reason: 'not_a_member',
              message: "Ce compte est ADMIN de la plateforme : il accède à toutes les enquêtes sans y être inscrit. Son accès ne se règle pas ici, mais depuis l'écran Administration.",
            }));
          }
          if (target.role === 'OWNER') {
            return ws.send(JSON.stringify({ type: 'role:denied', reason: 'owner_immutable' }));
          }

          await prisma.caseAccess.update({
            where: { caseId_userId: { caseId, userId: msg.targetUserId } },
            data: { role: newDbRole },
          });
          await prisma.auditLog.create({
            data: { action: 'case:access:role', userId: user.id, caseId, details: `${msg.targetUserId} → ${newDbRole}` },
          });
        } catch (e) {
          console.error('  [custom] role:set:', e.message);
          return;
        }

        if (!room.roles) room.roles = {};
        room.roles[msg.targetUserId] = newRole;
        for (const [cws, cu] of room.clients) {
          if (cu.id === msg.targetUserId) {
            cu.collabRole = newRole;
            cws.send(JSON.stringify({ type: 'role:changed', collabRole: newRole }));
          }
        }
        bcAll(room, { type: 'roles:update', roles: room.roles });

        // Le filtre lecture seule est figé à l'ouverture de la socket Yjs : sans
        // cette coupure, le changement n'aurait d'effet qu'au prochain F5.
        // y-websocket reconnecte tout seul, avec le nouveau rôle.
        reconnectYjsUser(caseId, msg.targetUserId);

        console.log(`  [custom/${caseId}] ${msg.targetUserId} → ${newDbRole} par ${user.name}`);
        return;
      }

      // ═══ CHAT ═══
      if (msg.type === 'chat' && msg.text) {
        // Fenêtre glissante par connexion : le chat n'était pas limité, et les
        // limiteurs Express ne couvrent pas les WebSockets.
        const now = Date.now();
        if (!self._chatTimes) self._chatTimes = [];
        self._chatTimes = self._chatTimes.filter(t => now - t < CHAT_WINDOW_MS);
        if (self._chatTimes.length >= CHAT_MAX_PER_WINDOW) {
          return ws.send(JSON.stringify({ type: 'chat:throttled', retryInMs: CHAT_WINDOW_MS - (now - self._chatTimes[0]) }));
        }
        self._chatTimes.push(now);

        bcAll(room, { type: 'chat', message: {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          userId: user.id, userName: user.name, userColor: user.color,
          text: msg.text.slice(0, 500), ts: new Date().toISOString(),
        }});
        return;
      }

      // ═══ KICK ═══
      if (msg.type === 'kick' && msg.targetUserId && canModerate) {
        for (const [ows, ou] of room.clients) {
          if (ou.id === msg.targetUserId) {
            ows.send(JSON.stringify({ type: 'kicked', reason: "Expulsé par l'administrateur" }));
            ows.close(1000, 'kicked');
          }
        }
        bc(room, { type: 'user:kicked', userId: msg.targetUserId });
        return;
      }
    });

    ws.on('close', () => {
      if (!caseId) return;
      const room = rooms.get(caseId);
      if (!room) return;
      if (user) room.pending.delete(user.id);
      if (room.clients.has(ws)) {
        room.clients.delete(ws);
        bc(room, { type: 'user:left', userId: user?.id });
        if (room.owner === user?.id) bc(room, { type: 'owner:disconnected' });
        console.log(`  [custom/${caseId}] ${user?.name} left (${room.clients.size})`);
      }
      if (room.clients.size === 0) setTimeout(() => { if (rooms.get(caseId)?.clients.size === 0) rooms.delete(caseId); }, 300000);
    });

    ws.on('error', e => console.error('Custom WS:', e.message));
  });
}

export function getRoomStats() {
  const stats = [];
  for (const [id, room] of rooms) stats.push({ caseId: id, clients: room.clients.size, pending: room.pending.size });
  return stats;
}
