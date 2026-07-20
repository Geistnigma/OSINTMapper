// import docs from './docs.md?raw';  // Uncomment if you add a docs.md file

export default {
  // ═══ REQUIRED ═══
  id: 'my-plugin',               // Unique ID (lowercase, hyphens ok)
  name: 'Mon Plugin',            // Display name
  version: '1.0.0',
  description: 'Description courte du plugin.',
  author: 'Votre nom',
  icon: '🔧',                    // Emoji icon
  category: 'Enrichissement',    // Visualisation | Collaboration | Import / Export | Enrichissement | Sécurité | CTF

  // ═══ OPTIONAL ═══
  // docs,                        // Raw markdown string (from docs.md import)

  hooks: {
    // Uncomment the hooks you need:

    // Bouton dans la toolbar du graphe → ouvre le panel fullscreen
    'toolbar-button': { label: 'Mon Plugin', icon: '🔧' },

    // Panel plein écran (nécessite toolbar-button)
    'fullscreen-panel': true,

    // Onglet dans le panneau droit de l'entité (📋 Infos | 🔗 Liens | 📝 Notes | 🔧 Mon Plugin)
    // 'entity-tab': { label: 'Mon Plugin', icon: '🔧' },
  },

  permissions: [],                // 'read:entities', 'write:entities'

  settings: [
    // { key: 'apiKey', type: 'text', label: 'Clé API', default: '' },
    // { key: 'enabled', type: 'boolean', label: 'Activer le mode X', default: true },
  ],
};
