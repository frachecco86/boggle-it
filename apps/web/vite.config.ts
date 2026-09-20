import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Scarta i file `.wasm` di onnxruntime-web dal bundle.
 *
 * Perché: onnxruntime-web espone più varianti (base, JSEP, asyncify, JSPI) e le
 * referenzia tutte; Vite non può sapere quale servirà a runtime e le copia TUTTE
 * (~80 MB). Noi carichiamo la variante base dalla CDN (vedi `aiStyles.ts`), quindi
 * quei file non servono nel build.
 */
function dropOrtWasm(): Plugin {
  return {
    name: 'drop-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.keys(bundle)) {
        if (/\.wasm$/.test(file) && /ort-wasm/.test(file)) delete bundle[file];
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), dropOrtWasm()],
  // Il `.env` sta nella ROOT del monorepo (vedi docs/ANDROID.md e
  // .env.android.example), non in `apps/web/`. Senza questo Vite leggerebbe solo
  // `apps/web/.env` e `VITE_SERVER_URL` verrebbe silenziosamente ignorato,
  // producendo un APK senza server (multiplayer rotto).
  envDir: path.resolve(__dirname, '../..'),
  // onnxruntime-web carica i suoi .wasm a runtime: non vanno pre-bundlati da
  // Vite (romperebbe i percorsi) e devono restare file separati, scaricati solo
  // quando l'utente usa uno stile AI.
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Isola il runtime AI: non entra nel bundle iniziale.
          onnx: ['onnxruntime-web'],
        },
      },
    },
  },
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
    },
  },
});
