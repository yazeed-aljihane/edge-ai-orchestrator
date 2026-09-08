import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/task': 'http://127.0.0.1:3000',
      '/tasks': 'http://127.0.0.1:3000',
      '/agent': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
    },
  },
});
