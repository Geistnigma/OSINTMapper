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
import pluginsRoutes from './routes/plugins.js';
import { setupCustomWs } from './ws/custom.js';
import { getRoomStats } from './ws/custom.js';
import { setupYjsWs, getYjsStats } from './ws/yjs.js';
import { requireAuth as requireAuthMw } from './middleware/auth.js';
import { requireCaseAccess, requireCaseRole, resolveCaseRole } from './middleware/caseAccess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const app = express();
const httpServer = http.createServer(app);
expressWs(app, httpServer);

// ═══ MIDDLEWARE ═══
// Combien de proxies croire sur X-Forwarded-For (cf. config.trustProxy) : c'est
// cette IP qui sert de clé aux limiteurs de débit.
app.set('trust proxy', config.trustProxy);

/**
 * Content-Security-Policy.
 *
 * Elle était purement et simplement désactivée (`contentSecurityPolicy: false`)
 * alors que le tableau d'audit de DEPLOY.md la déclarait active. C'est la seule
 * barrière qui reste quand du HTML hostile passe : l'application rend la
 * documentation des plugins en HTML et exécute des bundles de plugins déposés
 * par un administrateur. Sans CSP, une seule injection permet d'exfiltrer une
 * enquête vers un domaine tiers.
 *
 * Les origines listées sont exactement celles dont l'application a besoin -
 * tuiles de la carte et iframe Street View. Tout le reste passe par les proxies
 * du serveur (`/api/geocode`, `/api/route`), donc `connect-src` reste fermé sur
 * l'origine propre : un plugin compromis ne peut pas téléphoner dehors.
 */
const TILE_HOSTS = [
  'https://*.tile.openstreetmap.org',
  'https://*.basemaps.cartocdn.com',
  'https://server.arcgisonline.com',
];

// Certains navigateurs anciens ne font pas correspondre `'self'` aux schémas
// ws:/wss: (CSP niveau 3). Quand l'origine publique est connue, on l'ajoute
// explicitement plutôt que d'ouvrir `ws:` en grand.
const wsSelf = config.publicOrigin
  ? [config.publicOrigin.replace(/^http/, 'ws')]
  : [];

app.use(helmet({
  contentSecurityPolicy: {
    reportOnly: config.cspReportOnly,
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      // blob: est nécessaire au magasin de plugins : l'administrateur importe le
      // bundle depuis un Blob pour en lire le manifeste avant de l'installer.
      'script-src': ["'self'", 'blob:'],
      // L'index.html porte un <style> en ligne, et Leaflet/vis-timeline posent
      // des styles à l'exécution. Restreint aux feuilles, jamais aux scripts.
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', ...TILE_HOSTS],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'", ...wsSelf],
      // Street View du plugin carte.
      'frame-src': ['https://maps.google.com'],
      'worker-src': ["'self'", 'blob:'],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      ...(config.isProd ? { 'upgrade-insecure-requests': [] } : {}),
    },
  },
  // L'application est servie derrière HTTPS ; nginx pose déjà HSTS, helmet le
  // confirme au niveau applicatif.
  hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  // Le référent ne doit pas fuir un identifiant d'enquête vers les tuiles.
  referrerPolicy: { policy: 'no-referrer' },
}));

app.use(cors({
  origin: config.isProd ? (process.env.CORS_ORIGIN || false) : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

/**
 * Limites de débit. Application exposée sur internet : la porte
 * d'authentification est la première chose qu'un balayage automatisé essaie.
 *
 * `authLimiter` couvrait déjà /api/auth mais à 30 tentatives / 15 min, ce qui
 * est large pour du bourrage d'identifiants. On sépare la connexion (stricte)
 * du reste de /api/auth (changement de mot de passe, /me), et on pose un
 * plafond global pour que le reste de l'API ne puisse pas être martelé.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 20 ÉCHECS par quart d'heure. Le compte est volontairement large parce que
  // l'équipe passe par un VPN WireGuard : tous les utilisateurs partagent alors
  // une seule adresse IP, et une limite serrée les enfermerait dehors ensemble.
  // À ce rythme une attaque plafonne à ~1900 essais par jour, hors de portée
  // d'un mot de passe correct.
  max: 20,
  // Les tentatives réussies ne comptent pas : un utilisateur légitime qui
  // travaille normalement ne doit jamais heurter la limite.
  skipSuccessfulRequests: true,
  message: { code: 'too_many_logins', error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { code: 'too_many_attempts', error: 'Too many attempts' } });

/**
 * Dépôt de pièces jointes : 40 par quart d'heure et par compte.
 *
 * Le plafond général de l'API (600/min) autorisait, à 10 Mo le fichier, un
 * remplissage de disque plus rapide que n'importe quelle supervision. Le quota
 * par enquête borne le total ; ce limiteur borne le débit.
 */
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { code: 'too_many_uploads', error: 'Trop de pièces jointes déposées. Réessayez dans quelques minutes.' },
});
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 600, message: { code: 'too_many_requests', error: 'Trop de requêtes' } });

app.use('/api/', apiLimiter);

// ═══ API ROUTES ═══
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/plugins', pluginsRoutes);

// Compat: /api/save/:caseId - redirects to new save route
app.post('/api/save/:caseId', requireAuthMw, requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), async (req, res) => {
  try {
    const caseId = req.params.caseId;
    const { entities, links, stickers, postits, timeline, caseInfo } = req.body;
    const { saveCaseFile, loadCaseFile } = await import('./services/caseFile.js');

    const c = req.case;

    // Cette route n'a pas accès aux clés de session : elle ne sait pas chiffrer.
    // Répondre 200 ferait croire au client que tout est sauvegardé alors que rien
    // ne l'est - on échoue explicitement pour que l'UI affiche l'erreur.
    if (c.encrypted) {
      return res.status(409).json({
        error: 'Enquête chiffrée : sauvegarde impossible par cette route. Déverrouillez l\'enquête (POST /api/cases/:id/unlock) puis utilisez /api/cases/:id/save.',
        code: 'ENCRYPTED_CASE',
      });
    }

    // Le client envoie caseInfo (titre/description édités depuis le graphe) :
    // il était ignoré, donc ces modifications étaient silencieusement perdues.
    const title = caseInfo?.title?.trim() || c.title;
    const description = caseInfo?.description ?? c.description;

    await saveCaseFile(caseId, {
      meta: { title, description },
      entities: entities || [],
      links: links || [],
      stickers: stickers || [],
      postits: postits || [],
      timeline: timeline || [],
    }, { encrypted: false });

    const metaChanged = title !== c.title || description !== c.description;
    await prisma.case.update({
      where: { id: caseId },
      data: metaChanged ? { title, description, updatedAt: new Date() } : { updatedAt: new Date() },
    });

    // Point de restauration (au plus un toutes les 5 min). C'est par cette route
    // de compat que passe l'autosave du graphe : sans cet appel, l'historique
    // resterait vide pour la quasi-totalité des sauvegardes.
    const { maybeAutoSnapshot } = await import('./services/snapshots.js');
    maybeAutoSnapshot(caseId, req.user.id);

    res.json({ ok: true, ts: Date.now() });
  } catch (e) { console.error('Save:', e.message); res.status(500).json({ error: e.message }); }
});

// ═══ YJS: Load initial state for a case into Yjs format ═══
app.get('/api/yjs-state/:caseId', requireAuthMw, requireCaseAccess, async (req, res) => {
  try {
    const { loadCaseFile, getCaseFileInfo } = await import('./services/caseFile.js');
    const caseId = req.params.caseId;
    const c = req.case;

    // Le rôle de l'appelant accompagne l'état : en mode solo aucune socket n'est
    // ouverte, donc le client n'avait aucun moyen de savoir qu'il est VIEWER et
    // affichait tous les outils d'édition - pour se faire refuser à la sauvegarde.
    const role = req.caseRole;

    const info = getCaseFileInfo(caseId);
    if (!info.exists) return res.json({ entities: {}, links: {}, stickers: {}, postits: {}, meta: {}, role });

    // For encrypted cases, skip - the client will use /unlock instead
    if (c.encrypted) return res.json({ entities: {}, links: {}, stickers: {}, postits: {}, meta: { title: c.title, encrypted: true }, role });

    const data = await loadCaseFile(caseId);
    if (!data) return res.json({ entities: {}, links: {}, stickers: {}, postits: {}, meta: {}, role });

    res.json({
      role,
      entities: Object.fromEntries((data.entities || []).map(e => [e.id, e])),
      links: Object.fromEntries((data.links || []).map(l => [l.id, l])),
      stickers: Object.fromEntries((data.stickers || []).map(s => [s.id, s])),
      postits: Object.fromEntries((data.postits || []).map(p => [p.id, p])),
      meta: data.meta || { title: c.title },
      timeline: data.timeline || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Ces deux proxies font émettre au serveur une requête sortante à partir de
 * paramètres fournis par le client. Tout ce qui vient de `req.query` est donc
 * validé avant d'être interpolé dans une URL : sans validation, `from` et `to`
 * injectaient des segments de chemin arbitraires dans l'URL OSRM (`../`, `?`,
 * `#`), transformant le serveur en relais vers d'autres ressources de l'hôte
 * distant. Le contrôle est ici numérique : une coordonnée n'est rien d'autre.
 */
const parseLatLng = (s) => {
  if (typeof s !== 'string') return null;
  const [a, b] = s.split(',');
  const lat = Number(a), lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

// Geocode proxy (avoids CORS issues with Nominatim)
/**
 * ⚠ Ces deux proxys parlent à des services TIERS.
 *
 * Le serveur relaie pour éviter le CORS, il ne masque pas la fuite : chaque
 * géocodage envoie une adresse d'enquête à Nominatim, chaque calcul
 * d'itinéraire un couple de coordonnées à OSRM. C'est de la donnée d'enquête
 * qui sort de l'instance. Une instance qui ne peut pas se le permettre doit
 * pointer ces deux routes vers ses propres serveurs, ou les désactiver.
 *
 * Sécurité : l'hôte est fixe (aucun SSRF possible), le paramètre est encodé,
 * et `/api/route` valide ses coordonnées avant interpolation - sans quoi
 * `from`/`to` injectaient des segments de chemin dans l'URL OSRM.
 */
app.get('/api/geocode', requireAuthMw, async (req, res) => {
  const q = req.query.q;
  if (!q || typeof q !== 'string') return res.json([]);
  // Une adresse ne fait pas 5 000 caractères : plafonner évite de faire porter
  // au serveur des requêtes sortantes démesurées.
  if (q.length > 200) return res.status(400).json({ code: 'payload_too_large', error: 'Requête trop longue' });
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
      headers: { 'User-Agent': 'OSINTMapper/2.0' },
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    res.json(data);
  } catch (e) { res.json([]); }
});

// OSRM route proxy (for road distance calculation)
app.get('/api/route', requireAuthMw, async (req, res) => {
  const from = parseLatLng(req.query.from);
  const to = parseLatLng(req.query.to);
  if (!from || !to) return res.status(400).json({ code: 'bad_coords', error: 'Coordonnées invalides' });
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(15000) },
    );
    const data = await r.json();
    res.json(data);
  } catch (e) { res.json({ code: 'route_failed', error: 'Route fetch failed' }); }
});

// ═══ IMAGE UPLOAD ═══
import { randomBytes } from 'crypto';
// Racine des données : configurable par DATA_DIR (voir config.js).
const UPLOADS_DIR = path.join(config.dataDir, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/**
 * Le contenu est-il réellement une image du type annoncé ?
 *
 * Contrôle de signature (« nombres magiques »), pas de validation complète :
 * il ne prétend pas qu'une image est saine, seulement qu'un fichier annoncé
 * `image/png` commence bien comme un PNG. Le service pose déjà un
 * `Content-Type` issu de la base et `nosniff`, donc le risque de polyglotte
 * était contenu - mais rien n'empêchait le répertoire d'accueillir n'importe
 * quel contenu sous une extension d'image.
 */
function looksLikeImage(buf, ext) {
  if (buf.length < 12) return false;
  switch (ext) {
    case 'png': return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'jpg': return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'gif': return buf.subarray(0, 4).toString('latin1') === 'GIF8';
    // RIFF....WEBP : la taille occupe les octets 4 à 7.
    case 'webp': return buf.subarray(0, 4).toString('latin1') === 'RIFF'
      && buf.subarray(8, 12).toString('latin1') === 'WEBP';
    default: return false;
  }
}

// Chaque pièce jointe appartient à une enquête : on sert le fichier seulement à
// qui a accès à cette enquête. Auparavant express.static exposait tout le
// répertoire sans la moindre vérification, malgré le commentaire « with auth ».
app.get('/api/uploads/:file', requireAuthMw, async (req, res) => {
  try {
    const file = req.params.file;
    // L'identifiant est le nom de fichier lui-même : on le contraint pour qu'il
    // ne puisse jamais sortir du répertoire des uploads.
    if (!/^[a-f0-9]{24}\.(png|jpg|gif|webp)$/.test(file)) return res.status(404).end();

    const upload = await prisma.upload.findUnique({ where: { id: file } });
    // Fichier inconnu de la base : pièce jointe orpheline d'avant le
    // rattachement - on refuse plutôt que de servir sans contrôle.
    if (!upload) return res.status(404).end();

    const role = await resolveCaseRole(req.user, upload.caseId);
    if (!role) return res.status(404).end();

    const full = path.join(UPLOADS_DIR, file);
    if (!fs.existsSync(full)) return res.status(404).end();

    res.setHeader('Content-Type', MIME_BY_EXT[upload.ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(full);
  } catch (e) {
    console.error('Upload serve:', e.message);
    res.status(500).end();
  }
});

app.post('/api/upload', requireAuthMw, requireCaseAccess, requireCaseRole('OWNER', 'ANALYST'), uploadLimiter, async (req, res) => {
  try {
    const { data } = req.body; // data = base64 data URI
    if (!data || !data.startsWith('data:image/')) return res.status(400).json({ code: 'bad_image_data', error: 'Invalid image data' });

    const matches = data.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
    if (!matches) return res.status(400).json({ code: 'bad_image_format', error: 'Invalid image format' });

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ code: 'image_too_large', error: 'Image trop lourde (max 10 Mo)' });

    // Le type venait du seul en-tête déclaré par le client : n'importe quel
    // contenu pouvait s'annoncer `data:image/png`. On vérifie les octets.
    if (!looksLikeImage(buffer, ext)) {
      return res.status(400).json({ code: 'image_mismatch', error: "Le contenu ne correspond pas à une image de ce type" });
    }

    // Plafond cumulé par enquête. Un fichier seul était borné, le total ne
    // l'était pas : disque plein = base SQLite en lecture seule.
    const { _sum } = await prisma.upload.aggregate({
      where: { caseId: req.case.id },
      _sum: { size: true },
    });
    const dejaUtilise = _sum.size || 0;
    if (dejaUtilise + buffer.length > config.uploadQuotaPerCase) {
      const mo = Math.round(config.uploadQuotaPerCase / (1024 * 1024));
      return res.status(413).json({ code: 'upload_quota', error: `Quota de pièces jointes atteint pour cette enquête (${mo} Mo)` });
    }

    const fname = `${randomBytes(12).toString('hex')}.${ext}`;
    // Écriture asynchrone : `writeFileSync` immobilisait la boucle d'événements
    // le temps d'écrire jusqu'à 10 Mo, pour tous les utilisateurs.
    await fs.promises.writeFile(path.join(UPLOADS_DIR, fname), buffer);

    try {
      await prisma.upload.create({
        data: { id: fname, caseId: req.case.id, uploaderId: req.user.id, ext, size: buffer.length },
      });
      res.json({ url: `/api/uploads/${fname}` });
    } catch (e) {
      // Pas d'enregistrement = fichier inaccessible : on ne le laisse pas traîner.
      try { await fs.promises.unlink(path.join(UPLOADS_DIR, fname)); } catch {}
      console.error('Upload record:', e.message);
      res.status(500).json({ code: 'upload_failed', error: 'Upload failed' });
    }
  } catch (e) {
    // `e.message` était renvoyé tel quel : seul endroit de l'API qui échappait
    // au gestionnaire global et livrait un message interne au client.
    console.error('Upload:', e.message);
    res.status(500).json({ code: 'upload_failed', error: 'Upload failed' });
  }
});

// Réservé aux ADMIN : la liste des salles actives révélait les identifiants des
// enquêtes en cours à n'importe quel compte authentifié.
app.get('/api/health', requireAuthMw, (req, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ code: 'admin_only', error: 'Admin only' });
  res.json({ status: 'ok', rooms: getRoomStats(), yjs: getYjsStats(), uptime: process.uptime() });
});

// Public health check (no sensitive data)
app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

// ═══ CUSTOM WEBSOCKET (chat, approval, kick) ═══
setupCustomWs(app);

// ═══ YJS WEBSOCKET (sync du graphe, authentifié) ═══
setupYjsWs(app);

// ═══ STATIC (production) ═══
if (config.isProd) {
  const clientPath = path.join(__dirname, config.clientDist);
  // Pas de listing de répertoire, pas de fichiers cachés. Les sourcemaps ne
  // sont plus produites du tout (client/vite.config.js) : le commentaire
  // affirmait ici qu'elles étaient absentes alors que 7,7 Mo de source
  // intégrale étaient servis publiquement. La règle ci-dessous est une seconde
  // barrière, au cas où un build en produirait de nouveau.
  app.use((req, res, next) => {
    if (req.path.endsWith('.map')) return res.status(404).end();
    next();
  });
  app.use(express.static(clientPath, { dotfiles: 'deny', index: 'index.html' }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) return res.status(404).json({ code: 'not_found', error: 'Not found' });
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled:', err.message);
  res.status(500).json({ code: 'server_error', error: 'Internal server error' });
});

httpServer.listen(config.port, config.host, () => {
  console.log(`\n  🔐 OSINTMapper v0.1`);
  console.log(`  → API:    http://${config.host}:${config.port}`);
  console.log(`  → Custom: ws://${config.host}:${config.port}/ws-custom`);
  console.log(`  → Yjs:    ws://${config.host}:${config.port}/yjs/:caseId (authentifié)`);
  console.log(`  → env:    ${config.nodeEnv}\n`);
});
