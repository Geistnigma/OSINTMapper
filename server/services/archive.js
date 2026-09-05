/**
 * Archive d'enquête (.omcase) - un seul fichier qui contient tout.
 *
 * L'export historique (`GET /:id/export`) ne renvoie que le graphe. Or une
 * photo y est stockée sous forme d'URL (`/api/uploads/<id>.png`) : le fichier
 * exporté référence des images qui ne voyagent pas avec lui. Réimporté sur une
 * autre instance, il perd toutes ses pièces jointes ; réimporté sur la même, il
 * partage les fichiers de l'enquête d'origine - supprimer l'une casse l'autre.
 *
 * L'archive est un zip :
 *
 *   manifest.json   format, version, titre, inventaire des pièces jointes
 *   case.json       le graphe, tel qu'il est sur le disque
 *   uploads/*       les pièces jointes, sous leur nom d'origine
 *
 * Les noms de fichiers d'`uploads/` sont ceux qu'utilisent les URLs du graphe :
 * un import n'aura qu'à les réécrire en bloc.
 *
 * NE CONTIENT PAS, volontairement :
 *   - les membres, invitations et journal d'audit - ils désignent des comptes
 *     qui n'existent pas sur l'instance d'arrivée ; celui qui importe devient
 *     propriétaire. Les noms d'auteur portés par les entités sont du texte
 *     libre et survivent, eux.
 *   - les instantanés - jusqu'à 40 copies du fichier complet, c'est un filet de
 *     sécurité local, pas du contenu d'enquête.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { zipSync, strToU8 } from 'fflate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Racine des données : configurable par DATA_DIR (voir config.js).
const UPLOADS_DIR = path.join(config.dataDir, 'uploads');

export const ARCHIVE_FORMAT = 'osintmapper-case';
export const ARCHIVE_VERSION = 1;
export const ARCHIVE_EXT = 'omcase';

/** Même contrainte qu'à la création et au service d'un upload. */
const NOM_UPLOAD = /^[a-f0-9]{24}\.(png|jpg|gif|webp)$/;

/**
 * Construit l'archive d'une enquête.
 *
 * @param {object} p
 * @param {string} p.caseId
 * @param {object} p.meta            titre / description, pour le manifeste
 * @param {{buffer:Buffer, encrypted:boolean}} p.file  fichier d'enquête sur disque
 * @param {Array<{id:string, ext:string, size:number}>} p.uploads  lignes `Upload`
 * @returns {{buffer:Buffer, manifest:object}}
 */
export function buildArchive({ caseId, meta = {}, file, uploads = [] }) {
  if (!file?.buffer) throw new Error('NO_CASE_FILE');

  // Une enquête chiffrée n'est pas archivable pour l'instant : son graphe est
  // bien un blob opaque, mais les pièces jointes, elles, sont en clair sur le
  // disque. Les empaqueter telles quelles produirait une « archive chiffrée »
  // dont toutes les photos seraient lisibles - une régression de
  // confidentialité déguisée en fonctionnalité. On refuse plutôt que de livrer
  // ça ; l'export `.enc` du graphe seul reste disponible.
  if (file.encrypted) throw new Error('ENCRYPTED_UNSUPPORTED');

  const entrees = {};
  const inventaire = [];
  const manquants = [];

  for (const up of uploads) {
    if (!NOM_UPLOAD.test(up.id)) { manquants.push(up.id); continue; }
    const src = path.join(UPLOADS_DIR, up.id);
    if (!fs.existsSync(src)) {
      // Ligne en base sans fichier : on l'inscrit au manifeste plutôt que de
      // laisser croire que l'archive est complète.
      manquants.push(up.id);
      continue;
    }
    // Niveau 0 : ces formats sont déjà compressés, recompresser coûte du temps
    // pour quelques pour cent.
    entrees[`uploads/${up.id}`] = [new Uint8Array(fs.readFileSync(src)), { level: 0 }];
    inventaire.push({ name: up.id, size: up.size ?? null });
  }

  const manifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    case: { title: meta.title || '', description: meta.description || '' },
    encrypted: false,
    uploads: inventaire,
    // Vide dans le cas normal ; non vide, c'est le signe qu'il manque des
    // fichiers sur le disque de départ.
    missingUploads: manquants,
  };

  entrees['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  entrees['case.json'] = [new Uint8Array(file.buffer), { level: 6 }];

  return { buffer: Buffer.from(zipSync(entrees, { mtime: new Date() })), manifest };
}

/** Nom de fichier proposé au téléchargement. */
export function archiveFilename(title) {
  // Les caractères de chemin sont neutralisés, puis les tirets bas de bordure
  // retirés : un titre entièrement ponctué donnait sinon « ___.omcase ».
  const base = String(title || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 50) || 'enquete';
  return `${base}.${ARCHIVE_EXT}`;
}
