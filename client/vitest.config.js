import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Certains modules testés contiennent du JSX (lib/theme.jsx porte les icônes
  // SVG) : sans ce plugin, l'import échoue sur « React is not defined ».
  plugins: [react()],
  test: {
    // jsdom pour les tests qui touchent au DOM (assainissement HTML, filtrage
    // des événements). Les tests de logique pure n'en dépendent pas.
    environment: 'jsdom',
    // Le serveur n'a pas sa propre configuration : ses tests de logique pure
    // (archive, etc.) tournent avec ceux du client plutôt que de dupliquer
    // toute une chaîne d'outils pour trois fichiers.
    include: ['src/**/*.test.{js,jsx}', '../server/**/*.test.js'],
    exclude: ['**/node_modules/**'],
    globals: false,
  },
});
