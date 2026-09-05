/**
 * Documentation des plugins, déclinée par langue.
 *
 * Les docs sont des fichiers Markdown (`docs.md`, `docs.en.md`, `docs.de.md`)
 * chargés par `import.meta.glob`. Rien n'oblige un plugin à les fournir toutes ;
 * ce test vérifie qu'aucune ne MANQUE par oubli, et qu'aucune n'est un simple
 * copié-collé du français — c'est ainsi qu'une traduction se perd en silence.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGUES = ['en', 'de'];

/** Plugins natifs qui fournissent une documentation française. */
function pluginsAvecDoc() {
  return fs.readdirSync(racine, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'core')
    .map(e => e.name)
    .filter(nom => fs.existsSync(path.join(racine, nom, 'docs.md')));
}

const lire = (plugin, fichier) => fs.readFileSync(path.join(racine, plugin, fichier), 'utf8');

describe('documentation des plugins', () => {
  it('au moins trois plugins natifs sont documentés', () => {
    expect(pluginsAvecDoc().length).toBeGreaterThanOrEqual(3);
  });

  for (const langue of LANGUES) {
    it(`chaque plugin documenté a sa traduction ${langue}`, () => {
      const manquants = pluginsAvecDoc().filter(p => !fs.existsSync(path.join(racine, p, `docs.${langue}.md`)));
      expect(manquants).toEqual([]);
    });

    it(`la traduction ${langue} n'est pas une copie du français`, () => {
      const copies = pluginsAvecDoc()
        .filter(p => fs.existsSync(path.join(racine, p, `docs.${langue}.md`)))
        .filter(p => lire(p, `docs.${langue}.md`).trim() === lire(p, 'docs.md').trim());
      expect(copies).toEqual([]);
    });

    it(`la traduction ${langue} garde la structure du document`, () => {
      // Un titre perdu, un tableau oublié : la traduction diverge du contenu
      // qu'elle est censée rendre. On compare le SQUELETTE, pas les mots.
      const ecarts = [];
      for (const p of pluginsAvecDoc()) {
        if (!fs.existsSync(path.join(racine, p, `docs.${langue}.md`))) continue;
        const titres = (s) => (s.match(/^#{1,3} /gm) || []).length;
        const blocs = (s) => (s.match(/^```/gm) || []).length;
        const fr = lire(p, 'docs.md');
        const tr = lire(p, `docs.${langue}.md`);
        if (titres(fr) !== titres(tr)) ecarts.push(`${p}/${langue}: ${titres(fr)} titres en fr, ${titres(tr)}`);
        if (blocs(fr) !== blocs(tr)) ecarts.push(`${p}/${langue}: ${blocs(fr)} délimiteurs de code en fr, ${blocs(tr)}`);
      }
      expect(ecarts).toEqual([]);
    });
  }

  it('aucune documentation vide', () => {
    const vides = [];
    for (const p of pluginsAvecDoc()) {
      for (const f of ['docs.md', ...LANGUES.map(l => `docs.${l}.md`)]) {
        const chemin = path.join(racine, p, f);
        if (fs.existsSync(chemin) && lire(p, f).trim().length < 100) vides.push(`${p}/${f}`);
      }
    }
    expect(vides).toEqual([]);
  });
});
