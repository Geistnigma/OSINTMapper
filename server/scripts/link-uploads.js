#!/usr/bin/env node
/**
 * Rattache les pièces jointes existantes à leur enquête.
 *
 * Jusqu'ici /api/uploads servait tout le répertoire sans contrôle : les fichiers
 * n'avaient donc aucun propriétaire. Maintenant qu'ils sont servis en fonction
 * de l'accès à l'enquête, ceux qui ne sont pas connus de la base deviennent
 * inaccessibles. Ce script parcourt les fichiers d'enquêtes en clair, y cherche
 * les URLs /api/uploads/... et reconstruit les liens manquants.
 *
 * Les enquêtes chiffrées ne peuvent pas être inspectées (mot de passe requis) :
 * leurs pièces jointes sont signalées comme non rattachables.
 *
 * Usage :
 *   node scripts/link-uploads.js          # simulation, n'écrit rien
 *   node scripts/link-uploads.js --apply  # applique les rattachements
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, '..', 'data', 'cases');
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
const APPLY = process.argv.includes('--apply');

const prisma = new PrismaClient();
const UPLOAD_RE = /\/api\/uploads\/([a-f0-9]{24}\.(?:png|jpg|gif|webp))/g;

async function main() {
  const onDisk = new Set(fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : []);
  const known = new Set((await prisma.upload.findMany({ select: { id: true } })).map(u => u.id));
  const liveCases = new Set((await prisma.case.findMany({ select: { id: true } })).map(c => c.id));

  const found = new Map();   // fichier → caseId
  let encryptedCases = 0;

  for (const f of fs.existsSync(CASES_DIR) ? fs.readdirSync(CASES_DIR) : []) {
    if (f.endsWith('.enc')) { encryptedCases++; continue; }
    if (!f.endsWith('.json')) continue;              // ignore .bak / .tmp
    const caseId = f.replace(/\.json$/, '');
    if (!liveCases.has(caseId)) continue;
    let content = '';
    try { content = fs.readFileSync(path.join(CASES_DIR, f), 'utf8'); } catch { continue; }
    for (const m of content.matchAll(UPLOAD_RE)) {
      if (!found.has(m[1])) found.set(m[1], caseId);
    }
  }

  const toLink = [...found].filter(([file]) => onDisk.has(file) && !known.has(file));
  const missingFile = [...found].filter(([file]) => !onDisk.has(file));
  const orphans = [...onDisk].filter(f => !found.has(f) && !known.has(f));

  console.log(`\n  Fichiers présents sur le disque : ${onDisk.size}`);
  console.log(`  Déjà rattachés en base          : ${known.size}`);
  console.log(`  Référencés par une enquête      : ${found.size}`);
  console.log(`  → à rattacher                   : ${toLink.length}`);
  console.log(`  → référencés mais absents       : ${missingFile.length}`);
  console.log(`  → orphelins (aucune référence)  : ${orphans.length}`);
  if (encryptedCases > 0) {
    console.log(`\n  ⚠ ${encryptedCases} enquête(s) chiffrée(s) non inspectable(s) :`);
    console.log(`    leurs pièces jointes figureront parmi les orphelines et resteront`);
    console.log(`    inaccessibles. Rattachez-les à la main si nécessaire.`);
  }

  if (orphans.length > 0) {
    console.log(`\n  Orphelins (resteront inaccessibles) :`);
    orphans.slice(0, 20).forEach(f => console.log(`    ${f}`));
    if (orphans.length > 20) console.log(`    … et ${orphans.length - 20} autres`);
  }

  if (!APPLY) {
    console.log(`\n  Simulation - relancez avec --apply pour écrire.\n`);
    return;
  }

  let created = 0;
  for (const [file, caseId] of toLink) {
    const ext = file.split('.').pop();
    let size = 0;
    try { size = fs.statSync(path.join(UPLOADS_DIR, file)).size; } catch {}
    try {
      await prisma.upload.create({ data: { id: file, caseId, uploaderId: null, ext, size } });
      created++;
    } catch (e) {
      console.error(`    échec ${file}: ${e.message}`);
    }
  }
  console.log(`\n  ✓ ${created} pièce(s) jointe(s) rattachée(s).\n`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
