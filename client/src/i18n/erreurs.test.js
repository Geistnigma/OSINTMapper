/**
 * Traduction des erreurs du serveur.
 *
 * Le serveur renvoie un `code` stable et un message français. Le code fait foi,
 * le message n'est qu'un repli pour les clients non mis à jour et pour les
 * journaux. Ces tests figent le contrat : tout code émis par le serveur doit
 * avoir sa traduction, et une erreur sans code connu ne doit JAMAIS afficher
 * une clé brute à l'utilisateur.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fr from './fr.js';
import { messageErreur } from '../lib/api.js';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'server');

/** Tous les codes réellement émis par le serveur, lus dans les sources. */
function codesDuServeur() {
  const fichiers = [];
  for (const d of ['routes', 'middleware', '.']) {
    const dossier = path.join(racine, d);
    if (!fs.existsSync(dossier)) continue;
    for (const f of fs.readdirSync(dossier)) {
      if (f.endsWith('.js') && !f.endsWith('.test.js')) fichiers.push(path.join(dossier, f));
    }
  }
  const codes = new Set();
  for (const f of fichiers) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/code: '([a-z_]+)'/g)) codes.add(m[1]);
  }
  return [...codes].sort();
}

describe('erreurs du serveur', () => {
  it('émet au moins une cinquantaine de codes distincts', () => {
    expect(codesDuServeur().length).toBeGreaterThan(40);
  });

  it('chaque code émis a sa traduction', () => {
    const sansTraduction = codesDuServeur().filter(c => !(`erreurs.${c}` in fr));
    expect(sansTraduction).toEqual([]);
  });

  it('traduit un code connu', () => {
    expect(messageErreur({ code: 'case_not_found', error: 'Case not found' })).toBe(fr['erreurs.case_not_found']);
  });

  it("retombe sur le message du serveur pour un code inconnu - jamais une clé", () => {
    const msg = messageErreur({ code: 'code_qui_nexiste_pas', error: 'Message brut du serveur' });
    expect(msg).toBe('Message brut du serveur');
    expect(msg).not.toContain('erreurs.');
  });

  it('interpole les paramètres', () => {
    expect(messageErreur({ code: 'password_too_short', params: { n: 12 } })).toContain('12');
  });

  it("traduit la clé d'action du compte protégé", () => {
    const msg = messageErreur({ code: 'protected_account', params: { nom: 'admin', action: 'delete' } });
    expect(msg).toContain('admin');
    expect(msg).toContain('supprimé');   // et non « delete »
  });

  it('reste lisible sans code ni message', () => {
    expect(messageErreur({})).toBe(fr['erreurs.server_error']);
    expect(messageErreur(null)).toBe(fr['erreurs.server_error']);
  });
});
