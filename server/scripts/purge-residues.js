#!/usr/bin/env node
/**
 * Supprime les données résiduelles sur le disque.
 *
 * Deux fuites historiques :
 *   - `deleteCaseFile` ne retirait que .json/.enc : les .bak créés à chaque
 *     sauvegarde survivaient à la suppression d'une enquête, laissant une copie
 *     complète et lisible de ses données.
 *   - les pièces jointes n'étaient jamais supprimées avec leur enquête.
 *
 * Usage :
 *   node scripts/purge-residues.js          # simulation
 *   node scripts/purge-residues.js --apply  # supprime réellement
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

async function main() {
  // Une enquête supprimée (status DELETED) ne doit plus rien laisser sur disque.
  const live = new Set(
    (await prisma.case.findMany({ where: { status: { not: 'DELETED' } }, select: { id: true } })).map(c => c.id)
  );

  const doomed = [];
  for (const f of fs.existsSync(CASES_DIR) ? fs.readdirSync(CASES_DIR) : []) {
    const m = f.match(/^(.+?)\.(json|enc)(\.bak|\.tmp)?$/);
    if (!m) continue;
    const [, caseId, , suffix] = m;
    if (!live.has(caseId)) doomed.push([f, 'enquête supprimée ou inconnue']);
    else if (suffix === '.tmp') doomed.push([f, 'écriture interrompue']);
    else if (suffix === '.bak') doomed.push([f, 'sauvegarde antérieure']);
  }

  // Fichiers uploadés qui n'appartiennent plus à aucune enquête vivante
  const known = await prisma.upload.findMany({ select: { id: true, caseId: true } });
  const knownLive = new Set(known.filter(u => live.has(u.caseId)).map(u => u.id));
  const staleUploads = (fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR) : [])
    .filter(f => !knownLive.has(f));

  console.log(`\n  Enquêtes vivantes : ${live.size}`);
  console.log(`  Fichiers d'enquête à supprimer : ${doomed.length}`);
  doomed.slice(0, 30).forEach(([f, why]) => console.log(`    ${f}  (${why})`));
  if (doomed.length > 30) console.log(`    … et ${doomed.length - 30} autres`);

  console.log(`\n  Pièces jointes sans enquête vivante : ${staleUploads.length}`);
  staleUploads.slice(0, 20).forEach(f => console.log(`    ${f}`));
  if (staleUploads.length > 20) console.log(`    … et ${staleUploads.length - 20} autres`);
  console.log(`\n  ⚠ Les .bak d'enquêtes VIVANTES sont aussi listés : ce sont des copies`);
  console.log(`    de sécurité utiles en cas de corruption. Ne les purgez que si vous`);
  console.log(`    assumez de perdre ce filet de secours.`);

  if (!APPLY) {
    console.log(`\n  Simulation - relancez avec --apply pour supprimer.\n`);
    return;
  }

  let n = 0;
  for (const [f] of doomed) {
    try { fs.unlinkSync(path.join(CASES_DIR, f)); n++; } catch {}
  }
  for (const f of staleUploads) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); n++; } catch {}
  }
  // Nettoie aussi les enregistrements pointant vers des enquêtes disparues
  const removedRows = await prisma.upload.deleteMany({ where: { caseId: { notIn: [...live] } } });
  console.log(`\n  ✓ ${n} fichier(s) supprimé(s), ${removedRows.count} enregistrement(s) nettoyé(s).\n`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
