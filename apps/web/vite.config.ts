import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@boggle/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@boggle/dictionary': path.resolve(__dirname, '../../packages/dictionary/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/dictionary': { target: 'http://localhost:3001' },
      '/health': { target: 'http://localhost:3001' },
    },
  },
});
