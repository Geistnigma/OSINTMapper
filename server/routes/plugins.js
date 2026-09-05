/**
 * Plugins installés à l'exécution.
 *
 * Jusqu'ici un plugin était compilé dans le bundle client : l'ajouter exigeait
 * un accès au dépôt, un `npm run build` et un redéploiement. Ces routes
 * permettent à un ADMIN de déposer un plugin déjà buildé (module ESM), que les
 * utilisateurs activent ensuite individuellement.
 *
 * Modèle de confiance assumé : le bundle s'exécute avec les mêmes privilèges que
 * l'application (DOM, réseau, stockage). Le dépôt est donc réservé aux ADMIN,
 * l'empreinte SHA-256 est enregistrée et affichée, et chaque installation est
 * journalisée. Ce n'est PAS un bac à sable.
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();
const prisma = new PrismaClient();
// Racine des données : configurable par DATA_DIR (voir config.js).
const PLUGINS_DIR = path.join(config.dataDir, 'plugins');
if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Doit suivre SDK_VERSION de client/src/plugins/core/context.js
const HOST_SDK_MAJOR = '2';

router.use(requireAuth);

/** Le fichier servi ne peut jamais sortir du répertoire des plugins. */
function bundlePath(id) {
  if (!ID_RE.test(id)) throw new Error('id de plugin invalide');
  return path.join(PLUGINS_DIR, `${id}.js`);
}

// ═══ LISTE (tous les utilisateurs) ═══
// Renvoie les plugins approuvés, accompagnés de la préférence de l'appelant.
router.get('/', async (req, res) => {
  try {
    const plugins = await prisma.plugin.findMany({
      where: req.user.role === 'ADMIN' ? {} : { approved: true },
      orderBy: { installedAt: 'desc' },
    });
    const prefs = await prisma.pluginPreference.findMany({ where: { userId: req.user.id } });
    const byId = Object.fromEntries(prefs.map(p => [p.pluginId, p]));

    res.json(plugins.map(p => ({
      id: p.id, name: p.name, version: p.version, sdkVersion: p.sdkVersion,
      description: p.description, author: p.author, category: p.category, icon: p.icon,
      manifest: JSON.parse(p.manifest || '{}'),
      docs: p.docs || null,
      bundleHash: p.bundleHash, size: p.size,
      approved: p.approved, installedAt: p.installedAt,
      source: 'runtime',
      enabled: !!byId[p.id]?.enabled,
      settings: byId[p.id]?.settings ? JSON.parse(byId[p.id].settings) : {},
    })));
  } catch (e) { console.error('Plugins list:', e.message); res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

// ═══ BUNDLE (module ESM chargé par import()) ═══
router.get('/:id/bundle', async (req, res) => {
  try {
    const p = await prisma.plugin.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).end();
    if (!p.approved && req.user.role !== 'ADMIN') return res.status(404).end();

    const file = bundlePath(p.id);
    if (!fs.existsSync(file)) return res.status(404).end();

    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Le hash identifie la version exacte servie (utile au diagnostic)
    res.setHeader('X-Plugin-Hash', p.bundleHash);
    res.sendFile(file);
  } catch (e) { res.status(404).end(); }
});

// ═══ INSTALLATION (ADMIN) ═══
router.post('/', requireRole('ADMIN'), async (req, res) => {
  try {
    const { manifest, code, docs } = req.body || {};
    if (!manifest || typeof manifest !== 'object') return res.status(400).json({ code: 'manifest_required', error: 'manifest requis' });
    if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ code: 'code_required', error: 'code requis' });
    if (!ID_RE.test(manifest.id || '')) return res.status(400).json({ code: 'bad_plugin_id', error: 'id invalide (kebab-case)' });
    if (!manifest.name) return res.status(400).json({ code: 'name_required', error: 'name requis' });

    // Rejeter tôt un SDK incompatible : sinon le plugin est stocké, apparaît
    // dans la liste, et n'échoue qu'au chargement chez chaque utilisateur.
    if (manifest.sdkVersion && String(manifest.sdkVersion).split('.')[0] !== HOST_SDK_MAJOR) {
      return res.status(400).json({
        error: `sdkVersion ${manifest.sdkVersion} incompatible - l'hôte attend ${HOST_SDK_MAJOR}.x`,
      });
    }
    if (Buffer.byteLength(code, 'utf8') > MAX_BUNDLE_BYTES) {
      return res.status(400).json({ code: 'bundle_too_large', error: `bundle trop volumineux (max ${MAX_BUNDLE_BYTES / 1024 / 1024} Mo)` });
    }

    const buf = Buffer.from(code, 'utf8');
    const bundleHash = crypto.createHash('sha256').update(buf).digest('hex');

    fs.writeFileSync(bundlePath(manifest.id), buf);

    const data = {
      id: manifest.id,
      name: manifest.name,
      version: String(manifest.version || '0.0.0'),
      sdkVersion: manifest.sdkVersion ? String(manifest.sdkVersion) : null,
      description: manifest.description || null,
      author: manifest.author || null,
      category: manifest.category || null,
      icon: manifest.icon || null,
      manifest: JSON.stringify(manifest),
      docs: typeof docs === 'string' ? docs : null,
      bundleHash,
      size: buf.length,
      approved: true, // déposé par un ADMIN : approuvé d'emblée
      installedBy: req.user.id,
    };

    const saved = await prisma.plugin.upsert({
      where: { id: manifest.id },
      create: data,
      update: { ...data, installedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        action: 'plugin:install', userId: req.user.id, ip: req.ip,
        details: `${saved.id}@${saved.version} sha256=${bundleHash.slice(0, 16)}`,
      },
    });

    res.json({ ok: true, id: saved.id, bundleHash, size: saved.size });
  } catch (e) { console.error('Plugin install:', e.message); res.status(500).json({ error: e.message }); }
});

// ═══ APPROBATION / SUSPENSION (ADMIN) ═══
router.put('/:id/approved', requireRole('ADMIN'), async (req, res) => {
  try {
    const approved = !!req.body?.approved;
    await prisma.plugin.update({ where: { id: req.params.id }, data: { approved } });
    await prisma.auditLog.create({
      data: { action: approved ? 'plugin:approve' : 'plugin:suspend', userId: req.user.id, details: req.params.id, ip: req.ip },
    });
    res.json({ ok: true, approved });
  } catch (e) { res.status(404).json({ code: 'plugin_not_found', error: 'Plugin introuvable' }); }
});

// ═══ DÉSINSTALLATION (ADMIN) ═══
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.plugin.delete({ where: { id: req.params.id } });
    try { fs.unlinkSync(bundlePath(req.params.id)); } catch { /* déjà absent */ }
    await prisma.auditLog.create({ data: { action: 'plugin:uninstall', userId: req.user.id, details: req.params.id, ip: req.ip } });
    res.json({ ok: true });
  } catch (e) { res.status(404).json({ code: 'plugin_not_found', error: 'Plugin introuvable' }); }
});

// ═══ PRÉFÉRENCE UTILISATEUR (activation + réglages) ═══
router.put('/:id/preference', async (req, res) => {
  try {
    const p = await prisma.plugin.findUnique({ where: { id: req.params.id } });
    if (!p || (!p.approved && req.user.role !== 'ADMIN')) return res.status(404).json({ code: 'plugin_not_found', error: 'Plugin introuvable' });

    const enabled = req.body?.enabled;
    const settings = req.body?.settings;
    const data = {};
    if (typeof enabled === 'boolean') data.enabled = enabled;
    if (settings && typeof settings === 'object') data.settings = JSON.stringify(settings);

    const saved = await prisma.pluginPreference.upsert({
      where: { pluginId_userId: { pluginId: req.params.id, userId: req.user.id } },
      create: { pluginId: req.params.id, userId: req.user.id, enabled: !!data.enabled, settings: data.settings || null },
      update: data,
    });
    res.json({ ok: true, enabled: saved.enabled });
  } catch (e) { console.error('Plugin pref:', e.message); res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

export default router;
