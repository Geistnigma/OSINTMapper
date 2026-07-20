import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4444',
      '/ws': { target: 'ws://localhost:4444', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
  appType: 'spa',
});
