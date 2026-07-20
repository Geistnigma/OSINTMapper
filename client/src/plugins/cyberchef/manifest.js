import docs from './docs.md?raw';

export default {
  id: 'cyberchef',
  name: 'CyberChef',
  version: '1.0.0',
  description: 'Outil de décodage/encodage intégré (GCHQ CyberChef). Base64, Hex, ROT13, AES, XOR, hashing et 300+ opérations.',
  author: 'GCHQ / Core',
  icon: '🧑‍🍳',
  category: 'CTF',
  docs,
  hooks: {
    'toolbar-button': { label: 'CyberChef', icon: '🧑‍🍳' },
    'fullscreen-panel': true,
  },
  permissions: [],
  settings: [
    { key: 'localPath', type: 'text', label: 'Chemin local CyberChef (ex: /cyberchef/index.html)', default: '/cyberchef/index.html' },
  ],
};
