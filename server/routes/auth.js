import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, signToken } from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    const user = await prisma.user.findUnique({ where: { username, active: true } });
    if (!user || !(await comparePassword(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid credentials' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const token = signToken({ id: user.id, username: user.username, role: user.role });

    await prisma.auditLog.create({ data: { action: 'auth:login', userId: user.id, ip: req.ip } });

    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 86400000 });
    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register (DISABLED — admin creates accounts)
router.post('/register', async (req, res) => {
  return res.status(403).json({ error: 'Inscription désactivée. Contactez l\'administrateur.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/password
router.post('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await comparePassword(currentPassword, user.passwordHash)))
      return res.status(401).json({ error: 'Current password incorrect' });

    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

export default router;
