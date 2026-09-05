import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Le client parle à l'API en chemin RELATIF (lib/api.js comme
    // useCollaboration.js) : c'est ce proxy qui aiguille vers le serveur en
    // développement, et c'est ce qui rend le code identique en production.
    //
    // `/yjs` manquait. Tant que le hook de collaboration écrivait `:4444` en
    // dur, son absence ne se voyait pas ; en relatif, l'oublier couperait la
    // synchronisation du graphe en développement.
    proxy: {
      '/api': 'http://localhost:4444',
      '/yjs': { target: 'ws://localhost:4444', ws: true },
      '/ws-custom': { target: 'ws://localhost:4444', ws: true },
    },
  },
  // Pas de sourcemap dans le build livré : elles étaient publiées telles quelles
  // (7,7 Mo de code source intégral, téléchargeable par n'importe qui sur
  // /assets/*.map) alors que le serveur affirmait en commentaire qu'il n'y en
  // avait pas. Pour déboguer un build en local : `vite build --sourcemap`.
  build: { outDir: 'dist', sourcemap: false },
  appType: 'spa',
});
