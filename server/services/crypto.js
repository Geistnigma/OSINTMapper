/**
 * Case file encryption service.
 * AES-256-GCM with PBKDF2 key derivation.
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits (recommended for GCM)
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;
const TAG_LENGTH = 16;

/**
 * Derive a 256-bit key from a password using PBKDF2.
 */
export function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a JSON object.
 * Returns: { salt: hex, iv: hex, tag: hex, data: base64 }
 */
export function encrypt(jsonObj, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(jsonObj);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('base64'),
  };
}

/**
 * Decrypt an encrypted case file.
 * Input: { salt: hex, iv: hex, tag: hex, data: base64 }
 * Returns: parsed JSON object.
 * Throws on wrong password.
 */
export function decrypt(encObj, password) {
  const salt = Buffer.from(encObj.salt, 'hex');
  const iv = Buffer.from(encObj.iv, 'hex');
  const tag = Buffer.from(encObj.tag, 'hex');
  const ciphertext = Buffer.from(encObj.data, 'base64');

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    throw new Error('Mot de passe incorrect ou fichier corrompu');
  }
}

/**
 * Verify a password against an encrypted file without fully decrypting.
 * Returns true if the password is correct.
 */
export function verifyPassword(encObj, password) {
  try {
    decrypt(encObj, password);
    return true;
  } catch {
    return false;
  }
}
