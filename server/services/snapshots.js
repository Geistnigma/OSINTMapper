/**
 * Historique de versions d'une enquête.
 *
 * L'annulation (Y.UndoManager) vit en mémoire : elle ne survit pas à un F5.
 * Au-delà de la session, il n'existait aucun filet - la table `CaseHistory`
 * n'était écrite par personne, et le `.bak` est réécrit à chaque sauvegarde,
 * donc une seconde après la modification qu'on voudrait annuler.
 *
 * Un instantané est une **copie octet pour octet** du fichier d'enquête. C'est
 * volontaire : un fichier chiffré est copié tel quel, donc l'historique
 * fonctionne sans jamais accéder aux clés de session, et une restauration
 * n'est qu'une copie en sens inverse. Rien n'est déchiffré ni re-sérialisé.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Racine des données : configurable par DATA_DIR (voir config.js).
const CASES_DIR = path.join(config.dataDir, 'cases');
const SNAP_DIR = path.join(config.dataDir, 'snapshots');

if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

/** Intervalle minimum entre deux instantanés automatiques. */
export const AUTO_INTERVAL_MS = 5 * 60 * 1000;
/** Nombre d'instantanés automatiques conservés par enquête. */
export const MAX_AUTO = 20;
/** Nombre de points de restauration manuels conservés par enquête. */
export const MAX_MANUAL = 20;

/** Même défense en profondeur que caseFile.js : rien ne doit sortir du répertoire. */
function safeId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error('Identifiant invalide');
  }
  return id;
}

function caseDir(caseId) {
  const dir = path.join(SNAP_DIR, safeId(caseId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function snapPath(caseId, snapId, ext) {
  return path.join(caseDir(caseId), `${safeId(snapId)}.${ext === 'enc' ? 'enc' : 'json'}`);
}

/** Chemin du fichier d'enquête courant, ou null s'il n'existe pas encore. */
function currentCaseFile(caseId) {
  safeId(caseId);
  const enc = path.join(CASES_DIR, `${caseId}.enc`);
  if (fs.existsSync(enc)) return { file: enc, ext: 'enc' };
  const json = path.join(CASES_DIR, `${caseId}.json`);
  if (fs.existsSync(json)) return { file: json, ext: 'json' };
  return null;
}

/**
 * Compte entités et liens pour l'aperçu de la liste.
 * Impossible sur un fichier chiffré sans la clé : on renvoie null, et l'UI
 * affiche « chiffré » plutôt qu'un zéro trompeur.
 */
function countContents(file, ext) {
  if (ext !== 'json') return { entities: null, links: null };
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { entities: (d.entities || []).length, links: (d.links || []).length };
  } catch {
    return { entities: null, links: null };
  }
}

/**
 * Crée un instantané du fichier d'enquête courant.
 * @param {string} caseId
 * @param {{ userId?: string, label?: string, auto?: boolean }} opts
 * @returns {Promise<object|null>} la ligne créée, ou null s'il n'y a rien à copier
 */
export async function createSnapshot(caseId, opts = {}) {
  const cur = currentCaseFile(caseId);
  if (!cur) return null; // enquête sans données : rien à archiver

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const dest = snapPath(caseId, id, cur.ext);
  fs.copyFileSync(cur.file, dest);

  const { size } = fs.statSync(dest);
  const counts = countContents(dest, cur.ext);

  const row = await prisma.caseSnapshot.create({
    data: {
      id, caseId, ext: cur.ext, size,
      auto: opts.auto !== false,
      label: opts.label || null,
      createdBy: opts.userId || null,
      entities: counts.entities,
      links: counts.links,
    },
  });

  await prune(caseId);
  return row;
}

/**
 * Crée un instantané automatique, sauf si le dernier est trop récent.
 * Appelé après chaque sauvegarde : sans ce garde-fou, l'autosave (1 s de
 * debounce) produirait un instantané par frappe.
 */
export async function maybeAutoSnapshot(caseId, userId) {
  try {
    const last = await prisma.caseSnapshot.findFirst({
      where: { caseId, auto: true },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - new Date(last.createdAt).getTime() < AUTO_INTERVAL_MS) return null;
    return await createSnapshot(caseId, { userId, auto: true });
  } catch (e) {
    // Un historique en échec ne doit jamais faire échouer la sauvegarde.
    console.error('  [snapshots] auto:', e.message);
    return null;
  }
}

/** Supprime les instantanés au-delà du quota, fichier compris. */
async function prune(caseId) {
  for (const [auto, keep] of [[true, MAX_AUTO], [false, MAX_MANUAL]]) {
    const rows = await prisma.caseSnapshot.findMany({
      where: { caseId, auto },
      orderBy: { createdAt: 'desc' },
      skip: keep,
    });
    for (const r of rows) {
      try { fs.unlinkSync(snapPath(caseId, r.id, r.ext)); } catch { /* déjà absent */ }
      await prisma.caseSnapshot.delete({ where: { id: r.id } }).catch(() => {});
    }
  }
}

export function listSnapshots(caseId) {
  return prisma.caseSnapshot.findMany({
    where: { caseId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Restaure un instantané par-dessus le fichier d'enquête.
 *
 * Un instantané de l'état courant est pris d'abord : une restauration reste
 * elle-même annulable, sinon se tromper de point de restauration détruirait
 * définitivement le travail en cours.
 *
 * Ne touche PAS au document Yjs en mémoire : tant qu'une salle est ouverte,
 * c'est lui la source de vérité et il réécrirait le fichier. L'appelant doit
 * fermer la salle (voir closeYjsRoom) pour que les clients rechargent.
 */
export async function restoreSnapshot(caseId, snapId, userId) {
  const snap = await prisma.caseSnapshot.findFirst({ where: { id: snapId, caseId } });
  if (!snap) throw new Error('Instantané introuvable');

  const src = snapPath(caseId, snap.id, snap.ext);
  if (!fs.existsSync(src)) throw new Error('Fichier de sauvegarde manquant');

  await createSnapshot(caseId, {
    userId,
    auto: false,
    label: `Avant restauration du ${new Date(snap.createdAt).toLocaleString('fr-FR')}`,
  });

  // L'extension peut changer (une enquête a pu être chiffrée depuis) : on écrit
  // la nouvelle et on retire l'ancienne, comme le fait saveCaseFile.
  const destPath = path.join(CASES_DIR, `${caseId}.${snap.ext}`);
  const otherPath = path.join(CASES_DIR, `${caseId}.${snap.ext === 'enc' ? 'json' : 'enc'}`);
  const tmpPath = `${destPath}.tmp`;

  fs.copyFileSync(src, tmpPath);
  fs.renameSync(tmpPath, destPath); // atomique
  if (fs.existsSync(otherPath)) { try { fs.unlinkSync(otherPath); } catch {} }

  return snap;
}

/**
 * Supprime tous les instantanés d'une enquête, fichiers ET lignes.
 *
 * On ne peut PAS compter sur `onDelete: Cascade` : la suppression d'une enquête
 * est logique (`status: 'DELETED'`), la ligne Case survit, donc la cascade ne
 * se déclenche jamais. Sans suppression explicite, l'historique continuait de
 * lister des points dont le fichier n'existait plus.
 */
export async function deleteSnapshots(caseId) {
  try {
    const dir = path.join(SNAP_DIR, safeId(caseId));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.error('  [snapshots] delete fichiers:', e.message);
  }
  try {
    await prisma.caseSnapshot.deleteMany({ where: { caseId } });
  } catch (e) {
    console.error('  [snapshots] delete lignes:', e.message);
  }
}
