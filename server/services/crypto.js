/**
 * Case file encryption service.
 * AES-256-GCM with PBKDF2 key derivation.
 */
import crypto from 'crypto';
import { promisify } from 'util';

const pbkdf2 = promisify(crypto.pbkdf2);

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits (recommended for GCM)
const SALT_LENGTH = 32;

/**
 * 600 000 itérations, la recommandation OWASP courante pour PBKDF2-HMAC-SHA256.
 * L'ancienne valeur (100 000) datait d'un temps où c'était la recommandation.
 */
const PBKDF2_ITERATIONS = 600000;

/**
 * Nombre d'itérations des fichiers écrits AVANT que l'enveloppe ne le porte.
 *
 * Le compte est désormais stocké dans le fichier chiffré : sans cela, le
 * relever aurait rendu illisible toute enquête déjà chiffrée - la clé dérivée
 * n'aurait plus correspondu, et l'échec se serait présenté comme un « mot de
 * passe incorrect », donc indiscernable d'une faute de frappe.
 */
const LEGACY_ITERATIONS = 100000;

/**
 * Dérive une clé de 256 bits à partir d'un mot de passe.
 *
 * **Asynchrone à dessein.** `pbkdf2Sync` bloquait la boucle d'événements le
 * temps du calcul - pour TOUS les utilisateurs, à CHAQUE sauvegarde d'une
 * enquête chiffrée. À 600 000 itérations, un tel blocage se compterait en
 * centaines de millisecondes : passer les itérations à la valeur recommandée
 * sans passer à la version asynchrone aurait aggravé le problème.
 */
export function deriveKey(password, salt, iterations = PBKDF2_ITERATIONS) {
  return pbkdf2(password, salt, iterations, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a JSON object.
 * Returns: { salt: hex, iv: hex, tag: hex, data: base64 }
 */
export async function encrypt(jsonObj, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt);
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
    // Le compte d'itérations voyage AVEC le fichier : c'est ce qui permet de
    // relever le paramètre sans rendre illisible ce qui a déjà été écrit.
    iterations: PBKDF2_ITERATIONS,
    data: encrypted.toString('base64'),
  };
}

/**
 * Decrypt an encrypted case file.
 * Input: { salt: hex, iv: hex, tag: hex, data: base64 }
 * Returns: parsed JSON object.
 * Throws on wrong password.
 */
export async function decrypt(encObj, password) {
  const salt = Buffer.from(encObj.salt, 'hex');
  const iv = Buffer.from(encObj.iv, 'hex');
  const tag = Buffer.from(encObj.tag, 'hex');
  const ciphertext = Buffer.from(encObj.data, 'base64');

  // Fichier d'avant l'ajout du champ : il a été écrit à 100 000 itérations.
  const key = await deriveKey(password, salt, encObj.iterations || LEGACY_ITERATIONS);
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
