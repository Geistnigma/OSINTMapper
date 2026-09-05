import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { MIN_PASSWORD_LENGTH } from './auth.js';
import { requireCaseAccess, requireCaseRole } from '../middleware/caseAccess.js';
import { createInvite, verifyInvite, consumeInvite, revokeInvite } from '../services/invite.js';
import { issueTicket } from '../services/wsTicket.js';
import { saveCaseFile, loadCaseFile, getCaseFileInfo, deleteCaseFile, getCaseFileBuffer, importCaseFile } from '../services/caseFile.js';
import { createSnapshot, maybeAutoSnapshot, listSnapshots, restoreSnapshot, deleteSnapshots } from '../services/snapshots.js';
import { buildArchive, archiveFilename } from '../services/archive.js';
import { closeYjsRoom, reconnectYjsUser } from '../ws/yjs.js';
import { expulserDeLaSalle } from '../ws/custom.js';
import { config } from '../config.js';

const router = Router();
const prisma = new PrismaClient();
// Racine des données : configurable par DATA_DIR (voir config.js).
const UPLOADS_DIR = path.join(config.dataDir, 'uploads');

const ja = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || []); } catch { return []; } };

// Clés de déchiffrement gardées en mémoire : caseId → { userId → {password, expiresAt} }
// Elles n'expiraient jamais - le mot de passe d'une enquête chiffrée restait en
// RAM jusqu'au redémarrage, ce qui vide de son sens le chiffrement au repos.
const sessionKeys = new Map();
const SESSION_KEY_TTL_MS = 2 * 60 * 60 * 1000; // 2 h d'inactivité

function getSessionKey(caseId, userId) {
  const entry = sessionKeys.get(caseId)?.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionKeys.get(caseId).delete(userId);
    return null;
  }
  // Prolonge tant que l'utilisateur travaille sur l'enquête
  entry.expiresAt = Date.now() + SESSION_KEY_TTL_MS;
  return entry.password;
}
function setSessionKey(caseId, userId, password) {
  if (!sessionKeys.has(caseId)) sessionKeys.set(caseId, new Map());
  sessionKeys.get(caseId).set(userId, { password, expiresAt: Date.now() + SESSION_KEY_TTL_MS });
}
function clearSessionKeys(caseId) {
  sessionKeys.delete(caseId);
}

// Balayage périodique : sans cela une clé jamais relue resterait en mémoire.
setInterval(() => {
  const now = Date.now();
  for (const [caseId, users] of sessionKeys) {
    for (const [userId, entry] of users) if (now > entry.expiresAt) users.delete(userId);
    if (users.size === 0) sessionKeys.delete(caseId);
  }
}, 15 * 60 * 1000).unref();

// Le déchiffrement est un point de brute-force : on limite les tentatives par IP.
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { code: 'too_many_unlocks', error: 'Trop de tentatives de déverrouillage. Réessayez plus tard.' },
});

router.use(requireAuth);

/**
 * Normalise les réglages d'une enquête reçus du client.
 *
 * Le formulaire de création affichait six « options avancées » dont AUCUNE
 * n'était transmise ni stockée : disposition automatique, plafond de nœuds,
 * couleur de fond… configurées par l'utilisateur puis jetées à la soumission.
 * On ne conserve donc que ce qui est réellement appliqué quelque part.
 */
function normaliserSettings(brut) {
  const s = (brut && typeof brut === 'object') ? brut : {};
  const out = {};
  // Rôle attribué par défaut aux invitations de cette enquête.
  if (['VIEWER', 'ANALYST'].includes(s.invitedRole)) out.invitedRole = s.invitedRole;
  // Plugins recommandés : ils seront proposés à l'ouverture, jamais imposés -
  // l'activation reste une préférence par utilisateur.
  if (Array.isArray(s.plugins)) {
    out.plugins = s.plugins
      .filter(id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
      .slice(0, 32);
  }
  return Object.keys(out).length ? out : null;
}

// ═══ LIST ═══
router.get('/', async (req, res) => {
  try {
    const where = { status: { not: 'DELETED' } };
    const include = {
      access: { include: { user: { select: { id: true, username: true, displayName: true } } } },
    };

    let cases;
    if (req.user.role === 'ADMIN') {
      cases = await prisma.case.findMany({ where, include, orderBy: { updatedAt: 'desc' } });
    } else {
      cases = await prisma.case.findMany({
        where: { ...where, access: { some: { userId: req.user.id } } },
        include, orderBy: { updatedAt: 'desc' },
      });
    }

    res.json(cases.map(c => {
      const fileInfo = getCaseFileInfo(c.id);
      return {
        id: c.id, title: c.title, description: c.description,
        tags: ja(c.tags), status: c.status, encrypted: c.encrypted,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
        fileSize: fileInfo.size,
        collaborators: c.access.map(a => ({ ...a.user, role: a.role })),
      };
    }));
  } catch (e) { console.error(e); res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

// ═══ CREATE ═══
router.post('/', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  try {
    const { title, description, tags, encrypted, encryptionPassword, settings } = req.body || {};
    if (!title) return res.status(400).json({ code: 'title_required', error: 'Title required' });
    if (encrypted && !encryptionPassword) return res.status(400).json({ code: 'password_required_encrypted', error: 'Password required for encrypted cases' });
    // Ce mot de passe est la seule chose qui protège le fichier d'enquête au
    // repos : c'est lui qu'un attaquant attaquera hors ligne s'il obtient une
    // copie du disque, sans limite de débit. 6 caractères n'y résistent pas.
    if (encrypted && encryptionPassword.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ code: 'password_too_short_encryption', error: `Le mot de passe de chiffrement doit faire au moins ${MIN_PASSWORD_LENGTH} caractères` });

    const c = await prisma.case.create({
      data: {
        title, description: description || null,
        tags: JSON.stringify(tags || []),
        encrypted: !!encrypted,
        settings: (() => { const n = normaliserSettings(settings); return n ? JSON.stringify(n) : null; })(),
        access: { create: { userId: req.user.id, role: 'OWNER' } },
      },
    });

    // Create empty case file
    await saveCaseFile(c.id, { meta: { title, description }, entities: [], links: [], stickers: [], postits: [] }, {
      encrypted: !!encrypted,
      password: encryptionPassword || null,
    });

    // Store session key if encrypted
    if (encrypted) setSessionKey(c.id, req.user.id, encryptionPassword);

    await prisma.auditLog.create({ data: { action: 'case:create', userId: req.user.id, caseId: c.id } });
    res.json({ id: c.id, title: c.title, encrypted: c.encrypted });
  } catch (e) { console.error(e); res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

// ═══ GET CASE (load data) ═══
router.get('/:id', requireCaseAccess, async (req, res) => {
  try {
    const c = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        access: { include: { user: { select: { id: true, username: true, displayName: true } } } },
        history: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!c) return res.status(404).json({ code: 'case_not_found', error: 'Case not found' });

    // Load file data
    let data = null;
    const fileInfo = getCaseFileInfo(c.id);

    if (fileInfo.exists) {
      if (c.encrypted) {
        const password = getSessionKey(c.id, req.user.id);
        if (!password) {
          return res.json({
            id: c.id, title: c.title, description: c.description,
            tags: ja(c.tags), status: c.status, encrypted: true,
            needsUnlock: true,
            collaborators: c.access.map(a => ({ ...a.user, role: a.role })),
          });
        }
        try {
          data = await loadCaseFile(c.id, password);
        } catch (e) {
          return res.status(403).json({ error: e.message });
        }
      } else {
        data = await loadCaseFile(c.id);
      }
    }

    res.json({
      id: c.id, title: c.title, description: c.description,
      tags: ja(c.tags), status: c.status, encrypted: c.encrypted,
      settings: c.settings ? JSON.parse(c.settings) : {},
      entities: data?.entities || [],
      links: data?.links || [],
      stickers: data?.stickers || [],
      postits: data?.postits || [],
      collaborators: c.access.map(a => ({ ...a.user, role: a.role })),
      history: c.history,
    });
  } catch (e) { console.error(e); res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

// ═══ UNLOCK (send password for encrypted case) ═══
router.post('/:id/unlock', requireCaseAccess, unlockLimiter, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ code: 'password_required', error: 'Password required' });

    const c = req.case;
    if (!c.encrypted) return res.status(400).json({ code: 'case_not_encrypted', error: 'Case not encrypted' });

    // Try to decrypt - throws on wrong password
    const data = await loadCaseFile(c.id, password);
    setSessionKey(c.id, req.user.id, password);

    res.json({
      ok: true,
      entities: data?.entities || [],
      links: data?.links || [],
      stickers: data?.stickers || [],
      postits: data?.postits || [],
    });
  } catch (e) {
    if (e.message === 'Mot de passe incorrect ou fichier corrompu') {
      return res.status(403).json({ error: e.message });
    }
    res.status(500).json({ code: 'server_error', error: 'Server error' });
  }
});

// ═══ SAVE (auto-save from client) ═══
router.post('/:id/save', requireRole('ADMIN', 'ANALYST'), requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), async (req, res) => {
  try {
    const caseId = req.params.id;
    const { entities, links, stickers, postits } = req.body;

    const c = req.case;

    const password = c.encrypted ? getSessionKey(caseId, req.user.id) : null;
    if (c.encrypted && !password) return res.status(403).json({ code: 'session_expired', error: 'Session expired. Please unlock the case again.' });

    // Load existing data to merge (in case only some fields are sent)
    let existing = { entities: [], links: [], stickers: [], postits: [], meta: {} };
    try { existing = await loadCaseFile(caseId, password) || existing; } catch {}

    await saveCaseFile(caseId, {
      meta: existing.meta || { title: c.title, description: c.description },
      entities: entities || existing.entities || [],
      links: links || existing.links || [],
      stickers: stickers || existing.stickers || [],
      postits: postits || existing.postits || [],
    }, { encrypted: c.encrypted, password });

    await prisma.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } });

    // Point de restauration, au plus un toutes les 5 minutes. La sauvegarde est
    // déjà écrite : un échec ici ne doit pas la faire échouer, d'où le service
    // qui absorbe ses propres erreurs.
    maybeAutoSnapshot(caseId, req.user.id);

    res.json({ ok: true, ts: Date.now() });
  } catch (e) {
    console.error('Save error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══ HISTORIQUE DE VERSIONS ═══
// L'annulation vit en mémoire et ne survit pas à un rechargement : ces points
// de restauration sont le seul filet au-delà de la session.

router.get('/:id/snapshots', requireCaseAccess, async (req, res) => {
  try {
    const rows = await listSnapshots(req.params.id);
    res.json(rows.map(r => ({
      id: r.id, createdAt: r.createdAt, size: r.size, auto: r.auto,
      label: r.label, entities: r.entities, links: r.links,
      encrypted: r.ext === 'enc',
    })));
  } catch (e) { console.error('Snapshots list:', e.message); res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

// Point de restauration manuel, avant une manipulation risquée.
router.post('/:id/snapshots', requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), async (req, res) => {
  try {
    const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 120).trim() : null;
    const snap = await createSnapshot(req.params.id, { userId: req.user.id, auto: false, label: label || null });
    if (!snap) return res.status(409).json({ code: 'case_empty', error: "Cette enquête n'a pas encore de données à archiver" });
    res.json({ ok: true, id: snap.id, createdAt: snap.createdAt });
  } catch (e) { console.error('Snapshot create:', e.message); res.status(500).json({ error: e.message }); }
});

// Restauration - réservée au propriétaire : elle écrase le travail de tous les
// participants, ce n'est pas une action d'analyste.
router.post('/:id/snapshots/:snapId/restore', requireCaseAccess, requireCaseRole('OWNER'), async (req, res) => {
  try {
    const caseId = req.params.id;
    const snap = await restoreSnapshot(caseId, req.params.snapId, req.user.id);

    // Le fichier est restauré, mais le document Yjs en mémoire contient encore
    // l'ancien état et le réécrirait dans la seconde. On ferme la salle : les
    // clients se reconnectent sur une salle vide, qui repart du fichier.
    const closed = closeYjsRoom(caseId);

    await prisma.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } });
    await prisma.auditLog.create({
      data: {
        action: 'case:restore', userId: req.user.id, caseId, ip: req.ip,
        details: `instantané ${snap.id} du ${new Date(snap.createdAt).toISOString()} - ${closed} client(s) déconnecté(s)`,
      },
    });

    res.json({ ok: true, restoredFrom: snap.createdAt, clientsDisconnected: closed });
  } catch (e) {
    console.error('Snapshot restore:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// ═══ UPDATE METADATA ═══
router.put('/:id', requireRole('ADMIN', 'ANALYST'), requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), async (req, res) => {
  const { title, description, tags, status } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (tags !== undefined) data.tags = JSON.stringify(tags);
  if (status !== undefined) data.status = status;
  await prisma.case.update({ where: { id: req.params.id }, data });
  res.json({ ok: true });
});

// ═══ DELETE ═══
// Suppression réservée au propriétaire de l'enquête (ou à un ADMIN plateforme).
router.delete('/:id', requireCaseAccess, requireCaseRole('OWNER'), async (req, res) => {
  const caseId = req.params.id;
  await prisma.case.update({ where: { id: caseId }, data: { status: 'DELETED' } });
  deleteCaseFile(caseId);
  // Les instantanés contiennent le graphe complet : une enquête supprimée ne
  // doit pas en laisser derrière elle, ni sur le disque ni en base.
  await deleteSnapshots(caseId);
  clearSessionKeys(caseId);

  // Les pièces jointes doivent partir avec l'enquête, sinon les images
  // resteraient sur le disque après la « suppression ».
  const uploads = await prisma.upload.findMany({ where: { caseId } });
  for (const u of uploads) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, u.id)); } catch { /* déjà absent */ }
  }
  await prisma.upload.deleteMany({ where: { caseId } });

  // Toute invitation en circulation devient caduque
  await prisma.invite.updateMany({ where: { caseId, revokedAt: null }, data: { revokedAt: new Date() } });

  await prisma.auditLog.create({ data: { action: 'case:delete', userId: req.user.id, caseId, details: `${uploads.length} fichier(s) supprimé(s)` } });
  res.json({ ok: true });
});

// ═══ EXPORT (download JSON/enc file) ═══
router.get('/:id/export', requireCaseAccess, async (req, res) => {
  try {
    const c = req.case;

    const file = getCaseFileBuffer(c.id);
    if (!file) return res.status(404).json({ code: 'no_file_data', error: 'No file data' });

    const safeName = c.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}${file.encrypted ? '.enc' : '.json'}"`);
    res.setHeader('Content-Type', file.encrypted ? 'application/octet-stream' : 'application/json');
    res.send(file.buffer);
  } catch (e) { res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

// ═══ ARCHIVE COMPLÈTE (.omcase) ═══
// L'export ci-dessus ne renvoie que le graphe, dans lequel une photo n'est
// qu'une URL : les pièces jointes ne voyagent pas avec lui. L'archive les
// embarque. Les deux coexistent tant que l'import ne sait pas lire le zip -
  // n'offrir que l'archive laisserait l'utilisateur avec un fichier qu'il ne
// pourrait pas réimporter.
router.get('/:id/archive', requireCaseAccess, async (req, res) => {
  try {
    const c = req.case;

    const file = getCaseFileBuffer(c.id);
    if (!file) return res.status(404).json({ code: 'no_file_data', error: 'No file data' });

    const uploads = await prisma.upload.findMany({
      where: { caseId: c.id },
      select: { id: true, ext: true, size: true },
    });

    const { buffer, manifest } = buildArchive({
      caseId: c.id,
      meta: { title: c.title, description: c.description },
      file,
      uploads,
    });

    await prisma.auditLog.create({ data: { action: 'case:archive', userId: req.user.id, caseId: c.id } });

    res.setHeader('Content-Disposition', `attachment; filename="${archiveFilename(c.title)}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('X-Archive-Uploads', String(manifest.uploads.length));
    res.setHeader('X-Archive-Missing', String(manifest.missingUploads.length));
    res.send(buffer);
  } catch (e) {
    if (e.message === 'ENCRYPTED_UNSUPPORTED') {
      return res.status(409).json({ code: 'archive_encrypted', error: "Une enquête chiffrée ne peut pas encore être archivée : ses pièces jointes ne le sont pas. Utilisez l'export du graphe seul." });
    }
    console.error('Archive error:', e.message);
    res.status(500).json({ code: 'server_error', error: 'Server error' });
  }
});

// ═══ IMPORT (upload JSON/enc file) ═══
router.post('/import', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  try {
    const { title, fileData, password, encrypted } = req.body || {};
    if (!title || !fileData) return res.status(400).json({ code: 'import_fields_required', error: 'title and fileData required' });

    // Create case in DB
    const c = await prisma.case.create({
      data: {
        title, encrypted: !!encrypted,
        access: { create: { userId: req.user.id, role: 'OWNER' } },
      },
    });

    // Parse and save the file
    const buffer = Buffer.from(fileData, 'base64');
    const result = await importCaseFile(c.id, buffer, password || null);

    if (result.encrypted && password) setSessionKey(c.id, req.user.id, password);

    await prisma.auditLog.create({ data: { action: 'case:import', userId: req.user.id, caseId: c.id } });
    res.json({ id: c.id, title: c.title, encrypted: result.encrypted });
  } catch (e) {
    if (e.message === 'PASSWORD_REQUIRED') return res.status(400).json({ code: 'file_encrypted', error: 'This file is encrypted. Please provide a password.' });
    if (e.message.includes('Mot de passe')) return res.status(403).json({ error: e.message });
    console.error('Import error:', e.message);
    res.status(500).json({ code: 'server_error', error: 'Server error' });
  }
});

// ═══ ACCESS (gestion des membres - propriétaire uniquement) ═══
/**
 * Retire un membre de l'enquête.
 *
 * Le retrait était impossible : `POST /:id/access` ne savait qu'accorder ou
 * changer un rôle. Or « être invité » revient à être inscrit sur l'enquête -
 * il fallait donc pouvoir désinscrire, sinon la liste des membres ne faisait
 * que croître, sans moyen de revenir sur une invitation partagée trop large.
 *
 * Le retrait est immédiat : l'accès disparaît en base, et les sockets de
 * l'intéressé sont coupées (salle collaborative ET synchronisation Yjs). Sans
 * cette coupure il aurait continué à tout voir jusqu'à son prochain
 * rechargement.
 */
router.delete('/:id/access/:userId', requireCaseAccess, requireCaseRole('OWNER'), async (req, res) => {
  const { id: caseId, userId } = req.params;

  const acces = await prisma.caseAccess.findUnique({ where: { caseId_userId: { caseId, userId } } });
  if (!acces) {
    // Pas de ligne CaseAccess : soit le compte n'a effectivement rien à voir
    // avec l'enquête, soit - et c'est le cas courant - c'est un ADMIN de la
    // plateforme, qui accède à tout sans y être inscrit. Le message générique
    // « pas membre » était exact mais incompréhensible : on distingue.
    const cible = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, username: true } });
    if (cible?.role === 'ADMIN') {
      return res.status(409).json({
        error: `« ${cible.username} » est ADMIN de la plateforme : il accède à toutes les enquêtes sans y être inscrit. Son accès se retire depuis l'écran Administration, en changeant son rôle de compte.`,
      });
    }
    return res.status(404).json({ code: 'not_member', error: "Ce compte n'est pas membre de cette enquête." });
  }

  // Un propriétaire ne se retire pas par cette route : l'enquête se
  // retrouverait sans personne pour gérer ses accès.
  if (acces.role === 'OWNER') {
    return res.status(409).json({ code: 'owner_not_removable', error: "Le propriétaire ne peut pas être retiré de son enquête." });
  }

  await prisma.caseAccess.delete({ where: { caseId_userId: { caseId, userId } } });
  await prisma.auditLog.create({
    data: { action: 'case:access:revoke', userId: req.user.id, caseId, details: `${userId} retiré` },
  });

  const fermees = expulserDeLaSalle(caseId, userId);
  reconnectYjsUser(caseId, userId);

  res.json({ ok: true, socketsFermees: fermees });
});

router.post('/:id/access', requireCaseAccess, requireCaseRole('OWNER'), async (req, res) => {
  // VIEWER par défaut : accorder l'écriture doit être un geste délibéré.
  const { userId, role = 'VIEWER' } = req.body || {};
  if (!userId) return res.status(400).json({ code: 'user_id_required', error: 'userId required' });
  // On n'autorise pas la création d'un second propriétaire par cette route
  const granted = ['ANALYST', 'VIEWER'].includes(role) ? role : 'VIEWER';
  await prisma.caseAccess.upsert({
    where: { caseId_userId: { caseId: req.params.id, userId } },
    create: { caseId: req.params.id, userId, role: granted },
    update: { role: granted },
  });
  await prisma.auditLog.create({
    data: { action: 'case:access:grant', userId: req.user.id, caseId: req.params.id, details: `${userId} → ${granted}` },
  });
  res.json({ ok: true, role: granted });
});

// ═══ INVITE (génère un lien d'invitation révocable) ═══
router.post('/:id/invite', requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), async (req, res) => {
  // **Toute invitation donne la LECTURE SEULE**, sans exception.
  //
  // Le rôle était configurable à la création de l'enquête (`invitedRole`) et
  // surchargeable dans le corps de la requête. Un lien d'invitation circule,
  // se transfère, et peut être présenté par quelqu'un d'autre que le
  // destinataire prévu : lui faire porter le droit d'écrire revient à confier
  // ce droit à qui détient le lien. L'écriture s'accorde donc nommément, à une
  // personne présente, par le bouton du panneau Personnes.
  const { token, expiresAt, role: granted } = await createInvite(prisma, req.params.id, req.user.id, 'VIEWER');
  await prisma.auditLog.create({
    data: { action: 'case:invite:create', userId: req.user.id, caseId: req.params.id, details: `role=${granted}` },
  });
  res.json({ ok: true, token, expiresAt, role: granted });
});

// ═══ TICKET WEBSOCKET (évite de faire transiter le JWT dans l'URL /yjs) ═══
router.post('/:id/ws-ticket', requireCaseAccess, (req, res) => {
  const { ticket, expiresIn } = issueTicket(req.user.id, req.params.id);
  res.json({ ticket, expiresIn });
});

// ═══ LISTE DES INVITATIONS EN COURS ═══
router.get('/:id/invites', requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), async (req, res) => {
  const invites = await prisma.invite.findMany({
    where: { caseId: req.params.id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, role: true, createdBy: true, createdAt: true, expiresAt: true, usedCount: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invites); // jamais le secret : il n'existe qu'au moment de la création
});

// ═══ RÉVOCATION D'UNE INVITATION ═══
router.delete('/:id/invites/:inviteId', requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), async (req, res) => {
  const ok = await revokeInvite(prisma, req.params.inviteId, req.params.id);
  if (!ok) return res.status(404).json({ code: 'invite_not_found', error: 'Invitation introuvable' });
  await prisma.auditLog.create({
    data: { action: 'case:invite:revoke', userId: req.user.id, caseId: req.params.id, details: req.params.inviteId },
  });
  res.json({ ok: true });
});

// ═══ JOIN ═══
// Ne donne plus l'accès à tout utilisateur authentifié : il faut être déjà
// membre, ou présenter un token d'invitation signé pour cette enquête.
router.post('/:id/join', async (req, res) => {
  try {
    const caseId = req.params.id;
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    if (!c || c.status === 'DELETED') return res.status(404).json({ code: 'case_not_found', error: 'Case not found' });

    const existing = await prisma.caseAccess.findUnique({
      where: { caseId_userId: { caseId, userId: req.user.id } },
    });
    if (existing) return res.json({ ok: true, role: existing.role, alreadyMember: true, encrypted: c.encrypted });

    // Un ADMIN plateforme accède à tout, sans consommer d'invitation
    if (req.user.role === 'ADMIN') {
      return res.json({ ok: true, role: 'ADMIN', alreadyMember: false, encrypted: c.encrypted });
    }

    const invite = await verifyInvite(prisma, req.body?.invite, caseId);
    if (!invite) {
      await prisma.auditLog.create({
        data: { action: 'case:join:denied', userId: req.user.id, caseId, ip: req.ip },
      });
      return res.status(403).json({ code: 'invite_required', error: "Invitation requise pour rejoindre cette enquête." });
    }

    await prisma.caseAccess.create({ data: { caseId, userId: req.user.id, role: invite.role } });
    await consumeInvite(prisma, invite.id);
    await prisma.auditLog.create({
      data: { action: 'case:join', userId: req.user.id, caseId, details: `via invitation ${invite.id} de ${invite.createdBy}` },
    });
    res.json({ ok: true, role: invite.role, alreadyMember: false, encrypted: c.encrypted });
  } catch (e) { console.error('Join:', e.message); res.status(500).json({ code: 'server_error', error: 'Server error' }); }
});

export default router;
