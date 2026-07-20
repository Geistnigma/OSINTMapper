/**
 * Case file service.
 * Manages JSON files in server/data/cases/.
 * Handles plain and encrypted files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { encrypt, decrypt } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, '..', 'data', 'cases');

// Ensure directory exists
if (!fs.existsSync(CASES_DIR)) fs.mkdirSync(CASES_DIR, { recursive: true });

const FILE_VERSION = 1;

/**
 * Build the standard JSON structure for a case.
 */
export function buildCaseData(meta, entities, links, stickers, postits, timeline) {
  return {
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    meta: meta || {},
    entities: entities || [],
    links: links || [],
    stickers: stickers || [],
    postits: postits || [],
    timeline: timeline || [],
  };
}

/**
 * Save a case to disk.
 * @param {string} caseId
 * @param {object} data - { meta, entities, links, stickers, postits }
 * @param {object} opts - { encrypted: bool, password: string }
 */
export function saveCaseFile(caseId, data, opts = {}) {
  const caseData = buildCaseData(data.meta, data.entities, data.links, data.stickers, data.postits, data.timeline);

  let content;
  let ext;
  if (opts.encrypted && opts.password) {
    content = JSON.stringify(encrypt(caseData, opts.password), null, 0);
    ext = '.enc';
  } else {
    content = JSON.stringify(caseData, null, 2);
    ext = '.json';
  }

  const filePath = path.join(CASES_DIR, `${caseId}${ext}`);
  const tmpPath = filePath + '.tmp';
  const bakPath = filePath + '.bak';

  // Atomic write: write to tmp, backup old, rename tmp to final
  fs.writeFileSync(tmpPath, content, 'utf8');

  // Backup existing file before replacing
  if (fs.existsSync(filePath)) {
    try { fs.copyFileSync(filePath, bakPath); } catch (e) { /* best effort */ }
  }

  // Remove old files (might have different extension)
  const jsonPath = path.join(CASES_DIR, `${caseId}.json`);
  const encPath = path.join(CASES_DIR, `${caseId}.enc`);
  if (fs.existsSync(jsonPath) && jsonPath !== filePath) fs.unlinkSync(jsonPath);
  if (fs.existsSync(encPath) && encPath !== filePath) fs.unlinkSync(encPath);

  // Atomic rename
  fs.renameSync(tmpPath, filePath);

  return { filePath, ext, size: content.length };
}

/**
 * Load a case from disk.
 * @param {string} caseId
 * @param {string|null} password - required if encrypted
 * @returns {object} - { version, meta, entities, links, stickers, postits }
 */
export function loadCaseFile(caseId, password = null) {
  const jsonPath = path.join(CASES_DIR, `${caseId}.json`);
  const encPath = path.join(CASES_DIR, `${caseId}.enc`);

  let filePath = null;
  let isEncrypted = false;

  if (fs.existsSync(encPath)) { filePath = encPath; isEncrypted = true; }
  else if (fs.existsSync(jsonPath)) { filePath = jsonPath; isEncrypted = false; }
  else return null; // No file — case has no data yet

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (isEncrypted) {
    if (!password) throw new Error('PASSWORD_REQUIRED');
    return decrypt(parsed, password);
  }

  return parsed;
}

/**
 * Check if a case file exists and if it's encrypted.
 */
export function getCaseFileInfo(caseId) {
  const jsonPath = path.join(CASES_DIR, `${caseId}.json`);
  const encPath = path.join(CASES_DIR, `${caseId}.enc`);

  if (fs.existsSync(encPath)) {
    const stat = fs.statSync(encPath);
    return { exists: true, encrypted: true, size: stat.size, path: encPath };
  }
  if (fs.existsSync(jsonPath)) {
    const stat = fs.statSync(jsonPath);
    return { exists: true, encrypted: false, size: stat.size, path: jsonPath };
  }
  return { exists: false, encrypted: false, size: 0, path: null };
}

/**
 * Delete a case file.
 */
export function deleteCaseFile(caseId) {
  const jsonPath = path.join(CASES_DIR, `${caseId}.json`);
  const encPath = path.join(CASES_DIR, `${caseId}.enc`);
  if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
}

/**
 * Get the raw file buffer for export/download.
 */
export function getCaseFileBuffer(caseId) {
  const info = getCaseFileInfo(caseId);
  if (!info.exists) return null;
  return {
    buffer: fs.readFileSync(info.path),
    filename: `${caseId}${info.encrypted ? '.enc' : '.json'}`,
    encrypted: info.encrypted,
  };
}

/**
 * Import a case file from a buffer.
 * Returns the parsed data (decrypted if needed).
 */
export function importCaseFile(caseId, buffer, password = null) {
  const raw = buffer.toString('utf8');
  const parsed = JSON.parse(raw);

  // Detect if encrypted (has salt/iv/tag/data fields)
  const isEncrypted = parsed.salt && parsed.iv && parsed.tag && parsed.data;

  if (isEncrypted) {
    if (!password) throw new Error('PASSWORD_REQUIRED');
    const data = decrypt(parsed, password);
    // Re-save with the provided password
    saveCaseFile(caseId, data, { encrypted: true, password });
    return { data, encrypted: true };
  } else {
    // Plain JSON — might have version/meta/entities or be the raw data
    const data = parsed.version ? parsed : buildCaseData(parsed.meta, parsed.entities, parsed.links, parsed.stickers, parsed.postits);
    saveCaseFile(caseId, data, { encrypted: false });
    return { data, encrypted: false };
  }
}
