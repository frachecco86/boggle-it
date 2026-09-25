import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    /*
     * Il worklet della voce (`src/audio/worklets/voice-capture.worklet.js`) NON
     * va mai incorporato come data URL: è un file che il browser carica da solo
     * con `audioWorklet.addModule()`, e un `data:` URL dipende dal CSP della
     * pagina e dalle regole della WebView (nell'app Android). Sotto la soglia di
     * default (~4 KB) Vite lo incorporerebbe, quindi gli si chiede esplicitamente
     * di restare un file con hash nel nome.
     */
    assetsInlineLimit: (filePath) => (filePath.endsWith('.worklet.js') ? false : undefined),
  },
  // Il `.env` sta nella ROOT del monorepo (vedi docs/ANDROID.md e
  // .env.android.example), non in `apps/web/`. Senza questo Vite leggerebbe solo
  // `apps/web/.env` e `VITE_SERVER_URL` verrebbe silenziosamente ignorato,
  // producendo un APK senza server (multiplayer rotto).
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@boggle/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/health': { target: 'http://localhost:3001' },
      '/schede': { target: 'http://localhost:3001' },
      '/preview': { target: 'http://localhost:3001' },
      '/admin': { target: 'http://localhost:3001' },
      '/auth': { target: 'http://localhost:3001' },
      '/me': { target: 'http://localhost:3001' },
      '/profiles': { target: 'http://localhost:3001' },
      '/music': { target: 'http://localhost:3001' },
      '/words': { target: 'http://localhost:3001' },
      '/leaderboard': { target: 'http://localhost:3001' },
      '/games': { target: 'http://localhost:3001' },
    },
  },
});
