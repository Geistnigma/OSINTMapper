/**
 * PluginEngine - Central registry for OSINTMapper plugins.
 * 
 * Responsibilities:
 *   - Register plugins (manifest + components)
 *   - Manage enabled/disabled state (persisted in localStorage)
 *   - Provide hooks for core to query registered plugins
 *   - Manage per-plugin settings
 * 
 * Usage:
 *   const engine = createPluginEngine();
 *   engine.register(mapManifest, { Panel: MapPanel });
 *   engine.enable('map');
 *   const toolbarPlugins = engine.getByHook('toolbar-button');
 */

import { SDK_VERSION } from './context.js';

const STORAGE_KEY = 'om_plugins_enabled';
const SETTINGS_KEY = 'om_plugins_settings';

export const KNOWN_HOOKS = ['toolbar-button', 'entity-tab'];
export const KNOWN_CATEGORIES = ['Visualisation', 'Collaboration', 'Import / Export', 'Enrichissement', 'Sécurité', 'CTF'];
// `api:*` accompagne la capacité `ctx.api` apparue en SDK 2.1 : sans elles, tout
// plugin appelant le serveur déclenchait un avertissement à l'enregistrement.
const KNOWN_PERMISSIONS = ['read:entities', 'write:entities', 'api:read', 'api:write'];

/** Couleurs qu'un thème de plugin doit fournir - celles des thèmes intégrés. */
export const REQUIRED_THEME_KEYS = [
  'bg', 'surface', 'surfaceAlt', 'border', 'borderHover',
  'text', 'textSecondary', 'textMuted', 'accent', 'accentHover',
  'canvasBg', 'canvasGrid', 'shadow', 'danger', 'success', 'warning', 'info',
  'catHover', 'itemBg', 'itemHover', 'itemBorder', 'tooltip', 'tooltipBorder',
];

const major = (v) => parseInt(String(v || '').split('.')[0], 10);

/**
 * Vérifie un manifeste avant enregistrement.
 * @returns {Array<{level:'error'|'warn', message:string}>}
 */
export function validateManifest(manifest, components = {}) {
  const out = [];
  const err = (m) => out.push({ level: 'error', message: m });
  const warn = (m) => out.push({ level: 'warn', message: m });

  if (!manifest || typeof manifest !== 'object') { err('manifeste absent ou invalide'); return out; }
  if (!manifest.id) err('champ "id" obligatoire');
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) err(`id "${manifest.id}" invalide (kebab-case attendu)`);
  if (!manifest.name) err('champ "name" obligatoire');
  if (!manifest.version) warn('champ "version" manquant');

  // Compatibilité de SDK : sans cette vérification, un changement de contrat
  // casse les plugins à l'exécution sans aucun avertissement.
  if (!manifest.sdkVersion) {
    warn(`"sdkVersion" manquant - déclarez sdkVersion: '${SDK_VERSION}'`);
  } else if (major(manifest.sdkVersion) !== major(SDK_VERSION)) {
    err(`sdkVersion ${manifest.sdkVersion} incompatible avec l'hôte ${SDK_VERSION}`);
  }

  if (manifest.category && !KNOWN_CATEGORIES.includes(manifest.category)) {
    warn(`catégorie "${manifest.category}" inconnue (attendu : ${KNOWN_CATEGORIES.join(', ')})`);
  }

  const hooks = manifest.hooks || {};
  const declared = Object.keys(hooks);
  // Un plugin peut n'apporter que de la donnée - des thèmes, par exemple -
  // sans point d'intégration visuel. L'avertissement ne vaut que s'il
  // n'apporte vraiment rien.
  if (declared.length === 0 && !(manifest.themes || []).length) {
    warn('aucun hook ni thème déclaré - le plugin ne s\'affichera nulle part');
  }
  for (const h of declared) {
    // 'fullscreen-panel' était documenté mais jamais lu par le cœur : on le
    // tolère pour ne pas casser les manifestes existants, en le signalant.
    if (h === 'fullscreen-panel') { warn('hook "fullscreen-panel" obsolète : un toolbar-button + Panel.jsx suffit'); continue; }
    if (!KNOWN_HOOKS.includes(h)) warn(`hook "${h}" inconnu - il sera ignoré`);
  }
  if (declared.some(h => KNOWN_HOOKS.includes(h)) && !components.Panel) {
    err('un hook est déclaré mais aucun Panel.jsx n\'a été trouvé');
  }

  for (const p of manifest.permissions || []) {
    if (!KNOWN_PERMISSIONS.includes(p)) warn(`permission "${p}" inconnue`);
  }

  for (const s of manifest.settings || []) {
    if (!s.key) err('un setting est déclaré sans "key"');
    if (s.type && !['text', 'boolean', 'select'].includes(s.type)) warn(`setting "${s.key}" : type "${s.type}" inconnu`);
    if (s.type === 'select' && !Array.isArray(s.options)) err(`setting "${s.key}" de type select sans "options"`);
  }

  // Un thème incomplet ne casse pas un coin de l'écran : il rend `t.machin`
  // indéfini partout où la couleur manque. On refuse à l'enregistrement.
  for (const th of manifest.themes || []) {
    if (!th?.id) { err('un thème est déclaré sans "id"'); continue; }
    if (!th.name) warn(`thème "${th.id}" sans "name" - l'id sera affiché`);
    if (!th.colors || typeof th.colors !== 'object') {
      err(`thème "${th.id}" sans objet "colors"`);
      continue;
    }
    const manquantes = REQUIRED_THEME_KEYS.filter(k => !th.colors[k]);
    if (manquantes.length) err(`thème "${th.id}" : couleur(s) manquante(s) - ${manquantes.join(', ')}`);
  }

  return out;
}

export function createPluginEngine() {
  const plugins = new Map(); // id → { manifest, components }
  let enabledIds = loadEnabled();
  let allSettings = loadSettings();

  function loadEnabled() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
  }
  function saveEnabled() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledIds));
  }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
  }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(allSettings));
  }

  return {
    /**
     * Register a plugin.
     * @param {Object} manifest - Plugin manifest (id, name, hooks, settings, etc.)
     * @param {Object} components - { Panel?, Sidebar?, Toolbar?, ContextMenu? }
     */
    register(manifest, components = {}) {
      const problems = validateManifest(manifest, components);
      const blocking = problems.filter(p => p.level === 'error');

      if (blocking.length > 0) {
        // On refuse le plugin plutôt que de le laisser casser plus loin dans
        // l'UI : auparavant seul l'`id` était vérifié, et un manifeste malformé
        // produisait une catégorie fantôme ou un hook silencieusement ignoré.
        console.error(
          `[plugins] "${manifest?.id || '(sans id)'}" rejeté :\n` +
          blocking.map(p => `  ✗ ${p.message}`).join('\n')
        );
        return { ok: false, problems };
      }
      if (problems.length > 0) {
        console.warn(
          `[plugins] "${manifest.id}" :\n` + problems.map(p => `  ⚠ ${p.message}`).join('\n')
        );
      }

      plugins.set(manifest.id, { manifest, components, problems });

      // Activation par défaut, pour un plugin qui remplace une fonction du cœur
      // (l'historique de versions, par exemple) : sans cela le bouton
      // disparaîtrait purement et simplement chez les utilisateurs existants.
      // On ne l'applique que si l'utilisateur ne s'est JAMAIS prononcé - `disable`
      // écrit `false`, donc une clé absente vaut « pas encore décidé ». Un plugin
      // désactivé à la main ne se réactive pas tout seul au rechargement.
      if (manifest.defaultEnabled && !(manifest.id in enabledIds)) {
        enabledIds[manifest.id] = true;
        saveEnabled();
      }

      // Initialize settings with defaults if not set
      if (manifest.settings && !allSettings[manifest.id]) {
        allSettings[manifest.id] = {};
        manifest.settings.forEach(s => {
          allSettings[manifest.id][s.key] = s.default;
        });
        saveSettings();
      }
      return { ok: true, problems };
    },

    /** Get all registered plugins. */
    getAll() {
      return Array.from(plugins.values()).map(p => ({
        ...p.manifest,
        enabled: !!enabledIds[p.manifest.id],
        hasPanel: !!p.components.Panel,
        hasToolbar: !!p.components.Toolbar,
        hasSidebar: !!p.components.Sidebar,
        hasContextMenu: !!p.components.ContextMenu,
        docs: p.manifest.docs || null,
        docsI18n: p.manifest.docsI18n || null,
        problems: p.problems || [],
        source: p.manifest.source || 'built-in',
      }));
    },

    /** Get a plugin by ID. */
    get(id) {
      const p = plugins.get(id);
      if (!p) return null;
      return {
        ...p.manifest,
        ...p.components,
        enabled: !!enabledIds[id],
        settings: allSettings[id] || {},
      };
    },

    /** Get all enabled plugins that declare a specific hook. */
    /**
     * Thèmes apportés par les plugins activés, indexés par id.
     *
     * Déclaratifs (un tableau `themes` dans le manifeste) plutôt qu'un hook à
     * composant : un thème est de la donnée, pas de l'interface. Le plugin n'a
     * donc ni Panel ni code à écrire, et l'hôte peut se rabattre sur un thème
     * intégré si le plugin est désactivé.
     */
    getThemes() {
      const out = {};
      for (const [id, p] of plugins) {
        if (!enabledIds[id]) continue;
        for (const th of p.manifest.themes || []) {
          if (!th?.id || !th.colors) continue;
          // Préfixé par l'id du plugin : deux plugins peuvent proposer un
          // « dark » sans que l'un écrase l'autre, ni les thèmes intégrés.
          out[`${id}:${th.id}`] = { ...th, colors: th.colors, pluginId: id };
        }
      }
      return out;
    },

    getByHook(hookName) {
      const result = [];
      for (const [id, p] of plugins) {
        if (!enabledIds[id]) continue;
        const hook = p.manifest.hooks?.[hookName];
        if (hook) {
          result.push({
            id,
            manifest: p.manifest,
            components: p.components,
            hookConfig: hook,
            settings: allSettings[id] || {},
          });
        }
      }
      return result;
    },

    /** Enable a plugin. */
    /**
     * Active les plugins recommandés par une enquête.
     *
     * L'activation reste une préférence PAR UTILISATEUR : une enquête ne peut
     * pas l'imposer. On applique donc la même règle que `defaultEnabled` -
 * seule l'ABSENCE de décision est comblée. Quelqu'un qui a désactivé la
     * carte ne la voit pas réapparaître parce qu'il ouvre une enquête qui la
     * recommande.
     * @returns {string[]} les identifiants réellement activés
     */
    applyCaseDefaults(ids = []) {
      const actives = [];
      for (const id of ids) {
        if (!plugins.has(id)) continue;      // plugin inconnu de ce poste
        if (id in enabledIds) continue;      // l'utilisateur s'est déjà prononcé
        enabledIds[id] = true;
        actives.push(id);
      }
      if (actives.length) saveEnabled();
      return actives;
    },

    enable(id) {
      enabledIds[id] = true;
      saveEnabled();
    },

    /** Disable a plugin. */
    disable(id) {
      enabledIds[id] = false;
      saveEnabled();
    },

    /** Toggle a plugin. */
    toggle(id) {
      enabledIds[id] = !enabledIds[id];
      saveEnabled();
      return enabledIds[id];
    },

    /** Check if enabled. */
    isEnabled(id) {
      return !!enabledIds[id];
    },

    /** Get settings for a plugin. */
    getSettings(id) {
      return allSettings[id] || {};
    },

    /** Update a setting. */
    updateSetting(id, key, value) {
      if (!allSettings[id]) allSettings[id] = {};
      allSettings[id][key] = value;
      saveSettings();
    },

    /** Enable all. */
    enableAll() {
      for (const id of plugins.keys()) enabledIds[id] = true;
      saveEnabled();
    },

    /** Disable all. */
    disableAll() {
      for (const id of plugins.keys()) enabledIds[id] = false;
      saveEnabled();
    },

    /** Get count stats. */
    stats() {
      const total = plugins.size;
      const enabled = Object.values(enabledIds).filter(Boolean).length;
      return { total, enabled };
    },
  };
}
