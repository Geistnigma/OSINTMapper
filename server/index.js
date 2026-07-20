import express from 'express';
import http from 'http';
import expressWs from 'express-ws';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import casesRoutes from './routes/cases.js';
import { setupCustomWs } from './ws/custom.js';
import { getRoomStats } from './ws/custom.js';
import { requireAuth as requireAuthMw } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const app = express();
const httpServer = http.createServer(app);
expressWs(app, httpServer);

// ═══ MIDDLEWARE ═══
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: config.nodeEnv === 'production' ? (process.env.CORS_ORIGIN || false) : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many attempts' } });

// ═══ API ROUTES ═══
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/cases', casesRoutes);

// Compat: /api/save/:caseId — redirects to new save route
app.post('/api/save/:caseId', requireAuthMw, async (req, res) => {
  try {
    const caseId = req.params.caseId;
    const { entities, links, stickers, postits, timeline } = req.body;
    const { saveCaseFile, loadCaseFile } = await import('./services/caseFile.js');

    const c = await prisma.case.findUnique({ where: { id: caseId } });
    if (!c) return res.status(404).json({ error: 'Not found' });

    // For encrypted cases, we can't save without the password
    // The proper save route in cases.js handles this via session keys
    if (c.encrypted) return res.json({ ok: true, ts: Date.now(), note: 'encrypted_skipped' });

    saveCaseFile(caseId, {
      meta: { title: c.title, description: c.description },
      entities: entities || [],
      links: links || [],
      stickers: stickers || [],
      postits: postits || [],
      timeline: timeline || [],
    }, { encrypted: false });

    await prisma.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } });
    res.json({ ok: true, ts: Date.now() });
  } catch (e) { console.error('Save:', e.message); res.status(500).json({ error: e.message }); }
});

// ═══ YJS: Load initial state for a case into Yjs format ═══
app.get('/api/yjs-state/:caseId', requireAuthMw, async (req, res) => {
  try {
    const { loadCaseFile, getCaseFileInfo } = await import('./services/caseFile.js');
    const caseId = req.params.caseId;
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    if (!c) return res.status(404).json({ error: 'Not found' });

    const info = getCaseFileInfo(caseId);
    if (!info.exists) return res.json({ entities: {}, links: {}, stickers: {}, postits: {}, meta: {} });

    // For encrypted cases, skip — the client will use /unlock instead
    if (c.encrypted) return res.json({ entities: {}, links: {}, stickers: {}, postits: {}, meta: { title: c.title, encrypted: true } });

    const data = loadCaseFile(caseId);
    if (!data) return res.json({ entities: {}, links: {}, stickers: {}, postits: {}, meta: {} });

    res.json({
      entities: Object.fromEntries((data.entities || []).map(e => [e.id, e])),
      links: Object.fromEntries((data.links || []).map(l => [l.id, l])),
      stickers: Object.fromEntries((data.stickers || []).map(s => [s.id, s])),
      postits: Object.fromEntries((data.postits || []).map(p => [p.id, p])),
      meta: data.meta || { title: c.title },
      timeline: data.timeline || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Geocode proxy (avoids CORS issues with Nominatim)
app.get('/api/geocode', requireAuthMw, async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
      headers: { 'User-Agent': 'OSINTMapper/2.0' },
    });
    const data = await r.json();
    res.json(data);
  } catch (e) { res.json([]); }
});

// OSRM route proxy (for road distance calculation)
app.get('/api/route', requireAuthMw, async (req, res) => {
  const { from, to } = req.query; // "lat,lng"
  if (!from || !to) return res.json({ error: 'from and to required' });
  try {
    const [fLat, fLng] = from.split(',');
    const [tLat, tLng] = to.split(',');
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=geojson`);
    const data = await r.json();
    res.json(data);
  } catch (e) { res.json({ error: 'Route fetch failed' }); }
});

// ═══ IMAGE UPLOAD ═══
import { randomBytes } from 'crypto';
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve uploaded images statically (with auth)
app.use('/api/uploads', express.static(UPLOADS_DIR));

app.post('/api/upload', requireAuthMw, (req, res) => {
  try {
    const { data, filename } = req.body; // data = base64 data URI
    if (!data || !data.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image data' });

    const matches = data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid image format' });

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Image trop lourde (max 10 Mo)' });

    const id = randomBytes(12).toString('hex');
    const fname = `${id}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fname), buffer);

    res.json({ url: `/api/uploads/${fname}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', requireAuthMw, (req, res) => {
  res.json({ status: 'ok', rooms: getRoomStats(), uptime: process.uptime() });
});

// Public health check (no sensitive data)
app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

// ═══ CUSTOM WEBSOCKET (chat, approval, kick) ═══
setupCustomWs(app);

// ═══ STATIC (production) ═══
if (config.nodeEnv === 'production') {
  const clientPath = path.join(__dirname, config.clientDist);
  // Security: no directory listing, no source maps in prod
  app.use(express.static(clientPath, { dotfiles: 'deny', index: 'index.html' }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

httpServer.listen(config.port, config.host, () => {
  console.log(`\n  🔐 OSINTMapper v2`);
  console.log(`  → API:    http://${config.host}:${config.port}`);
  console.log(`  → Custom: ws://${config.host}:${config.port}/ws-custom`);
  console.log(`  → Yjs:    ws://${config.host}:1234 (separate process)`);
  console.log(`  → env:    ${config.nodeEnv}\n`);
});
