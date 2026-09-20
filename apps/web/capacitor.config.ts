import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configurazione Capacitor per l'app Android.
 *
 * Strategia: il web buildato è INCLUDO nell'app (`webDir: dist`), quindi
 * l'interfaccia, le schede e gli asset audio funzionano anche senza rete:
 * single player, foto profilo e registrazioni audio sono completamente offline.
 *
 * Il multiplayer e la sincronizzazione dei profili richiedono il server: l'app
 * lo raggiunge direttamente (le richieste `fetch` verso `VITE_SERVER_URL` non
 * passano dal bridge Capacitor, quindi non servono eccezioni di dominio).
 *
 * Nota: con `server.url` vuoto l'app usa i file locali (comportamento voluto).
 */
const config: CapacitorConfig = {
  appId: 'it.boggle.app',
  appName: 'Sbooble',
  webDir: 'dist',
  android: {
    // Il WebView deve poter usare microfono (registrazioni) e cleartext in sviluppo.
    allowMixedContent: false,
    captureInput: true,
  },
  server: {
    // In sviluppo si può puntare al server locale scommentando:
    // url: 'http://10.0.2.2:5173',
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
