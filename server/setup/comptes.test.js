/**
 * Validation des comptes créés à l'installation.
 *
 * L'installateur crée des comptes hors des routes de l'application : rien ne
 * garantit tout seul qu'il applique les mêmes règles. Ce test fige la plus
 * importante - la longueur minimale de mot de passe, identique à celle de
 * `routes/auth.js` (MIN_PASSWORD_LENGTH = 12). Si l'une des deux bouge sans
 * l'autre, l'installateur créerait des comptes plus faibles que ceux créés
 * ensuite depuis l'écran d'administration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validerComptes } from './index.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
const bon = { username: 'patron', password: 'motdepasse12x' };

describe('validerComptes', () => {
  it('accepte un administrateur correct', () => {
    expect(validerComptes(bon).ok).toBe(true);
  });

  it('exige 12 caractères, comme le reste de l\'application', () => {
    expect(validerComptes({ username: 'patron', password: 'onzecaract' }).ok).toBe(false);
    expect(validerComptes({ username: 'patron', password: 'douzecaracte' }).ok).toBe(true);
  });

  it('reste aligné sur MIN_PASSWORD_LENGTH de routes/auth.js', () => {
    const source = fs.readFileSync(path.join(ici, '..', 'routes', 'auth.js'), 'utf8');
    const attendu = Number(source.match(/MIN_PASSWORD_LENGTH\s*=\s*(\d+)/)[1]);
    const tropCourt = 'x'.repeat(attendu - 1);
    expect(validerComptes({ username: 'patron', password: tropCourt }).ok).toBe(false);
    expect(validerComptes({ username: 'patron', password: 'x'.repeat(attendu) }).ok).toBe(true);
  });

  it('refuse un identifiant hors format', () => {
    for (const username of ['ab', 'a b', 'a/b', '', 'x'.repeat(33)]) {
      expect(validerComptes({ username, password: 'motdepasse12x' }).ok).toBe(false);
    }
  });

  it('refuse deux fois le même identifiant, casse comprise', () => {
    const r = validerComptes(bon, [{ username: 'PATRON', password: 'autremotdepasse' }]);
    expect(r.ok).toBe(false);
    // Le refus porte un CODE : la page d'installation le traduit, le message
    // français ne sert qu'aux journaux et à un client qui ne traduirait pas.
    expect(r.erreur.code).toBe('identifiant_double');
    expect(r.erreur.params.nom).toBe('PATRON');
    expect(r.erreur.message).toMatch(/double/i);
  });

  it('refuse un rôle inconnu sur un compte secondaire', () => {
    // Identifiants d'au moins 3 caractères : plus court, c'est le format qui
    // rejette, et le test passerait pour la mauvaise raison.
    const avec = (role) => validerComptes(bon, [{ username: 'analyste1', password: 'motdepasse12x', role }]);
    expect(avec('ROI').ok).toBe(false);
    expect(avec('VIEWER').ok).toBe(true);
    expect(avec(undefined).ok).toBe(true);   // rôle omis → ANALYST par défaut
  });

  it('chaque refus porte un code stable et ses paramètres', () => {
    // La page d'installation compose son message à partir du code : sans lui,
    // elle n'aurait que du français à afficher, quelle que soit la langue.
    const cas = [
      [{ username: 'a b', password: 'motdepasse12x' }, [], 'identifiant_invalide'],
      [bon, [{ username: 'PATRON', password: 'motdepasse12x' }], 'identifiant_double'],
      [{ username: 'patron', password: 'court' }, [], 'mot_de_passe_court'],
      [bon, [{ username: 'analyste1', password: 'motdepasse12x', role: 'ROI' }], 'role_inconnu'],
    ];
    for (const [admin, autres, code] of cas) {
      const r = validerComptes(admin, autres);
      expect(r.ok).toBe(false);
      expect(r.erreur.code).toBe(code);
      expect(typeof r.erreur.message).toBe('string');
    }
  });

  it('valide aussi les comptes secondaires, pas seulement le premier', () => {
    expect(validerComptes(bon, [{ username: 'ok1', password: 'motdepasse12x' }, { username: 'ko', password: 'court' }]).ok).toBe(false);
  });
});
