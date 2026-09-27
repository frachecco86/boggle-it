/**
 * Regole CORS del server, in un modulo a sé per poterle testare.
 *
 * PERCHÉ ESISTE QUESTO FILE
 * -------------------------
 * L'app Android è un guscio Capacitor: il WebView carica i file locali da
 * un'origine *sintetica* (`https://localhost`), non da un nostro dominio.
 * Ogni chiamata verso il server pubblico è quindi **cross-origin**, mentre sul
 * web il frontend è servito dallo stesso host (monolite) e CORS non entra in
 * gioco.
 *
 * Di conseguenza, se il server non elenca l'origine del WebView, l'app mostra
 * "server non raggiungibile" nella Classifica e in Parole pur essendo il server
 * perfettamente online. È già successo: `CLIENT_ORIGIN` non era impostata su
 * Railway, quindi valevano i soli default e l'APK non poteva parlare col server.
 *
 * Per questo le origini Capacitor sono ora nel codice (default sicuro) e non
 * solo in una variabile d'ambiente che si dimentica.
 */
import type cors from 'cors';

/**
 * Origini del WebView Capacitor.
 *
 * - `https://localhost`: Android con `androidScheme: 'https'` (config attuale).
 * - `capacitor://localhost`: iOS e la config storica di Capacitor.
 */
export const CAPACITOR_ORIGINS = ['https://localhost', 'capacitor://localhost'];

export interface CorsSettings {
  /** Origini esplicite da `CLIENT_ORIGIN` (o `*` per accettarle tutte). */
  clientOrigins: string[];
  /** Accetta le origini del WebView Capacitor. */
  allowCapacitor: boolean;
  /** Consente qualunque `localhost` (utile solo in sviluppo). */
  devLocalhost: boolean;
}

/** Legge la configurazione dall'ambiente, con default di produzione sicuri. */
export function corsSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): CorsSettings {
  const clientOrigins = (env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    clientOrigins,
    /*
     * Le origini Capacitor sono attive di default: sono note, ristrette al
     * WebView dell'app e senza di esse l'APK non funziona. `ALLOW_CAPACITOR=0`
     * le disattiva, per chi servisse il WebView da un dominio reale.
     */
    allowCapacitor: env.ALLOW_CAPACITOR !== '0',
    devLocalhost: env.NODE_ENV !== 'production',
  };
}

/**
 * Decide se un'origine può ricevere la risposta.
 *
 * Nota: un'origine assente (`Origin` non inviato) è ammessa perché in quel caso
 * non c'è una richiesta cross-origin da proteggere — è il caso di `curl`, delle
 * health check e delle chiamate same-origin.
 */
export function makeCorsOrigin(settings: CorsSettings): cors.CorsOptions['origin'] {
  return (origin, callback) => {
    if (!origin) return callback(null, true);
    if (settings.clientOrigins.includes('*') || settings.clientOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (settings.allowCapacitor && CAPACITOR_ORIGINS.includes(origin)) return callback(null, true);
    if (settings.devLocalhost && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  };
}

/** Elenco leggibile delle origini consentite, per il log d'avvio. */
export function corsOriginList(settings: CorsSettings): string[] {
  return [...settings.clientOrigins, ...(settings.allowCapacitor ? CAPACITOR_ORIGINS : [])];
}
