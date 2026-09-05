import { Router } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, signToken } from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * Options du cookie de session.
 *
 * `secure` manquait : le cookie de session partait donc aussi en clair sur une
 * requête HTTP. Sur internet, il suffit d'une seule requête vers http:// avant
 * la redirection nginx - ou d'un point d'accès hostile - pour le capter.
 *
 * Les mêmes options doivent être passées à clearCookie : un cookie ne
 * s'efface que si l'attribut correspond, sinon la déconnexion laisse la
 * session valide côté navigateur.
 */
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  // `Secure` en production, SAUF si l'instance se déclare servie en clair.
  // Un cookie `Secure` n'est pas enregistré par le navigateur sur une origine
  // `http://` autre que localhost : sur un VPS joint par IP sans TLS, la
  // session ne s'installait jamais et l'échec était totalement muet.
  secure: config.isProd && !config.allowInsecureCookie,
  path: '/',
};

/** Longueur minimale d'un mot de passe. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Empreinte factice, comparée quand le compte n'existe pas, pour que l'échec
 * coûte le même temps dans les deux cas.
 *
 * Elle est CALCULÉE au démarrage, jamais recopiée en dur : bcryptjs rend
 * `false` immédiatement sur une chaîne mal formée, ce qui rétablirait
 * exactement l'écart de temps qu'on cherche à effacer. Aucun mot de passe ne
 * lui correspond - elle est dérivée d'une valeur aléatoire jamais conservée.
 */
const DUMMY_HASH = hashPassword(crypto.randomBytes(32).toString('hex')); // promesse, calculée une fois

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ code: 'missing_credentials', error: 'Missing credentials' });

    const user = await prisma.user.findUnique({ where: { username, active: true } });

    // Compte inexistant : on compare quand même, contre une empreinte factice.
    // Sans cela la réponse revenait sans le coût d'un bcrypt à 12 tours, et
    // l'écart de temps distinguait « ce compte n'existe pas » de « mauvais mot
    // de passe » - le message d'erreur a beau être générique, la montre parle.
    const empreinte = user?.passwordHash || (await DUMMY_HASH);
    const motDePasseOk = await comparePassword(password, empreinte);

    if (!user || !motDePasseOk) {
      // Les échecs n'étaient pas journalisés : une campagne de bourrage
      // d'identifiants ne laissait aucune trace, seules les réussites
      // apparaissaient au journal. Le nom d'utilisateur essayé est conservé,
      // jamais le mot de passe.
      await prisma.auditLog.create({
        data: {
          action: 'auth:login:failed',
          userId: user?.id || null,
          ip: req.ip,
          details: `identifiant essayé : ${String(username).slice(0, 64)}`,
        },
      }).catch(() => { /* le journal ne doit jamais bloquer la réponse */ });
      return res.status(401).json({ code: 'bad_credentials', error: 'Invalid credentials' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const token = signToken({ id: user.id, username: user.username, role: user.role });

    await prisma.auditLog.create({ data: { action: 'auth:login', userId: user.id, ip: req.ip } });

    res.cookie('token', token, { ...COOKIE_OPTS, maxAge: 86400000 });
    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ code: 'server_error', error: 'Server error' });
  }
});

// POST /api/auth/register (DISABLED - admin creates accounts)
router.post('/register', async (req, res) => {
  return res.status(403).json({ code: 'signup_disabled', error: 'Inscription désactivée. Contactez l\'administrateur.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/password
router.post('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ code: 'missing_fields', error: 'Missing fields' });
    // 6 caractères se cassent hors ligne en quelques minutes. Sur une
    // application d'enquête accessible depuis internet, le mot de passe est la
    // seule barrière devant les données : 12 minimum.
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ code: 'password_too_short', error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères` });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await comparePassword(currentPassword, user.passwordHash)))
      return res.status(401).json({ code: 'bad_current_password', error: 'Current password incorrect' });

    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ code: 'server_error', error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTS);
  res.json({ ok: true });
});

export default router;
