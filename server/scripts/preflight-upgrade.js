#!/usr/bin/env node
/**
 * Pré-vol de mise à niveau - STRICTEMENT EN LECTURE SEULE.
 *
 * À exécuter sur l'instance de production AVANT toute mise à niveau, pour
 * répondre aux questions qui décident de la marche à suivre :
 *
 *   1. Le nouveau serveur va-t-il seulement démarrer ? (JWT_SECRET est devenu
 *      obligatoire : une instance qui tournait sans redémarrerait en erreur)
 *   2. Dans quel état sont les migrations ? Une base créée avec `db push` n'a
 *      pas de table `_prisma_migrations` : `migrate deploy` échouerait sur
 *      « table already exists » et il faut alors la baseliner.
 *   3. La migration `runtime_plugins` va-t-elle passer ? Elle reconstruit la
 *      table Plugin avec deux colonnes NOT NULL sans valeur par défaut : elle
 *      échoue si la table contient la moindre ligne.
 *   4. Combien de pièces jointes deviendront inaccessibles faute de ligne
 *      Upload (à rattacher ensuite avec link-uploads.js) ?
 *
 * Le script n'ouvre la base qu'en lecture et n'écrit rien, nulle part.
 *
 * Usage :  node scripts/preflight-upgrade.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, '..', 'data', 'cases');
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');

/** Migrations attendues par cette version, dans l'ordre. */
const EXPECTED_MIGRATIONS = [
  '20260720081119_init',
  '20260720122011_add_upload_invite',
  '20260720133635_runtime_plugins',
  '20260720200649_case_snapshots',
  '20260721145502_case_settings',
];

const prisma = new PrismaClient();

const bloquants = [];
const avertissements = [];

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => { console.log(`  \x1b[33m⚠\x1b[0m ${m}`); avertissements.push(m); };
const stop = (m) => { console.log(`  \x1b[31m✖\x1b[0m ${m}`); bloquants.push(m); };
const titre = (m) => console.log(`\n\x1b[36m─── ${m}\x1b[0m`);

/** Une table existe-t-elle ? (interrogation du catalogue, sans toucher aux données) */
async function tableExiste(nom) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, nom,
  );
  return r.length > 0;
}

async function compte(table) {
  const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${table}"`);
  return Number(r[0].n);
}

async function main() {
  console.log('\n\x1b[1mPré-vol de mise à niveau OSINTMapper\x1b[0m  (lecture seule)');

  // ─── 1. Configuration ───────────────────────────────────────────────────
  titre('Configuration (le nouveau serveur démarrera-t-il ?)');

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    stop('JWT_SECRET absent de l\'environnement. Si le .env n\'est pas chargé ici, relancer avec : node --env-file=.env scripts/preflight-upgrade.js');
  } else if (secret.startsWith('CHANGE_ME')) {
    stop('JWT_SECRET est resté à sa valeur d\'exemple - le nouveau serveur REFUSERA de démarrer.');
  } else if (secret.length < 32) {
    stop(`JWT_SECRET fait ${secret.length} caractères (< 32) - le nouveau serveur REFUSERA de démarrer. En générer un nouveau invalidera les sessions en cours (les comptes, eux, ne changent pas).`);
  } else {
    ok(`JWT_SECRET conforme (${secret.length} caractères)`);
  }

  if (process.env.NODE_ENV !== 'production') {
    warn(`NODE_ENV vaut « ${process.env.NODE_ENV || 'non défini'} » ici. En production il doit valoir « production », sinon le client statique n'est pas servi et CORS s'ouvre.`);
  } else {
    ok('NODE_ENV = production');
  }

  const dbUrl = process.env.DATABASE_URL || '';
  const dbFile = dbUrl.startsWith('file:')
    ? path.resolve(path.join(__dirname, '..', 'prisma'), dbUrl.slice(5))
    : null;
  if (dbFile && fs.existsSync(dbFile)) {
    ok(`Base : ${dbFile} (${(fs.statSync(dbFile).size / 1024).toFixed(0)} Ko)`);
  } else {
    warn(`Base introuvable à l'emplacement déduit de DATABASE_URL (${dbUrl || 'non défini'}). Vérifier avant de sauvegarder.`);
  }

  // ─── 2. Inventaire des données à préserver ──────────────────────────────
  titre('Données en place (à retrouver identiques après la mise à niveau)');

  const users = await compte('User');
  const cases = await compte('Case');
  const access = await tableExiste('CaseAccess') ? await compte('CaseAccess') : 0;
  ok(`${users} compte(s) · ${cases} enquête(s) · ${access} accès`);

  const fichiersEnquetes = fs.existsSync(CASES_DIR)
    ? fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json') || f.endsWith('.enc'))
    : [];
  const chiffrees = fichiersEnquetes.filter(f => f.endsWith('.enc')).length;
  ok(`${fichiersEnquetes.length} fichier(s) d'enquête sur disque (dont ${chiffrees} chiffré(s))`);
  console.log('    → noter ces chiffres : ils doivent être identiques après bascule');

  // ─── 3. État des migrations ─────────────────────────────────────────────
  titre('Migrations');

  const aTableMigrations = await tableExiste('_prisma_migrations');
  if (!aTableMigrations) {
    warn('Aucune table _prisma_migrations : cette base a été créée avec « prisma db push ». ' +
         '`migrate deploy` échouerait sur « table already exists ». Il faut la BASELINER ' +
         '(prisma migrate resolve --applied …) - jamais accepter un reset.');
  } else {
    const appliquees = await prisma.$queryRawUnsafe(
      `SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at`,
    );
    const noms = appliquees.filter(m => m.finished_at).map(m => m.migration_name);
    const echouees = appliquees.filter(m => !m.finished_at).map(m => m.migration_name);

    if (echouees.length) stop(`Migration(s) en échec à résoudre avant tout : ${echouees.join(', ')}`);

    const manquantes = EXPECTED_MIGRATIONS.filter(m => !noms.includes(m));
    if (manquantes.length === 0) ok('Toutes les migrations sont déjà appliquées - rien à migrer.');
    else {
      ok(`${noms.length} migration(s) appliquée(s)`);
      console.log(`    À appliquer : ${manquantes.join(', ')}`);
    }
  }

  // ─── 4. Le piège de la migration runtime_plugins ────────────────────────
  titre('Migration runtime_plugins (reconstruit la table Plugin)');

  if (!(await tableExiste('Plugin'))) {
    ok('Pas de table Plugin : la migration la créera, sans risque.');
  } else {
    const colonnes = await prisma.$queryRawUnsafe(`PRAGMA table_info("Plugin")`);
    const dejaMigree = colonnes.some(c => c.name === 'bundleHash');
    const n = await compte('Plugin');
    if (dejaMigree) {
      ok(`Table Plugin déjà au nouveau format (${n} ligne(s)).`);
    } else if (n === 0) {
      ok('Table Plugin à l\'ancien format mais VIDE : la migration passera.');
    } else {
      stop(`Table Plugin à l'ancien format avec ${n} ligne(s) : la migration ÉCHOUERA ` +
           `(colonnes manifest et bundleHash NOT NULL sans valeur par défaut). ` +
           `Ces lignes sont des plugins installés à l'exécution - les exporter puis vider la table, ` +
           `et les réinstaller via le Plugin Store après la mise à niveau.`);
    }
  }

  // ─── 5. Pièces jointes orphelines ───────────────────────────────────────
  titre('Pièces jointes');

  const surDisque = fs.existsSync(UPLOADS_DIR)
    ? fs.readdirSync(UPLOADS_DIR).filter(f => /^[a-f0-9]{24}\.(png|jpg|gif|webp)$/.test(f))
    : [];
  const connues = (await tableExiste('Upload')) ? await compte('Upload') : 0;

  if (surDisque.length === 0) {
    ok('Aucune pièce jointe sur disque.');
  } else if (connues >= surDisque.length) {
    ok(`${surDisque.length} pièce(s) jointe(s), toutes rattachées à une enquête.`);
  } else {
    warn(`${surDisque.length} fichier(s) sur disque pour ${connues} ligne(s) Upload : ` +
         `${surDisque.length - connues} pièce(s) jointe(s) deviendront INACCESSIBLES (404) ` +
         `après la mise à niveau. Lancer « node scripts/link-uploads.js » (simulation) ` +
         `puis « --apply » pour les rattacher. Les enquêtes chiffrées ne sont pas inspectables : ` +
         `leurs pièces jointes devront être redéposées.`);
  }

  // ─── Verdict ────────────────────────────────────────────────────────────
  titre('Verdict');
  if (bloquants.length) {
    console.log(`  \x1b[31m${bloquants.length} point(s) bloquant(s)\x1b[0m - à traiter AVANT la bascule.`);
  } else {
    console.log('  \x1b[32mAucun point bloquant.\x1b[0m');
  }
  if (avertissements.length) {
    console.log(`  \x1b[33m${avertissements.length} point(s) de vigilance\x1b[0m - lire ci-dessus.`);
  }
  console.log('\n  Rien n\'a été écrit : cette commande est sans effet sur les données.\n');

  process.exitCode = bloquants.length ? 1 : 0;
}

main()
  .catch(e => { console.error('\n  Erreur :', e.message, '\n'); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
