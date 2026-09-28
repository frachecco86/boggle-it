/**
 * Aggiornamento automatico di `yt-dlp` all'avvio del server.
 *
 * PERCHÉ ESISTE QUESTO FILE
 * -------------------------
 * Il Dockerfile installa `yt-dlp` scaricando `releases/latest` al momento della
 * BUILD dell'immagine. Ma un deploy che resta in esecuzione per settimane o mesi
 * conserva quella versione per sempre: il binario non si aggiorna da solo, non
 *ostante il commento lo desse per scontato.
 *
 * `yt-dlp` pubblica correzioni ogni poche settimane perché YouTube cambia in
 * continuazione: quando il binario è vecchio l'estrazione comincia a fallire con
 * errori di formato, ed è esattamente il sintomo di "l'aggiunta di musica da
 * YouTube non funziona" a distanza dall'ultimo deploy.
 *
 * COSA FA
 * -------
 * Esegue `yt-dlp -U` in background. Non blocca l'avvio e non è mai fatale: se
 * l'aggiornamento fallisce (rete assente, filesystem in sola lettura) il server
 * parte comunque con la versione installata, che quasi sempre funziona ancora.
 *
 * PERCHÉ `-U` E NON UN RISCARICAMENTO MANUALE: `-U` è il meccanismo supportato
 * dal progetto, sa se è un binario standalone o un pacchetto Python, e non
 * richiede di sapere dove è installato `yt-dlp`.
 *
 * Come si disattiva: `YTDLP_AUTO_UPDATE=0`. Serve nei test e dove il filesystem
 * dell'immagine è read-only (l'aggiornamento fallirebbe a ogni avvio).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Stesso nome/override usato da `mediaTool.ts`. */
const YTDLP = process.env.YTDLP_BIN ?? 'yt-dlp';

/** L'aggiornamento è lento di rete, non di CPU: un minuto è già generoso. */
const UPDATE_TIMEOUT_MS = 60_000;

export type RefreshYtDlpReason = 'updated' | 'already-current' | 'unsupported' | 'failed';

export interface RefreshYtDlpResult {
  /** true solo se il binario è stato effettivamente sostituito. */
  updated: boolean;
  reason: RefreshYtDlpReason;
  /** Versione prima dell'aggiornamento (o `sconosciuta` se non leggibile). */
  from: string;
  /** Versione dopo l'aggiornamento, quando leggibile. */
  to: string;
}

/** Versione installata, o `undefined` se il binario non risponde. */
async function version(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(YTDLP, ['--version'], { timeout: 10_000 });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export interface RefreshOptions {
  /** Iniettabile nei test: esegue il comando e ritorna lo stdout. */
  run?: (args: string[]) => Promise<string>;
  /** Iniettabile nei test: legge la versione corrente. */
  readVersion?: () => Promise<string | undefined>;
}

/**
 * Prova ad aggiornare `yt-dlp`. Non lancia MAI: ritorna sempre un esito.
 *
 * Il contratto "non lancia" è deliberato: chi chiama lo fa all'avvio, e un
 * aggiornamento fallito non deve impedire al server di partire.
 */
export async function refreshYtDlp(options: RefreshOptions = {}): Promise<RefreshYtDlpResult> {
  const readVersion = options.readVersion ?? version;
  const run =
    options.run ??
    (async (args: string[]) => {
      const { stdout } = await execFileAsync(YTDLP, args, {
        timeout: UPDATE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      return stdout;
    });

  // Disattivazione esplicita (test, o filesystem read-only).
  if (process.env.YTDLP_AUTO_UPDATE === '0') {
    return {
      updated: false,
      reason: 'unsupported',
      from: (await readVersion()) ?? 'sconosciuta',
      to: '',
    };
  }

  const from = (await readVersion()) ?? undefined;
  if (!from) {
    // yt-dlp non c'è: non è un errore (l'upload manuale resta disponibile) e
    // non ha senso tentare l'aggiornamento.
    return { updated: false, reason: 'unsupported', from: 'sconosciuta', to: '' };
  }

  try {
    const stdout = await run(['-U']);
    const to = (await readVersion()) ?? from;
    // `yt-dlp -U` esce con codice 0 sia quando aggiorna sia quando è già
    // aggiornato: la differenza si vede solo dal messaggio o dalla versione.
    const updated = to !== from;
    if (updated) return { updated: true, reason: 'updated', from, to };
    const alreadyCurrent = /up.to.date|latest|already/i.test(stdout);
    return {
      updated: false,
      reason: alreadyCurrent ? 'already-current' : 'unsupported',
      from,
      to,
    };
  } catch {
    return { updated: false, reason: 'failed', from, to: from };
  }
}
