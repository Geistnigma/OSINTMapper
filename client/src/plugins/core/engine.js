/**
 * PluginEngine — Central registry for OSINTMapper plugins.
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

const STORAGE_KEY = 'om_plugins_enabled';
const SETTINGS_KEY = 'om_plugins_settings';

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
      if (!manifest.id) throw new Error('Plugin manifest must have an id');
      plugins.set(manifest.id, { manifest, components });

      // Initialize settings with defaults if not set
      if (manifest.settings && !allSettings[manifest.id]) {
        allSettings[manifest.id] = {};
        manifest.settings.forEach(s => {
          allSettings[manifest.id][s.key] = s.default;
        });
        saveSettings();
      }
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
