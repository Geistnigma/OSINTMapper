import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { hashPassword } from '../services/auth.js';
import { MIN_PASSWORD_LENGTH } from './auth.js';
import { getCaseFileInfo } from '../services/caseFile.js';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const router = Router();
const prisma = new PrismaClient();

// All routes require admin
router.use(requireAuth, requireRole('ADMIN'));

/**
 * Refuse toute opération qui retirerait le dernier administrateur actif.
 *
 * Rien ne comptait les ADMIN restants : on pouvait rétrograder, désactiver ou
 * supprimer le dernier, et l'instance devenait ingérable - plus aucun compte
 * capable de créer un utilisateur ni d'administrer les enquêtes. La seule
 * sortie aurait été une intervention directe en base.
 *
 * @returns {Promise<string|null>} message d'erreur, ou null si l'opération passe
 */
async function refuseSiDernierAdmin(cibleId) {
  const cible = await prisma.user.findUnique({ where: { id: cibleId } });
  if (!cible || cible.role !== 'ADMIN' || !cible.active) return null; // ne retire aucun admin actif
  const admins = await prisma.user.count({ where: { role: 'ADMIN', active: true } });
  if (admins <= 1) {
    return { code: 'last_admin', error: "Opération refusée : c'est le dernier administrateur actif de l'instance." };
  }
  return null;
}

/**
 * Refuse toute opération sur le compte d'amorçage.
 *
 * Le garde-fou « dernier administrateur » ne suffisait pas : avec deux ADMIN,
 * on pouvait supprimer celui d'installation. Or c'est celui que la
 * documentation, le seed et l'entrypoint Docker connaissent - le recréer
 * demandait de repasser par la base.
 *
 * Sa protection est portée par la donnée (`User.protected`), pas par son nom :
 * un test sur `username === 'admin'` se serait effondré au premier renommage.
 */
async function refuseSiProtege(cibleId, action) {
  // `action` est une CLÉ ('demote', 'deactivate', 'delete'), pas un mot :
  // le client la traduit. Le message français reste pour les journaux et
  // pour les clients non mis à jour.
  const cible = await prisma.user.findUnique({ where: { id: cibleId }, select: { protected: true, username: true } });
  if (!cible?.protected) return null;
  return {
    code: 'protected_account',
    params: { nom: cible.username, action },
    error: `Le compte d'installation « ${cible.username} » ne peut pas être ${
      { demote: 'rétrogradé', deactivate: 'désactivé', delete: 'supprimé' }[action] || action
    }. C'est le compte qui garantit qu'il reste toujours un administrateur.`,
  };
}

// GET /api/users
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, email: true, role: true, active: true, protected: true, createdAt: true, lastLogin: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

// POST /api/users - admin creates a user
router.post('/', async (req, res) => {
  try {
    const { username, password, displayName, email, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ code: 'credentials_required', error: 'Username and password required' });
    if (username.length < 3) return res.status(400).json({ code: 'username_too_short', error: 'Username too short (min 3)' });
    if (password.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ code: 'password_too_short', error: `Mot de passe trop court (min ${MIN_PASSWORD_LENGTH})` });
    if (role && !['ADMIN', 'ANALYST', 'VIEWER'].includes(role)) return res.status(400).json({ code: 'bad_role', error: 'Invalid role' });

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(409).json({ code: 'username_taken', error: 'Username already taken' });

    const hash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, email: email || null, displayName: displayName || username, passwordHash: hash, role: role || 'ANALYST' },
    });

    await prisma.auditLog.create({ data: { action: 'admin:user_create', userId: req.user.id, details: `${username} (${role || 'ANALYST'})`, ip: req.ip } });
    res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role });
  } catch (e) {
    console.error('Admin create user error:', e.message);
    res.status(500).json({ code: 'server_error', error: 'Server error' });
  }
});

// PUT /api/users/:id/role
router.put('/:id/role', async (req, res) => {
  {
    const refus = await refuseSiProtege(req.params.id, 'demote');
    if (refus) return res.status(409).json(refus);
  }
  const { role } = req.body || {};
  if (!['ADMIN', 'ANALYST', 'VIEWER'].includes(role)) return res.status(400).json({ code: 'bad_role', error: 'Invalid role' });
  // Les routes toggle et delete se protégeaient déjà ; celle-ci ne le faisait
  // pas, un administrateur pouvait donc se rétrograder lui-même.
  if (req.params.id === req.user.id && role !== 'ADMIN') {
    return res.status(400).json({ code: 'self_demote', error: 'Vous ne pouvez pas retirer vos propres droits d\'administration.' });
  }
  if (role !== 'ADMIN') {
    const refus = await refuseSiDernierAdmin(req.params.id);
    if (refus) return res.status(400).json(refus);
  }
  await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  await prisma.auditLog.create({ data: { action: 'admin:user_role', userId: req.user.id, details: `${req.params.id} → ${role}`, ip: req.ip } });
  res.json({ ok: true });
});

// PUT /api/users/:id/toggle - activate/deactivate
router.put('/:id/toggle', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ code: 'self_deactivate', error: 'Cannot deactivate yourself' });
  {
    const refus = await refuseSiProtege(req.params.id, 'deactivate');
    if (refus) return res.status(409).json(refus);
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ code: 'user_not_found', error: 'User not found' });
  if (user.active) {
    const refus = await refuseSiDernierAdmin(req.params.id);
    if (refus) return res.status(400).json(refus);
  }
  await prisma.user.update({ where: { id: req.params.id }, data: { active: !user.active } });
  await prisma.auditLog.create({ data: { action: user.active ? 'admin:user_deactivate' : 'admin:user_activate', userId: req.user.id, details: req.params.id, ip: req.ip } });
  res.json({ ok: true, active: !user.active });
});

// PUT /api/users/:id/password - admin resets password
router.put('/:id/password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < MIN_PASSWORD_LENGTH)
    return res.status(400).json({ code: 'password_too_short', error: `Mot de passe trop court (min ${MIN_PASSWORD_LENGTH})` });
  const hash = await hashPassword(password);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: hash } });
  await prisma.auditLog.create({ data: { action: 'admin:user_password_reset', userId: req.user.id, details: req.params.id, ip: req.ip } });
  res.json({ ok: true });
});

// DELETE /api/users/:id - permanent delete
router.delete('/:id', async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ code: 'self_delete', error: 'Cannot delete yourself' });
  {
    const refus = await refuseSiProtege(req.params.id, 'delete');
    if (refus) return res.status(409).json(refus);
  }
  const refus = await refuseSiDernierAdmin(req.params.id);
  if (refus) return res.status(400).json(refus);
  // Remove case access first
  await prisma.caseAccess.deleteMany({ where: { userId: req.params.id } });
  await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
  await prisma.auditLog.create({ data: { action: 'admin:user_delete', userId: req.user.id, details: req.params.id, ip: req.ip } });
  res.json({ ok: true });
});

// GET /api/users/stats - global platform stats
router.get('/stats', async (req, res) => {
  try {
    const [userCount, activeUsers, caseCount, auditCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { active: true } }),
      prisma.case.count({ where: { status: { not: 'DELETED' } } }),
      prisma.auditLog.count(),
    ]);

    // Disk usage for case files
    // Depuis config.dataDir, et non process.cwd() : le répertoire courant
    // diffère selon le mode de lancement, le chemin changeait donc avec lui.
    const casesDir = path.join(config.dataDir, 'cases');
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
    res.status(500).json({ code: 'server_error', error: 'Stats error' });
  }
});

// GET /api/users/audit - audit log with pagination
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
    res.status(500).json({ code: 'server_error', error: 'Audit error' });
  }
});

export default router;
