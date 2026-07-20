import { PrismaClient } from '@prisma/client';
import { verifyToken } from '../services/auth.js';

const prisma = new PrismaClient();

export function requireAuth(req, res, next) {
  let token = null;

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) token = header.slice(7);
  if (!token && req.cookies?.token) token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

  prisma.user.findUnique({ where: { id: payload.id, active: true } })
    .then(user => {
      if (!user) return res.status(401).json({ error: 'User not found' });
      req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
      next();
    })
    .catch(() => res.status(500).json({ error: 'Auth error' }));
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

// For WebSocket: verify token and return user
export async function verifyWsToken(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.id, active: true } });
  if (!user) return null;
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}
