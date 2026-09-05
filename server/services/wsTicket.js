/**
 * Tickets de connexion WebSocket.
 *
 * L'API WebSocket du navigateur n'accepte pas d'en-tête personnalisé : le jeton
 * ne peut voyager que dans l'URL. Or nginx journalise l'URL complète, si bien
 * qu'un JWT de session - valable 24 h et donnant accès à TOUTES les enquêtes de
 * l'utilisateur - finissait en clair dans access.log.
 *
 * Un ticket évite cela : il est éphémère, limité à UNE enquête et à UN
 * utilisateur, et révocable à la déconnexion. Sa fuite via les logs n'expose
 * donc qu'un périmètre réduit et temporaire.
 *
 * Volontairement réutilisable pendant sa durée de vie : y-websocket rejoue la
 * même URL à chaque reconnexion automatique, et un ticket à usage unique
 * casserait toute reprise après coupure réseau.
 */
import crypto from 'crypto';

const TICKET_TTL_MS = 2 * 60 * 60 * 1000; // 2 h - durée d'une session de travail

const tickets = new Map(); // ticket → { userId, caseId, expiresAt }

/** Émet un ticket pour un couple (utilisateur, enquête). */
export function issueTicket(userId, caseId) {
  const ticket = crypto.randomBytes(24).toString('base64url');
  tickets.set(ticket, { userId, caseId, expiresAt: Date.now() + TICKET_TTL_MS });
  return { ticket, expiresIn: TICKET_TTL_MS };
}

/**
 * Vérifie un ticket pour une enquête donnée.
 * @returns {{userId}|null}
 */
export function consumeTicket(ticket, caseId) {
  if (!ticket) return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { tickets.delete(ticket); return null; }
  if (entry.caseId !== caseId) return null;
  return { userId: entry.userId };
}

/** Révoque tous les tickets d'un utilisateur (déconnexion). */
export function revokeUserTickets(userId) {
  for (const [t, e] of tickets) if (e.userId === userId) tickets.delete(t);
}

// Purge périodique des tickets expirés
setInterval(() => {
  const now = Date.now();
  for (const [t, e] of tickets) if (now > e.expiresAt) tickets.delete(t);
}, 10 * 60 * 1000).unref();
