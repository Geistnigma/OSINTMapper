/**
 * Validation du dossier de données choisi à l'installation.
 *
 * Extrait du serveur d'installation pour être testable sans monter Express :
 * c'est la partie où une erreur coûte cher (on s'apprête à écrire des enquêtes
 * dedans, et à le déclarer dans un `.env` que plus personne ne relira).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Racines système où l'on refuse d'écrire, même si l'utilisateur en a le droit
 * (installation lancée en root, par exemple). Le refus porte sur la racine
 * elle-même et sur ce qui s'y trouve directement : `/etc/osintmapper` est
 * refusé, `/srv/osintmapper` accepté.
 */
const RACINES_INTERDITES = ['/', '/bin', '/boot', '/dev', '/etc', '/lib', '/lib64',
  '/proc', '/root', '/run', '/sbin', '/sys', '/usr', '/var/lib', '/var/run', '/System', '/Library'];

export const CODES = {
  VIDE: 'chemin_vide',
  RELATIF: 'chemin_relatif',
  SYSTEME: 'racine_systeme',
  PARENT_ABSENT: 'parent_absent',
  PAS_UN_DOSSIER: 'pas_un_dossier',
  NON_ECRIVABLE: 'non_ecrivable',
  NON_VIDE: 'non_vide',
  OK: 'ok',
};

/** Sous-dossiers créés par l'installation, tolérés dans un dossier « non vide ». */
export const SOUS_DOSSIERS = ['cases', 'uploads', 'snapshots', 'plugins', 'yjs'];

/**
 * @param {string} entree chemin saisi par l'utilisateur (`~` accepté)
 * @returns {{code: string, chemin: string|null, message: string, avertissement?: string}}
 */
export function validerDossierDonnees(entree, { fsModule = fs } = {}) {
  const brut = (entree || '').trim();
  if (!brut) return { code: CODES.VIDE, chemin: null, message: 'Indiquez un dossier.' };
  // Chaque retour porte `code` ET `params` : le message français reste pour un
  // client qui ne traduirait pas, la page compose le sien à partir du code.

  const etendu = brut.startsWith('~')
    ? path.join(os.homedir(), brut.slice(1))
    : brut;

  if (!path.isAbsolute(etendu)) {
    return { code: CODES.RELATIF, chemin: null,
      message: 'Le chemin doit être absolu : il est écrit dans un fichier de configuration relu depuis des répertoires différents.' };
  }

  const chemin = path.normalize(etendu).replace(/\/+$/, '') || '/';

  if (RACINES_INTERDITES.includes(chemin) || RACINES_INTERDITES.includes(path.dirname(chemin))) {
    return { code: CODES.SYSTEME, chemin, params: { exemple: suggestions()[0] },
      message: `Emplacement système refusé. Choisissez par exemple ${suggestions()[0]}.` };
  }

  // Le dossier peut ne pas exister : toute la chaîne sera créée (mkdir -p).
  // On remonte donc jusqu'au premier ancêtre existant, et c'est LUI qu'on teste
  // en écriture. Exiger que le parent direct existe rejetait la suggestion par
  // défaut (~/OSINTMapper/donnees) alors qu'elle est parfaitement valide.
  const existe = fsModule.existsSync(chemin);
  let ancetre = chemin;
  while (!fsModule.existsSync(ancetre) && path.dirname(ancetre) !== ancetre) {
    ancetre = path.dirname(ancetre);
  }
  if (!fsModule.existsSync(ancetre)) {
    return { code: CODES.PARENT_ABSENT, chemin, params: { chemin },
      message: `Aucun dossier existant sur le chemin ${chemin}.` };
  }

  if (existe && !fsModule.statSync(chemin).isDirectory()) {
    return { code: CODES.PAS_UN_DOSSIER, chemin, message: 'Ce chemin est un fichier, pas un dossier.' };
  }

  // Droit d'écriture : vérifié en écrivant réellement. `access()` répond sur les
  // permissions déclarées, pas sur un montage en lecture seule ni sur un quota.
  const cible = existe ? chemin : ancetre;
  try {
    const sonde = path.join(cible, `.osintmapper-test-${process.pid}`);
    fsModule.writeFileSync(sonde, 'x');
    fsModule.unlinkSync(sonde);
  } catch {
    return { code: CODES.NON_ECRIVABLE, chemin, params: { cible },
      message: `Écriture impossible dans ${cible}. Vérifiez les droits.` };
  }

  if (existe) {
    const restes = fsModule.readdirSync(chemin).filter(n => !n.startsWith('.') && !SOUS_DOSSIERS.includes(n));
    if (restes.length) {
      return { code: CODES.NON_VIDE, chemin, params: { n: restes.length },
        message: `Le dossier contient déjà ${restes.length} élément(s) étranger(s) à OSINTMapper. Choisissez un dossier vide ou dédié.` };
    }
  }

  return {
    code: CODES.OK, chemin,
    params: { existe, chaine: ancetre !== path.dirname(chemin) ? path.relative(ancetre, chemin) : '' },
    message: existe ? 'Dossier existant, utilisable.'
      : `Le dossier sera créé${ancetre !== path.dirname(chemin) ? ` (avec ${path.relative(ancetre, chemin)})` : ''}.`,
    avertissement: chemin.includes('/tmp/') ? 'Un dossier sous /tmp est effacé au redémarrage de la machine.' : undefined,
    codeAvertissement: chemin.includes('/tmp/') ? 'tmp' : undefined,
  };
}

/** Emplacements proposés dans l'interface, du plus courant au plus institutionnel. */
export function suggestions(home = os.homedir()) {
  return [
    path.join(home, 'OSINTMapper', 'donnees'),
    path.join(home, 'Documents', 'OSINTMapper'),
    '/srv/osintmapper/donnees',
    '/var/opt/osintmapper',
  ];
}
