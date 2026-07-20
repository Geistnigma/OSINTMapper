import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { hashPassword } from '../services/auth.js';
import { getCaseFileInfo } from '../services/caseFile.js';
import fs from 'fs';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

// All routes require admin
router.use(requireAuth, requireRole('ADMIN'));

// GET /api/users
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, email: true, role: true, active: true, createdAt: true, lastLogin: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

// POST /api/users — admin creates a user
router.post('/', async (req, res) => {
  try {
    const { username, password, displayName, email, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username too short (min 3)' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short (min 6)' });
    if (role && !['ADMIN', 'ANALYST', 'VIEWER'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, email: email || null, displayName: displayName || username, passwordHash: hash, role: role || 'ANALYST' },
    });

    await prisma.auditLog.create({ data: { action: 'admin:user_create', userId: req.user.id, details: `${username} (${role || 'ANALYST'})`, ip: req.ip } });
    res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role });
  } catch (e) {
    console.error('Admin create user error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/role
router.put('/:id/role', async (req, res) => {
  const { role } = req.body || {};
  if (!['ADMIN', 'ANALYST', 'VIEWER'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  await prisma.auditLog.create({ data: { action: 'admin:user_role', userId: req.user.id, details: `${req.params.id} → ${role}`, ip: req.ip } });
  res.json({ ok: true });
});

// PUT /api/users/:id/toggle — activate/deactivate
router.put('/:id/toggle', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  await prisma.user.update({ where: { id: req.params.id }, data: { active: !user.active } });
  await prisma.auditLog.create({ data: { action: user.active ? 'admin:user_deactivate' : 'admin:user_activate', userId: req.user.id, details: req.params.id, ip: req.ip } });
  res.json({ ok: true, active: !user.active });
});

// PUT /api/users/:id/password — admin resets password
router.put('/:id/password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password too short (min 6)' });
  const hash = await hashPassword(password);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: hash } });
  await prisma.auditLog.create({ data: { action: 'admin:user_password_reset', userId: req.user.id, details: req.params.id, ip: req.ip } });
  res.json({ ok: true });
});

// DELETE /api/users/:id — permanent delete
router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  // Remove case access first
  await prisma.caseAccess.deleteMany({ where: { userId: req.params.id } });
  await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
  await prisma.auditLog.create({ data: { action: 'admin:user_delete', userId: req.user.id, details: req.params.id, ip: req.ip } });
  res.json({ ok: true });
});

// GET /api/users/stats — global platform stats
router.get('/stats', async (req, res) => {
  try {
    const [userCount, activeUsers, caseCount, auditCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.case.count({ where: { status: { not: 'DELETED' } } }),
      prisma.auditLog.count(),
    ]);

    // Disk usage for case files
    const casesDir = path.resolve(process.cwd(), 'data', 'cases');
    let diskUsage = 0;
    try {
      const files = fs.readdirSync(casesDir);
      files.forEach(f => { try { diskUsage += fs.statSync(path.join(casesDir, f)).size; } catch {} });
    } catch {}

    // Recent activity (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const recentActions = await prisma.auditLog.count({ where: { createdAt: { gte: weekAgo } } });
    const recentLogins = await prisma.auditLog.count({ where: { action: 'auth:login', createdAt: { gte: weekAgo } } });

    res.json({ userCount, activeUsers, caseCount, auditCount, diskUsage, recentActions, recentLogins });
  } catch (e) {
    res.status(500).json({ error: 'Stats error' });
  }
});

// GET /api/users/audit — audit log with pagination
router.get('/audit', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, displayName: true } } },
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: 'Audit error' });
  }
});

export default router;
