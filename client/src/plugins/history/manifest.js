export default {
  id: 'history',
  name: 'Historique de versions',
  version: '1.0.0',
  sdkVersion: '2.1.0', // ctx.api requiert le SDK 2.1
  description: "Points de restauration d'une enquête : revenir à un état antérieur, même après un rechargement - là où Ctrl+Z s'arrête.",
  author: 'Core',
  icon: '🕓',
  category: 'Sécurité',
  hooks: {
    'toolbar-button': { label: 'Historique', icon: '🕓' },
  },
  // Filet de sécurité des données : il doit être là sans qu'on ait à y penser.
  // Reste désactivable - un choix explicite de l'utilisateur n'est pas réécrit.
  defaultEnabled: true,
  // Déclaratif : le serveur reste seul juge (consultation réservée aux membres,
  // restauration au propriétaire de l'enquête).
  permissions: ['api:read', 'api:write'],
};
