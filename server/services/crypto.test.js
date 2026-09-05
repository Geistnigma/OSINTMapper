import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { promisify } from 'util';
import { encrypt, decrypt, deriveKey } from './crypto.js';

const pbkdf2 = promisify(crypto.pbkdf2);

/**
 * Le chiffrement par enquête est le seul mécanisme qui protège une enquête
 * au repos. Deux propriétés comptent autant que l'algorithme :
 *
 *   1. un fichier chiffré hier doit rester lisible aujourd'hui, même si les
 *      paramètres de dérivation ont changé depuis ;
 *   2. la dérivation ne doit pas bloquer la boucle d'événements, sans quoi
 *      chaque sauvegarde chiffrée fige le serveur pour tout le monde.
 */

describe('chiffrement d’enquête', () => {
  it('fait l’aller-retour', async () => {
    const donnees = { entities: [{ id: 'a', label: 'Dupont & Fils <SARL>' }], links: [] };
    const enveloppe = await encrypt(donnees, 'mot de passe correct');
    expect(await decrypt(enveloppe, 'mot de passe correct')).toEqual(donnees);
  });

  it('refuse un mauvais mot de passe', async () => {
    const enveloppe = await encrypt({ x: 1 }, 'le bon');
    await expect(decrypt(enveloppe, 'le mauvais')).rejects.toThrow(/incorrect|corrompu/i);
  });

  it('refuse un fichier altéré - GCM authentifie', async () => {
    const enveloppe = await encrypt({ x: 1 }, 'secret');
    const octets = Buffer.from(enveloppe.data, 'base64');
    octets[0] ^= 0xff;
    await expect(decrypt({ ...enveloppe, data: octets.toString('base64') }, 'secret'))
      .rejects.toThrow();
  });

  it('tire un sel ET un IV neufs à chaque chiffrement', async () => {
    // Réutiliser un IV avec la même clé casse GCM (récupération du keystream).
    const a = await encrypt({ x: 1 }, 'secret');
    const b = await encrypt({ x: 1 }, 'secret');
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
    expect(a.data).not.toBe(b.data);
  });

  it('inscrit le nombre d’itérations dans l’enveloppe', async () => {
    // C'est ce champ qui permettra de relever le paramètre une prochaine fois
    // sans rendre illisible ce qui est déjà écrit.
    const enveloppe = await encrypt({ x: 1 }, 'secret');
    expect(enveloppe.iterations).toBe(600000);
  });

  it('déchiffre encore un fichier écrit à 100 000 itérations, sans le champ', async () => {
    // Reproduction fidèle de l'ancien format : même algorithme, ancien compte
    // d'itérations, et AUCUN champ `iterations`. C'est le fichier qu'une
    // instance déjà en service a sur son disque.
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const key = await pbkdf2('ancien secret', salt, 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const clair = JSON.stringify({ legacy: true });
    const chiffre = Buffer.concat([cipher.update(clair, 'utf8'), cipher.final()]);

    const ancien = {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      data: chiffre.toString('base64'),
    };

    expect(await decrypt(ancien, 'ancien secret')).toEqual({ legacy: true });
  });

  it('deriveKey est asynchrone et ne bloque pas la boucle d’événements', async () => {
    // `pbkdf2Sync` rendait un Buffer ; la version bloquante figeait le serveur
    // pour tous les utilisateurs à chaque sauvegarde chiffrée.
    const promesse = deriveKey('secret', crypto.randomBytes(32));
    expect(typeof promesse.then).toBe('function');

    // La boucle continue de tourner pendant la dérivation.
    let tourne = false;
    setImmediate(() => { tourne = true; });
    await promesse;
    expect(tourne).toBe(true);
  });
});
