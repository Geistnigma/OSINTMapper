import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { saveCaseFile, loadCaseFile, getCaseFileInfo, deleteCaseFile, getCaseFileBuffer, importCaseFile } from '../services/caseFile.js';

const router = Router();
const prisma = new PrismaClient();

const ja = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : (s || []); } catch { return []; } };

// In-memory session keys: caseId → { userId → password }
// Keeps decryption password in memory so saves don't need it every time
const sessionKeys = new Map();

function getSessionKey(caseId, userId) {
  return sessionKeys.get(caseId)?.get(userId) || null;
}
function setSessionKey(caseId, userId, password) {
  if (!sessionKeys.has(caseId)) sessionKeys.set(caseId, new Map());
  sessionKeys.get(caseId).set(userId, password);
}
function clearSessionKeys(caseId) {
  sessionKeys.delete(caseId);
}

router.use(requireAuth);

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
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ═══ CREATE ═══
router.post('/', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  try {
    const { title, description, tags, encrypted, encryptionPassword } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Title required' });
    if (encrypted && !encryptionPassword) return res.status(400).json({ error: 'Password required for encrypted cases' });
    if (encrypted && encryptionPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const c = await prisma.case.create({
      data: {
        title, description: description || null,
        tags: JSON.stringify(tags || []),
        encrypted: !!encrypted,
        access: { create: { userId: req.user.id, role: 'OWNER' } },
      },
    });

    // Create empty case file
    saveCaseFile(c.id, { meta: { title, description }, entities: [], links: [], stickers: [], postits: [] }, {
      encrypted: !!encrypted,
      password: encryptionPassword || null,
    });

    // Store session key if encrypted
    if (encrypted) setSessionKey(c.id, req.user.id, encryptionPassword);

    await prisma.auditLog.create({ data: { action: 'case:create', userId: req.user.id, caseId: c.id } });
    res.json({ id: c.id, title: c.title, encrypted: c.encrypted });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ═══ GET CASE (load data) ═══
router.get('/:id', async (req, res) => {
  try {
    const c = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        access: { include: { user: { select: { id: true, username: true, displayName: true } } } },
        history: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!c) return res.status(404).json({ error: 'Case not found' });

    // Access check
    if (req.user.role !== 'ADMIN') {
      const access = c.access.find(a => a.userId === req.user.id);
      if (!access) return res.status(403).json({ error: 'No access' });
    }

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
          data = loadCaseFile(c.id, password);
        } catch (e) {
          return res.status(403).json({ error: e.message });
        }
      } else {
        data = loadCaseFile(c.id);
      }
    }

    res.json({
      id: c.id, title: c.title, description: c.description,
      tags: ja(c.tags), status: c.status, encrypted: c.encrypted,
      entities: data?.entities || [],
      links: data?.links || [],
      stickers: data?.stickers || [],
      postits: data?.postits || [],
      collaborators: c.access.map(a => ({ ...a.user, role: a.role })),
      history: c.history,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ═══ UNLOCK (send password for encrypted case) ═══
router.post('/:id/unlock', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Password required' });

    const c = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!c || !c.encrypted) return res.status(400).json({ error: 'Case not encrypted' });

    // Try to decrypt — throws on wrong password
    const data = loadCaseFile(c.id, password);
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
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══ SAVE (auto-save from client) ═══
router.post('/:id/save', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  try {
    const caseId = req.params.id;
    const { entities, links, stickers, postits } = req.body;

    const c = await prisma.case.findUnique({ where: { id: caseId } });
    if (!c) return res.status(404).json({ error: 'Case not found' });

    const password = c.encrypted ? getSessionKey(caseId, req.user.id) : null;
    if (c.encrypted && !password) return res.status(403).json({ error: 'Session expired. Please unlock the case again.' });

    // Load existing data to merge (in case only some fields are sent)
    let existing = { entities: [], links: [], stickers: [], postits: [], meta: {} };
    try { existing = loadCaseFile(caseId, password) || existing; } catch {}

    saveCaseFile(caseId, {
      meta: existing.meta || { title: c.title, description: c.description },
      entities: entities || existing.entities || [],
      links: links || existing.links || [],
      stickers: stickers || existing.stickers || [],
      postits: postits || existing.postits || [],
    }, { encrypted: c.encrypted, password });

    await prisma.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } });
    res.json({ ok: true, ts: Date.now() });
  } catch (e) {
    console.error('Save error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══ UPDATE METADATA ═══
router.put('/:id', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
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
router.delete('/:id', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  await prisma.case.update({ where: { id: req.params.id }, data: { status: 'DELETED' } });
  deleteCaseFile(req.params.id);
  clearSessionKeys(req.params.id);
  await prisma.auditLog.create({ data: { action: 'case:delete', userId: req.user.id, caseId: req.params.id } });
  res.json({ ok: true });
});

// ═══ EXPORT (download JSON/enc file) ═══
router.get('/:id/export', async (req, res) => {
  try {
    const c = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Case not found' });

    const file = getCaseFileBuffer(c.id);
    if (!file) return res.status(404).json({ error: 'No file data' });

    const safeName = c.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}${file.encrypted ? '.enc' : '.json'}"`);
    res.setHeader('Content-Type', file.encrypted ? 'application/octet-stream' : 'application/json');
    res.send(file.buffer);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ═══ IMPORT (upload JSON/enc file) ═══
router.post('/import', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  try {
    const { title, fileData, password, encrypted } = req.body || {};
    if (!title || !fileData) return res.status(400).json({ error: 'title and fileData required' });

    // Create case in DB
    const c = await prisma.case.create({
      data: {
        title, encrypted: !!encrypted,
        access: { create: { userId: req.user.id, role: 'OWNER' } },
      },
    });

    // Parse and save the file
    const buffer = Buffer.from(fileData, 'base64');
    const result = importCaseFile(c.id, buffer, password || null);

    if (result.encrypted && password) setSessionKey(c.id, req.user.id, password);

    await prisma.auditLog.create({ data: { action: 'case:import', userId: req.user.id, caseId: c.id } });
    res.json({ id: c.id, title: c.title, encrypted: result.encrypted });
  } catch (e) {
    if (e.message === 'PASSWORD_REQUIRED') return res.status(400).json({ error: 'This file is encrypted. Please provide a password.' });
    if (e.message.includes('Mot de passe')) return res.status(403).json({ error: e.message });
    console.error('Import error:', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══ ACCESS ═══
router.post('/:id/access', requireRole('ADMIN', 'ANALYST'), async (req, res) => {
  const { userId, role = 'ANALYST' } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  await prisma.caseAccess.upsert({
    where: { caseId_userId: { caseId: req.params.id, userId } },
    create: { caseId: req.params.id, userId, role },
    update: { role },
  });
  res.json({ ok: true });
});

// ═══ JOIN ═══
router.post('/:id/join', async (req, res) => {
  try {
    const caseId = req.params.id;
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    if (!c || c.status === 'DELETED') return res.status(404).json({ error: 'Case not found' });

    const existing = await prisma.caseAccess.findUnique({
      where: { caseId_userId: { caseId, userId: req.user.id } },
    });
    if (existing) return res.json({ ok: true, role: existing.role, alreadyMember: true, encrypted: c.encrypted });

    await prisma.caseAccess.create({ data: { caseId, userId: req.user.id, role: 'ANALYST' } });
    await prisma.auditLog.create({ data: { action: 'case:join', userId: req.user.id, caseId } });
    res.json({ ok: true, role: 'ANALYST', alreadyMember: false, encrypted: c.encrypted });
  } catch (e) { console.error('Join:', e.message); res.status(500).json({ error: 'Server error' }); }
});

export default router;
