/**
 * Tout symbole de traduction utilisé doit être importé.
 *
 * Panne réelle : `EntityPanel` et `Admin` appelaient `useT()` sans l'importer.
 * Le build passe — Rollup traite un identifiant inconnu comme un global — et
 * l'application casse au premier rendu du composant, avec un
 * « ReferenceError: useT is not defined » sur un bundle minifié.
 *
 * La cause était un garde inversé dans un script de migration : l'import
 * n'était ajouté QUE si aucun import i18n n'existait déjà. Ce test rattrape la
 * classe entière d'erreurs, quelle qu'en soit l'origine.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fr from './fr.js';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Symbole → fichier qui le définit (et n'a donc pas à l'importer). */
const SYMBOLES = {
  useT: 'i18n/index.jsx',
  useLangue: 'i18n/index.jsx',
  traduire: 'i18n/index.jsx',
  getLocale: 'i18n/index.jsx',
  messageErreur: 'lib/api.js',
};

function sources(dossier = src, acc = []) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) sources(p, acc);
    else if (/\.(js|jsx)$/.test(e.name) && !e.name.endsWith('.test.js') && !e.name.endsWith('.test.jsx')) acc.push(p);
  }
  return acc;
}

/** Portées de premier niveau d'un fichier : chaque composant est isolé. */
function portees(code) {
  const bornes = [];
  for (const m of code.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm)) {
    bornes.push({ nom: m[1], debut: m.index, finSignature: m.index + m[0].length });
  }
  for (const m of code.matchAll(/^(?:export\s+)?const\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>/gm)) {
    bornes.push({ nom: m[1], debut: m.index, finSignature: m.index + m[0].length });
  }
  bornes.sort((a, b) => a.debut - b.debut);
  return bornes.map((b, i) => ({
    nom: b.nom,
    debut: b.debut,
    fin: i + 1 < bornes.length ? bornes[i + 1].debut : code.length,
    corps: code.slice(b.debut, i + 1 < bornes.length ? bornes[i + 1].debut : code.length),
    signature: code.slice(b.debut, b.finSignature + 400),
  }));
}

describe('imports de traduction', () => {
  it('aucun symbole utilisé sans être importé', () => {
    const fautes = [];
    for (const fichier of sources()) {
      const rel = path.relative(src, fichier).replace(/\\/g, '/');
      const code = fs.readFileSync(fichier, 'utf8');
      for (const [symbole, definiPar] of Object.entries(SYMBOLES)) {
        if (rel === definiPar) continue;
        const utilise = new RegExp(`\\b${symbole}\\s*\\(`).test(code);
        const importe = new RegExp(`import\\s*\\{[^}]*\\b${symbole}\\b[^}]*\\}`).test(code);
        if (utilise && !importe) fautes.push(`${rel} utilise ${symbole} sans l'importer`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it('aucune portée n\'utilise `tr` sans le déclarer', () => {
    // Deuxième panne réelle : `EntityView` est un composant À PART de
    // `EntityPanel`, dans le même fichier. `const tr = useT()` déclaré dans
    // l'un ne porte pas dans l'autre - la fiche d'entité rendait une page
    // blanche sur « tr is not defined ». Vérifier les imports ne suffit pas :
    // il faut vérifier chaque PORTÉE.
    const fautes = [];
    for (const fichier of sources()) {
      const rel = path.relative(src, fichier).replace(/\\/g, '/');
      const code = fs.readFileSync(fichier, 'utf8');
      for (const { nom, corps, signature } of portees(code)) {
        if (!/\btr\s*\(/.test(corps)) continue;
        const declare = /\b(?:const|let|var)\s+tr\b/.test(corps);
        const parametre = /[({,]\s*tr\s*(?:=[^,)]*)?\s*[,)}]/.test(signature);
        if (!declare && !parametre) fautes.push(`${rel} → ${nom}() utilise tr sans le déclarer`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it('aucune constante de module n\'appelle `tr`', () => {
    // Troisième panne réelle : `TRAJ_COLORS` (carte) et `STATUSES`
    // (flag-tracker) appelaient `tr` au niveau MODULE. Deux conséquences : le
    // fichier lève « tr is not defined » dès l'import - ce qui a fait tomber
    // huit fichiers de tests d'un coup - et, même déclaré, un libellé figé à
    // l'import ne suivrait jamais un changement de langue.
    const fautes = [];
    for (const fichier of sources()) {
      const rel = path.relative(src, fichier).replace(/\\/g, '/');
      const code = fs.readFileSync(fichier, 'utf8');
      // Les commentaires citent volontiers `tr(...)` ; les retirer d'abord.
      const sansCommentaires = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // Découpe par INDEX : retirer les corps un à un d'une chaîne déjà
      // modifiée fait échouer les correspondances suivantes.
      const couvert = new Array(sansCommentaires.length).fill(false);
      for (const { debut, fin } of portees(sansCommentaires)) {
        for (let i = debut; i < fin && i < couvert.length; i++) couvert[i] = true;
      }
      const horsFonction = [...sansCommentaires].filter((_, i) => !couvert[i]).join('');
      if (/\btr\s*\(/.test(horsFonction)) fautes.push(`${rel} appelle tr() au niveau module`);
    }
    expect(fautes).toEqual([]);
  });

  it('toute clé littérale passée à tr() ou traduire() existe en français', () => {
    // Le contrôle de `cles.test.js` va du dictionnaire vers les dictionnaires ;
    // celui-ci va du CODE vers le dictionnaire. Une clé mal orthographiée à
    // l'appel n'est visible nulle part ailleurs : `creerT` rend la clé
    // elle-même, donc l'interface affiche « panneau.titre.creeLe » sans que
    // rien n'échoue. Les familles construites à l'exécution
    // (`tr('statut.' + id)`) laissent un préfixe et sont couvertes par
    // `cles.test.js`.
    const inconnues = new Set();
    for (const fichier of sources()) {
      const rel = path.relative(src, fichier).replace(/\\/g, '/');
      if (rel.startsWith('i18n/')) continue;
      const code = fs.readFileSync(fichier, 'utf8');
      for (const m of code.matchAll(/\b(?:tr|traduire)\(\s*'([\w.#-]+)'/g)) {
        const cle = m[1];
        if (cle.endsWith('.')) continue;              // préfixe de famille
        if (cle in fr || `${cle}#other` in fr) continue;
        inconnues.add(`${rel} : ${cle}`);
      }
    }
    expect([...inconnues]).toEqual([]);
  });

  it("le fournisseur est monté à la racine, sinon useT() rend le dictionnaire par défaut", () => {
    const main = fs.readFileSync(path.join(src, 'main.jsx'), 'utf8');
    expect(main).toMatch(/<I18nProvider>/);
    // Il doit ENVELOPPER le routeur : la langue sert dès l'écran de connexion.
    expect(main.indexOf('<I18nProvider>')).toBeLessThan(main.indexOf('<BrowserRouter>'));
  });
});
