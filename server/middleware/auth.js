import { PrismaClient } from '@prisma/client';
import { verifyToken } from '../services/auth.js';

const prisma = new PrismaClient();

export function requireAuth(req, res, next) {
  let token = null;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) token = header.slice(7);
  if (!token && req.cookies?.token) token = req.cookies.token;
  if (!token) return res.status(401).json({ code: 'auth_required', error: 'Authentication required' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ code: 'bad_token', error: 'Invalid or expired token' });

  prisma.user.findUnique({ where: { id: payload.id, active: true } })
    .then(user => {
      if (!user) return res.status(401).json({ code: 'user_not_found', error: 'User not found' });
      req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
      next();
    })
    .catch(() => res.status(500).json({ code: 'server_error', error: 'Auth error' }));
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 'auth_required', error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ code: 'forbidden', error: 'Insufficient permissions' });
    next();
  };
}

/** Charge un utilisateur actif par son id (utilisé après validation d'un ticket WS). */
export async function getUserById(id) {
  const user = await prisma.user.findUnique({ where: { id, active: true } });
  if (!user) return null;
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

// For WebSocket: verify token and return user
export async function verifyWsToken(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.id, active: true } });
  if (!user) return null;
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}
