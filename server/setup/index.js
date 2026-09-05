/**
 * Serveur d'installation d'OSINTMapper.
 *
 * Process SÉPARÉ du serveur applicatif, et c'est indispensable : `config.js`
 * refuse de démarrer en production sans `JWT_SECRET`, or c'est précisément ce
 * que l'installation doit produire. Il n'importe donc jamais `config.js`.
 *
 * Il écrit `server/.env`, applique les migrations, crée les comptes, pose un
 * marqueur, puis s'arrête. `start.sh` enchaîne sur le vrai serveur.
 *
 * ── Sécurité ─────────────────────────────────────────────────────────────
 * Un installateur web est une surface d'attaque classique (le `install.php` de
 * WordPress). Trois règles, non négociables :
 *   1. écoute sur 127.0.0.1 UNIQUEMENT ;
 *   2. jeton à usage unique tiré au démarrage, imprimé dans le terminal et
 *      exigé sur chaque requête - sans lui, tout processus local, ou toute
 *      page web par reliaison DNS sur localhost, piloterait l'installation ;
 *   3. refus catégorique de se lancer si l'instance est déjà installée.
 */
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { validerDossierDonnees, suggestions, SOUS_DOSSIERS, CODES } from './paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, '..', '..');   // racine du dépôt
const DOSSIER_SERVEUR = path.join(__dirname, '..');
const FICHIER_ENV = path.join(DOSSIER_SERVEUR, '.env');
const MARQUEUR = path.join(DOSSIER_SERVEUR, '.installed');
const SCHEMA = path.join(DOSSIER_SERVEUR, 'prisma', 'schema.prisma');

// Même minimum que routes/auth.js et routes/users.js. Recopié plutôt
// qu'importé : importer auth.js tirerait Prisma et le reste de l'application
// dans un process qui n'a pas encore de base.
const MIN_MOT_DE_PASSE = 12;
const ROLES = ['ADMIN', 'ANALYST', 'VIEWER'];

export function estInstalle() {
  if (fs.existsSync(MARQUEUR)) return true;
  if (!fs.existsSync(FICHIER_ENV)) return false;
  return /^JWT_SECRET=.{32,}$/m.test(fs.readFileSync(FICHIER_ENV, 'utf8'));
}

/** Validation des comptes demandés. Rendue avant toute écriture sur le disque. */
export function validerComptes(admin, autres = []) {
  const vus = new Set();
  const verifier = (u, estAdmin) => {
    // Chaque refus porte un `code` et ses `params` : la page compose le message
    // dans sa langue, le texte français reste pour les journaux.
    if (!u || !u.username || !/^[a-zA-Z0-9._-]{3,32}$/.test(u.username)) {
      return { code: 'identifiant_invalide', params: { nom: u?.username || '' },
        message: `Identifiant invalide${u?.username ? ` : « ${u.username} »` : ''} (3 à 32 caractères, lettres, chiffres, . _ -).` };
    }
    if (vus.has(u.username.toLowerCase())) {
      return { code: 'identifiant_double', params: { nom: u.username }, message: `Identifiant en double : « ${u.username} ».` };
    }
    vus.add(u.username.toLowerCase());
    if (!u.password || u.password.length < MIN_MOT_DE_PASSE) {
      return { code: 'mot_de_passe_court', params: { nom: u.username, n: MIN_MOT_DE_PASSE },
        message: `Mot de passe de « ${u.username} » : ${MIN_MOT_DE_PASSE} caractères minimum.` };
    }
    if (!estAdmin && u.role && !ROLES.includes(u.role)) {
      return { code: 'role_inconnu', params: { role: u.role }, message: `Rôle inconnu : « ${u.role} ».` };
    }
    return null;
  };
  const erreur = verifier(admin, true) || autres.map(u => verifier(u, false)).find(Boolean);
  return erreur ? { ok: false, erreur } : { ok: true };
}

function ecrireEnv({ dossierDonnees, cheminBase, port, secret, origine }) {
  const contenu = `# Généré par l'installateur OSINTMapper le ${new Date().toISOString()}.
# Ce fichier contient le secret de session : ne pas le versionner, ne pas le partager.

NODE_ENV=production
PORT=${port}

# Secret de session (64 octets). Le changer déconnecte tout le monde.
JWT_SECRET=${secret}

# Chemin ABSOLU : Prisma résout un chemin relatif depuis le dossier du schéma,
# pas depuis le serveur. La base vit avec les enquêtes, pour n'avoir qu'un seul
# dossier à sauvegarder.
DATABASE_URL="file:${cheminBase}"

# Enquêtes, pièces jointes, instantanés, plugins déposés à l'exécution.
DATA_DIR=${dossierDonnees}
${origine ? `\n# Origine publique, pour la CSP du WebSocket.\nPUBLIC_ORIGIN=${origine}\n` : ''}`;
  // 0600 : le secret ne doit être lisible que par le compte qui fait tourner
  // le service. Le mode est posé à la création, pas après - sinon le fichier
  // existe en clair pour tout le monde pendant un instant.
  fs.writeFileSync(FICHIER_ENV, contenu, { mode: 0o600 });
  fs.chmodSync(FICHIER_ENV, 0o600);
}

function appliquerMigrations(cheminBase) {
  const prisma = path.join(RACINE, 'node_modules', '.bin', 'prisma');
  if (!fs.existsSync(prisma)) {
    return { ok: false, sortie: 'prisma introuvable dans node_modules — lancer `npm install` d\'abord.' };
  }
  const r = spawnSync(prisma, ['migrate', 'deploy', '--schema', SCHEMA], {
    cwd: DOSSIER_SERVEUR,
    env: { ...process.env, DATABASE_URL: `file:${cheminBase}` },
    encoding: 'utf8',
  });
  const sortie = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return { ok: r.status === 0, sortie };
}

async function creerComptes(cheminBase, admin, autres) {
  process.env.DATABASE_URL = `file:${cheminBase}`;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    // `protected: true` sur le compte d'installation : ni supprimable, ni
    // désactivable, ni rétrogradable. C'est ce que pose déjà prisma/seed.js.
    await prisma.user.create({
      data: {
        username: admin.username,
        passwordHash: await bcrypt.hash(admin.password, 12),
        role: 'ADMIN',
        protected: true,
        displayName: admin.displayName || admin.username,
      },
    });
    for (const u of autres) {
      await prisma.user.create({
        data: {
          username: u.username,
          passwordHash: await bcrypt.hash(u.password, 12),
          role: ROLES.includes(u.role) ? u.role : 'ANALYST',
          displayName: u.displayName || u.username,
        },
      });
    }
    return { ok: true, total: 1 + autres.length };
  } finally {
    await prisma.$disconnect();
  }
}

export function creerApplication(jeton) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'");
    next();
  });

  const exigeJeton = (req, res, next) => {
    const fourni = req.get('X-Setup-Token') || req.query.t;
    // Comparaison à temps constant : le jeton est le seul rempart.
    const a = Buffer.from(String(fourni || ''));
    const b = Buffer.from(jeton);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).type('text/plain').send(
        "Jeton d'installation absent ou invalide.\n\n" +
        "Ouvrez l'adresse affichée dans le terminal où vous avez lancé ./start.sh.");
    }
    next();
  };

  app.get('/', exigeJeton, (req, res) => {
    res.type('html').send(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
  });

  app.get('/api/defauts', exigeJeton, (req, res) => {
    res.json({
      suggestions: suggestions(),
      port: 4444,
      minMotDePasse: MIN_MOT_DE_PASSE,
      roles: ROLES,
      utilisateurSysteme: process.env.USER || process.env.LOGNAME || '',
    });
  });

  app.post('/api/verifier-chemin', exigeJeton, (req, res) => {
    res.json(validerDossierDonnees(req.body?.chemin));
  });

  app.post('/api/installer', exigeJeton, async (req, res) => {
    try {
      if (estInstalle()) return res.status(409).json({ code: 'deja_installe', erreur: 'Cette instance est déjà installée.' });

      const { chemin: dossier, port = 4444, origine = '', admin, utilisateurs = [] } = req.body || {};

      const v = validerDossierDonnees(dossier);
      if (v.code !== CODES.OK) return res.status(400).json({ code: v.code, params: v.params, erreur: v.message });

      const p = parseInt(port, 10);
      if (!Number.isInteger(p) || p < 1 || p > 65535) return res.status(400).json({ code: 'port_invalide', erreur: 'Port invalide.' });

      const vc = validerComptes(admin, utilisateurs);
      if (!vc.ok) return res.status(400).json({ code: vc.erreur.code, params: vc.erreur.params, erreur: vc.erreur.message });

      // À partir d'ici on écrit. L'ordre compte : dossiers, puis .env, puis
      // migrations, puis comptes. Le marqueur n'est posé qu'en dernier, pour
      // qu'une installation interrompue puisse être relancée.
      fs.mkdirSync(v.chemin, { recursive: true });
      for (const sd of SOUS_DOSSIERS) fs.mkdirSync(path.join(v.chemin, sd), { recursive: true });

      const cheminBase = path.join(v.chemin, 'osintmapper.db');
      const secret = crypto.randomBytes(64).toString('hex');
      ecrireEnv({ dossierDonnees: v.chemin, cheminBase, port: p, secret, origine: String(origine || '').trim() });

      const mig = appliquerMigrations(cheminBase);
      if (!mig.ok) return res.status(500).json({ code: 'migrations', erreur: 'Échec des migrations.', detail: mig.sortie.slice(-1500) });

      const comptes = await creerComptes(cheminBase, admin, utilisateurs);

      fs.writeFileSync(MARQUEUR, JSON.stringify({
        installeLe: new Date().toISOString(), dossierDonnees: v.chemin, base: cheminBase, port: p, comptes: comptes.total,
      }, null, 2) + '\n', { mode: 0o600 });

      res.json({ ok: true, dossierDonnees: v.chemin, base: cheminBase, port: p, comptes: comptes.total });
      setTimeout(() => process.exit(0), 500);   // la main revient à start.sh
    } catch (e) {
      res.status(500).json({ erreur: e.message });
    }
  });

  return app;
}

// ── Lancement direct : node server/setup/index.js ────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  if (estInstalle()) {
    console.error('\n  ✖ Cette instance est déjà installée (server/.env ou server/.installed présent).');
    console.error('    Pour réinstaller : supprimer server/.env et server/.installed, en connaissance de cause.\n');
    process.exit(2);
  }
  const jeton = crypto.randomBytes(24).toString('base64url');
  const port = parseInt(process.env.SETUP_PORT, 10) || 4445;
  creerApplication(jeton).listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/?t=${jeton}`;
    console.log(`\n  Installation d'OSINTMapper\n\n  Ouvrez :  ${url}\n`);
    console.log('  Cette adresse contient un jeton à usage unique et n\'écoute que sur cette machine.\n');
    if (process.send) process.send({ url });
  });
}
