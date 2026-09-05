/**
 * Plugin Registry - Pure dynamic discovery.
 * 
 * Each plugin = a folder in plugins/ with manifest.js
 * No hardcoded stubs. No manual imports.
 * 
 * TO ADD A PLUGIN:
 *   1. Create plugins/my-plugin/manifest.js (export default { id, name, ... })
 *   2. Optionally add Panel.jsx, docs.md
 *   3. Done - auto-discovered by Vite's import.meta.glob
 */
import { createPluginEngine } from './core/engine.js';

const manifestModules = import.meta.glob('./**/manifest.js', { eager: true });
const panelModules = import.meta.glob('./**/Panel.jsx', { eager: true });
const docsModules = import.meta.glob('./**/docs.md', { eager: true, query: '?raw', import: 'default' });
// Traductions de la documentation : `docs.en.md`, `docs.de.md`. Le glob de
// `docs.md` ne les attrape pas - le motif est littéral, pas un préfixe.
const docsTraduits = import.meta.glob('./**/docs.*.md', { eager: true, query: '?raw', import: 'default' });

export function initPluginEngine() {
  const engine = createPluginEngine();

  for (const [path, mod] of Object.entries(manifestModules)) {
    if (path.includes('/core/') || path.includes('/_template/')) continue;
    const manifest = mod.default;
    if (!manifest?.id) continue;

    const folder = path.substring(0, path.lastIndexOf('/') + 1);
    const PanelComp = panelModules[folder + 'Panel.jsx']?.default || null;
    const docsContent = docsModules[folder + 'docs.md'] || null;
    if (docsContent && !manifest.docs) manifest.docs = docsContent;

    // `docsI18n` porte une entrée par langue ; le français reste dans `docs`,
    // et sert de repli pour toute langue sans traduction.
    if (!manifest.docsI18n) {
      const parLangue = docsContent ? { fr: docsContent } : {};
      for (const [chemin, contenu] of Object.entries(docsTraduits)) {
        if (!chemin.startsWith(folder)) continue;
        const langue = chemin.slice(folder.length).match(/^docs\.(\w+)\.md$/)?.[1];
        if (langue) parLangue[langue] = contenu;
      }
      if (Object.keys(parLangue).length) manifest.docsI18n = parLangue;
    }

    engine.register(manifest, PanelComp ? { Panel: PanelComp } : {});
  }

  return engine;
}
