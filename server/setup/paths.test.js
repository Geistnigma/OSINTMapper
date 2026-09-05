/**
 * Validation du dossier de données de l'installateur.
 *
 * C'est la seule barrière entre une saisie libre et la création de dossiers :
 * elle décide où atterriront les enquêtes, et ce qu'elle laisse passer est
 * ensuite inscrit dans un `.env` que plus personne ne relira.
 */
import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { validerDossierDonnees, suggestions, CODES } from './paths.js';

const faussefs = (existants = [], contenu = {}) => ({
  existsSync: (p) => existants.includes(p),
  statSync: () => ({ isDirectory: () => true }),
  readdirSync: (p) => contenu[p] || [],
  writeFileSync: () => {},
  unlinkSync: () => {},
});

describe('validerDossierDonnees', () => {
  it('refuse une saisie vide', () => {
    expect(validerDossierDonnees('').code).toBe(CODES.VIDE);
    expect(validerDossierDonnees('   ').code).toBe(CODES.VIDE);
  });

  it('refuse un chemin relatif — le .env est relu depuis des répertoires différents', () => {
    expect(validerDossierDonnees('donnees').code).toBe(CODES.RELATIF);
    expect(validerDossierDonnees('./donnees').code).toBe(CODES.RELATIF);
  });

  it('refuse les racines système et leurs enfants directs', () => {
    for (const p of ['/', '/etc', '/etc/osintmapper', '/usr/osintmapper', '/boot/x']) {
      expect(validerDossierDonnees(p, { fsModule: faussefs(['/', '/etc', '/usr', '/boot']) }).code).toBe(CODES.SYSTEME);
    }
  });

  it('accepte un dossier plus profond sous une racine système', () => {
    const fs = faussefs(['/', '/var', '/var/opt']);
    expect(validerDossierDonnees('/var/opt/osintmapper', { fsModule: fs }).code).toBe(CODES.OK);
  });

  it('développe le tilde', () => {
    const r = validerDossierDonnees('~/OSINTMapper', { fsModule: faussefs([os.homedir()]) });
    expect(r.chemin).toBe(path.join(os.homedir(), 'OSINTMapper'));
  });

  it("accepte un dossier absent dont un ancêtre existe : toute la chaîne sera créée", () => {
    // Régression : exiger que le parent DIRECT existe rejetait la première
    // suggestion de l'interface (~/OSINTMapper/donnees), pourtant valide.
    const fs = faussefs([os.homedir()]);
    const r = validerDossierDonnees(path.join(os.homedir(), 'OSINTMapper', 'donnees'), { fsModule: fs });
    expect(r.code).toBe(CODES.OK);
  });

  it('refuse un dossier qui contient déjà autre chose', () => {
    const cible = '/home/x/donnees';
    const fs = faussefs(['/home/x', cible], { [cible]: ['photos', 'these.pdf'] });
    expect(validerDossierDonnees(cible, { fsModule: fs }).code).toBe(CODES.NON_VIDE);
  });

  it("accepte un dossier ne contenant que l'arborescence d'OSINTMapper — réinstallation", () => {
    const cible = '/home/x/donnees';
    const fs = faussefs(['/home/x', cible], { [cible]: ['cases', 'uploads', '.git'] });
    expect(validerDossierDonnees(cible, { fsModule: fs }).code).toBe(CODES.OK);
  });

  it('signale /tmp sans le refuser', () => {
    const r = validerDossierDonnees('/tmp/om/donnees', { fsModule: faussefs(['/tmp', '/tmp/om']) });
    expect(r.code).toBe(CODES.OK);
    expect(r.avertissement).toMatch(/redémarrage/);
  });

  it('signale un dossier non écrivable plutôt que d\'échouer à la création', () => {
    const fs = { ...faussefs(['/lecture-seule']), writeFileSync: () => { throw new Error('EROFS'); } };
    expect(validerDossierDonnees('/lecture-seule/donnees', { fsModule: fs }).code).toBe(CODES.NON_ECRIVABLE);
  });

  it('propose des suggestions absolues et distinctes', () => {
    const s = suggestions('/home/test');
    expect(s.length).toBeGreaterThan(2);
    expect(new Set(s).size).toBe(s.length);
    for (const p of s) expect(path.isAbsolute(p)).toBe(true);
  });
});
