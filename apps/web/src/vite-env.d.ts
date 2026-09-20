/// <reference types="vite/client" />

/**
 * Variabili d'ambiente del client (build-time).
 * Configurate in Netlify / `.env` / `.env.local`.
 */
interface ImportMetaEnv {
  /** URL del server Socket.IO (vuoto = same-origin). Es. https://boggle-api.up.railway.app */
  readonly VITE_SERVER_URL?: string;
  /** Base alternativa per il dizionario, es. https://boggle.netlify.app/dictionary */
  readonly VITE_DICTIONARY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
