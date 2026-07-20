import docs from './docs.md?raw';

export default {
  id: 'flag-tracker',
  name: 'Flag Tracker',
  version: '2.0.0',
  description: 'Suivi des flags CTF intégré au graphe. Marquez des entités comme flags, générez le format avec pattern configurable, gérez vos challenges.',
  author: 'Core',
  icon: '🚩',
  category: 'CTF',
  docs,
  hooks: {
    'toolbar-button': { label: 'Flag Tracker', icon: '🚩' },
    'fullscreen-panel': true,
    'entity-tab': { label: 'Flag', icon: '🚩' },
  },
  permissions: ['read:entities', 'write:entities'],
  settings: [
    { key: 'flagPattern', type: 'text', label: 'Pattern du flag (ex: HTB, FLAG, picoCTF)', default: 'FLAG' },
    { key: 'ctfName', type: 'text', label: 'Nom du CTF', default: '' },
  ],
};
