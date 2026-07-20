/**
 * Plugin Registry — Pure dynamic discovery.
 * 
 * Each plugin = a folder in plugins/ with manifest.js
 * No hardcoded stubs. No manual imports.
 * 
 * TO ADD A PLUGIN:
 *   1. Create plugins/my-plugin/manifest.js (export default { id, name, ... })
 *   2. Optionally add Panel.jsx, docs.md
 *   3. Done — auto-discovered by Vite's import.meta.glob
 */
import { createPluginEngine } from './core/engine.js';

const manifestModules = import.meta.glob('./**/manifest.js', { eager: true });
const panelModules = import.meta.glob('./**/Panel.jsx', { eager: true });
const docsModules = import.meta.glob('./**/docs.md', { eager: true, query: '?raw', import: 'default' });

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

    engine.register(manifest, PanelComp ? { Panel: PanelComp } : {});
  }

  return engine;
}
