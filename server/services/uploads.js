/**
 * Pièces jointes d'enquête — allowlist stricte + signatures.
 *
 * Les fichiers sont stockés sous un nom opaque (`<24 hex>.<ext>`). L'extension
 * ne vient jamais du nom d'origine : elle est dérivée du Content-Type déclaré
 * puis confrontée au contenu réel (nombres magiques). Les types exécutables /
 * scriptables (html, js, svg, sh, exe…) sont refusés. Les documents non-image
 * sont servis en `Content-Disposition: attachment` pour éviter l'exécution
 * inline dans le navigateur.
 */

/** Extensions acceptées (minuscules). Pas de SVG (XSS), pas d'archives génériques. */
export const ALLOWED_EXTS = Object.freeze([
  'png', 'jpg', 'gif', 'webp',
  'pdf',
  'txt', 'csv', 'json',
  'odt', 'ods', 'odp',
]);

export const IMAGE_EXTS = Object.freeze(['png', 'jpg', 'gif', 'webp']);

/** MIME déclaré → extension canonique. */
export const MIME_TO_EXT = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
});

export const MIME_BY_EXT = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
});

/** Nom opaque servi / stocké : exactement 24 hex + extension allowlistée. */
export const UPLOAD_ID_RE = /^[a-f0-9]{24}\.(png|jpg|gif|webp|pdf|txt|csv|json|odt|ods|odp)$/;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isZipLocalHeader(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/**
 * Pour ODF : le premier fichier du zip doit s'appeler `mimetype` (non compressé)
 * et contenir le type OpenDocument attendu — sinon on refuse (zip arbitraire).
 */
function looksLikeOdf(buf, expectedMime) {
  if (!isZipLocalHeader(buf) || buf.length < 38) return false;
  // local file header: name starts at offset 30, length at 26 (LE u16)
  const nameLen = buf.readUInt16LE(26);
  const extraLen = buf.readUInt16LE(28);
  const nameStart = 30;
  const nameEnd = nameStart + nameLen;
  if (nameEnd + extraLen > buf.length) return false;
  const name = buf.subarray(nameStart, nameEnd).toString('utf8');
  if (name !== 'mimetype') return false;
  const dataStart = nameEnd + extraLen;
  const method = buf.readUInt16LE(8);
  // mimetype must be stored (method 0), not deflated
  if (method !== 0) return false;
  const compSize = buf.readUInt32LE(18);
  const dataEnd = dataStart + compSize;
  if (dataEnd > buf.length) return false;
  const mime = buf.subarray(dataStart, dataEnd).toString('utf8');
  return mime === expectedMime;
}

function looksLikeText(buf) {
  if (buf.length === 0) return false;
  // Pas de NUL (binaires / polyglottes)
  if (buf.includes(0x00)) return false;
  const head = buf.subarray(0, Math.min(buf.length, 256)).toString('utf8');
  // Refuse HTML / SVG / scripts emballés en « texte »
  if (/^\s*</.test(head)) return false;
  if (/^#!/.test(head)) return false;
  if (/^\s*<\?xml/i.test(head)) return false;
  // UTF-8 approximatif : rejette les séquences invalides grossières via toString roundtrip
  try {
    const s = buf.toString('utf8');
    if (s.includes('\uFFFD') && buf.length < 4) return false;
  } catch {
    return false;
  }
  return true;
}

function looksLikeJson(buf) {
  if (!looksLikeText(buf)) return false;
  const s = buf.toString('utf8').trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Buffer} buf
 * @param {string} ext extension canonique
 * @returns {boolean}
 */
export function contentMatchesExt(buf, ext) {
  if (!buf || buf.length < 4) return false;
  switch (ext) {
    case 'png':
      return buf.length >= 8 && buf.subarray(0, 8).equals(PNG);
    case 'jpg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'gif':
      return buf.subarray(0, 4).toString('latin1') === 'GIF8';
    case 'webp':
      return buf.length >= 12
        && buf.subarray(0, 4).toString('latin1') === 'RIFF'
        && buf.subarray(8, 12).toString('latin1') === 'WEBP';
    case 'pdf':
      // Autorise un BOM éventuel / offset faible : %PDF dans les 1024 premiers octets
      {
        const probe = buf.subarray(0, Math.min(buf.length, 1024)).toString('latin1');
        return probe.includes('%PDF-');
      }
    case 'txt':
    case 'csv':
      return looksLikeText(buf);
    case 'json':
      return looksLikeJson(buf);
    case 'odt':
      return looksLikeOdf(buf, 'application/vnd.oasis.opendocument.text');
    case 'ods':
      return looksLikeOdf(buf, 'application/vnd.oasis.opendocument.spreadsheet');
    case 'odp':
      return looksLikeOdf(buf, 'application/vnd.oasis.opendocument.presentation');
    default:
      return false;
  }
}

/**
 * Parse un data-URI `data:<mime>;base64,...` vers { ext, buffer, kind }.
 * @returns {{ ext: string, buffer: Buffer, kind: 'image'|'file' }}
 */
export function parseDataUri(data) {
  if (typeof data !== 'string' || !data.startsWith('data:')) {
    const err = new Error('Invalid upload data');
    err.code = 'bad_upload_data';
    throw err;
  }
  const m = data.match(/^data:([^;,]+)(;charset=[^;,]+)?;base64,(.+)$/s);
  if (!m) {
    const err = new Error('Invalid upload encoding');
    err.code = 'bad_upload_format';
    throw err;
  }
  const mime = m[1].toLowerCase().trim();
  const ext = MIME_TO_EXT[mime];
  if (!ext || !ALLOWED_EXTS.includes(ext)) {
    const err = new Error('File type not allowed');
    err.code = 'type_not_allowed';
    throw err;
  }
  const buffer = Buffer.from(m[3], 'base64');
  if (!buffer.length) {
    const err = new Error('Empty file');
    err.code = 'empty_file';
    throw err;
  }
  const kind = IMAGE_EXTS.includes(ext) ? 'image' : 'file';
  const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (buffer.length > max) {
    const err = new Error(kind === 'image' ? 'Image too large' : 'File too large');
    err.code = kind === 'image' ? 'image_too_large' : 'file_too_large';
    throw err;
  }
  if (!contentMatchesExt(buffer, ext)) {
    const err = new Error('Content does not match declared type');
    err.code = 'content_mismatch';
    throw err;
  }
  return { ext, buffer, kind };
}

export function isInlineExt(ext) {
  return IMAGE_EXTS.includes(ext) || ext === 'pdf';
}
