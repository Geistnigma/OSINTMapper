import docs from './docs.md?raw';

export default {
  id: 'map',
  name: 'Carte géographique',
  version: '3.0.0',
  description: 'Carte interactive avec points géolocalisés, trajectoires chronologiques et flèches directionnelles entre les points datés.',
  author: 'Core',
  icon: '🗺️',
  category: 'Visualisation',
  docs,
  hooks: {
    'toolbar-button': { label: 'Carte', icon: '🗺️', badge: 'geoCount' },
    'fullscreen-panel': true,
  },
  permissions: ['read:entities', 'read:links'],
  settings: [
    { key: 'tileProvider', type: 'select', label: 'Fond de carte', options: ['osm', 'dark', 'satellite'], default: 'dark' },
    { key: 'showTrajectories', type: 'boolean', label: 'Afficher les trajectoires', default: true },
    { key: 'showLabels', type: 'boolean', label: 'Labels sur les marqueurs', default: true },
    { key: 'clusterMarkers', type: 'boolean', label: 'Regrouper les marqueurs proches', default: false },
  ],
};
