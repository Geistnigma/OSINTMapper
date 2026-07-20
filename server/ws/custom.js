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
import { verifyWsToken } from '../middleware/auth.js';

const prisma = new PrismaClient();

// In-memory rooms for custom features
const rooms = new Map(); // caseId → { clients: Map<ws, user>, owner, pending: Map<userId, {ws,user}> }

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

        let authUser = null;
        if (msg.token) authUser = await verifyWsToken(msg.token);
        if (!authUser) return ws.send(JSON.stringify({ type: 'join:denied', reason: 'invalid_token' }));

        // Check DB ownership
        let dbRole = null;
        try {
          const access = await prisma.caseAccess.findUnique({
            where: { caseId_userId: { caseId: roomId, userId: authUser.id } },
          });
          dbRole = access?.role || null;
        } catch {}

        caseId = roomId;
        user = { id: authUser.id, name: authUser.displayName || authUser.username, role: authUser.role, color: msg.color || `hsl(${Math.random() * 360}, 70%, 60%)` };
        const room = getRoom(caseId);

        const isOwnerInDb = dbRole === 'OWNER';
        if (isOwnerInDb) { room.owner = user.id; room.ownerName = user.name; }
        else if (!room.owner) { room.owner = user.id; room.ownerName = user.name; }

        const isOwner = room.owner === user.id;
        const isAdmin = authUser.role === 'ADMIN';

        // Determine collab role: everyone is editor by default (viewer system disabled for production)
        let collabRole = 'editor';
        if (isOwner || isAdmin) {
          collabRole = 'editor';
        } else if (room.roles && room.roles[user.id]) {
          collabRole = room.roles[user.id]; // Restore saved role
        }

        // Store role
        if (!room.roles) room.roles = {};
        room.roles[user.id] = collabRole;

        // Auto-accept everyone (no more pending/approval)
        room.clients.set(ws, { ...user, collabRole });
        ws.send(JSON.stringify({ type: 'custom:init', userId: user.id, isOwner: isOwner || isAdmin, collabRole }));
        
        // Notify others including the role
        bc(room, { type: 'user:joined', user: { ...user, collabRole } }, ws);

        // Send current room roster to the new joiner
        const roster = [];
        for (const [, u] of room.clients) {
          roster.push({ id: u.id, name: u.name, color: u.color, collabRole: u.collabRole || room.roles[u.id] || 'viewer' });
        }
        ws.send(JSON.stringify({ type: 'roster', users: roster, roles: room.roles || {} }));

        // If not owner, notify owner that someone joined
        if (!isOwner && !isAdmin) {
          for (const [ows, ou] of room.clients) {
            if (ou.id === room.owner) {
              ows.send(JSON.stringify({ type: 'user:joined:notify', user: { id: user.id, name: user.name, color: user.color, collabRole } }));
            }
          }
        }

        console.log(`  [custom/${caseId}] ${user.name} joined as ${collabRole} (${isOwner ? 'owner' : isAdmin ? 'admin' : 'user'})`);
        return;
      }

      if (!caseId || !user) return;
      const room = rooms.get(caseId);
      if (!room) return;

      // ═══ ROLE CHANGE (owner toggles viewer/editor) ═══
      if (msg.type === 'role:set' && msg.targetUserId && msg.role && room.owner === user.id) {
        const newRole = msg.role === 'editor' ? 'editor' : 'viewer';
        if (!room.roles) room.roles = {};
        room.roles[msg.targetUserId] = newRole;
        // Update in clients map
        for (const [cws, cu] of room.clients) {
          if (cu.id === msg.targetUserId) {
            cu.collabRole = newRole;
            cws.send(JSON.stringify({ type: 'role:changed', collabRole: newRole }));
          }
        }
        // Broadcast updated roles to everyone
        bcAll(room, { type: 'roles:update', roles: room.roles });
        console.log(`  [custom/${caseId}] ${msg.targetUserId} → ${newRole} by owner`);
        return;
      }

      // ═══ CHAT ═══
      if (msg.type === 'chat' && msg.text) {
        bcAll(room, { type: 'chat', message: {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          userId: user.id, userName: user.name, userColor: user.color,
          text: msg.text.slice(0, 500), ts: new Date().toISOString(),
        }});
        return;
      }

      // ═══ KICK ═══
      if (msg.type === 'kick' && msg.targetUserId && room.owner === user.id) {
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
