/**
 * Estrazione audio da un link (YouTube e affini) via `yt-dlp` + `ffmpeg`.
 *
 * PERCHÉ uno strumento a parte e non una dipendenza npm: `yt-dlp` è aggiornato
 * continuamente contro i cambi di YouTube, mentre i wrapper npm inseguono con
 * ritardo. Il binario si aggiorna da sé con `yt-dlp -U`, quindi il tool resta
 * funzionante senza toccare l'app.
 *
 * Se i binari NON ci sono (sviluppo locale, immagine senza il pacchetto) le
 * funzioni ritornano un errore ESPLICITO con le istruzioni, non un fallimento
 * oscuro: l'upload manuale dell'MP3 resta sempre disponibile.
 *
 * Sicurezza: l'URL viene validato (solo http/https, niente file locali o pipe) e
 * passato come ARGOMENTO (mai via shell), quindi non è possibile iniettare
 * comandi. Il download finisce in una cartella temporanea e viene cancellato
 * dopo la lettura.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { MUSIC_MAX_BYTES } from './musicLibrary.js';

const execFileAsync = promisify(execFile);

/** Timeout del download: 3 minuti bastano per una traccia di sottofondo. */
const DOWNLOAD_TIMEOUT_MS = 180_000;

export interface ExtractedAudio {
  /** Titolo della traccia (dai metatags del sito). */
  title: string;
  /** Autore/canale, se disponibile. */
  author: string;
  /** Durata in secondi, se disponibile. */
  durationSec?: number;
  /** Miniatura (URL), utile per l'anteprima in admin. */
  thumbnail?: string;
  /** Nome del sito (es. "YouTube"). */
  extractor: string;
  /** MP3 scaricato. */
  data: Buffer;
  mime: string;
}

export class MediaToolError extends Error {
  constructor(
    message: string,
    /** `missing-binary` = il tool non è installato; gli altri sono errori d'uso. */
    readonly code: 'missing-binary' | 'invalid-url' | 'unsupported' | 'too-large' | 'failed',
  ) {
    super(message);
  }
}

/** Nome del binario, sovrascrivibile per test o installazioni particolari. */
const YTDLP = process.env.YTDLP_BIN ?? 'yt-dlp';
const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';

/** true se `yt-dlp` è raggiungibile. */
export async function hasYtDlp(): Promise<boolean> {
  try {
    await execFileAsync(YTDLP, ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida un URL: solo http(s) assoluti. Blocca `file:`, `pipe:` e simili, che
 * `yt-dlp` accetterebbe e che leggerebbero file locali del server.
 */
export function validateMediaUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MediaToolError('URL non valido', 'invalid-url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MediaToolError('Sono ammessi solo link http(s)', 'invalid-url');
  }
  return url;
}

/**
 * Legge i metatags di un link SENZA scaricare l'audio (veloce).
 * Usato per precompilare titolo e autore nel pannello admin.
 */
export async function probeMedia(
  raw: string,
): Promise<{ title: string; author: string; durationSec?: number; thumbnail?: string; extractor: string }> {
  const url = validateMediaUrl(raw);
  if (!(await hasYtDlp())) {
    throw new MediaToolError(
      'yt-dlp non è installato sul server. Installalo (vedi Dockerfile) oppure carica il file MP3 a mano.',
      'missing-binary',
    );
  }
  try {
    const { stdout } = await execFileAsync(
      YTDLP,
      ['--no-playlist', '--dump-single-json', '--no-warnings', url.toString()],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const info = JSON.parse(stdout) as {
      title?: string;
      uploader?: string;
      channel?: string;
      duration?: number;
      thumbnail?: string;
      extractor_key?: string;
    };
    return {
      title: info.title?.trim() || 'Traccia da link',
      author: (info.uploader ?? info.channel ?? '').trim(),
      durationSec: typeof info.duration === 'number' ? info.duration : undefined,
      thumbnail: info.thumbnail,
      extractor: info.extractor_key ?? 'sconosciuto',
    };
  } catch (err) {
    if (err instanceof MediaToolError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new MediaToolError(`Lettura del link fallita: ${message.slice(0, 300)}`, 'failed');
  }
}

/**
 * Scarica una traccia e la converte in MP3.
 *
 * Passi: `yt-dlp` scarica la sorgente migliore, `ffmpeg` (invocato da yt-dlp)
 * esporta in MP3. Il file risultante viene letto in memoria, quindi la cartella
 * temporanea è rimossa SEMPRE (anche in caso di errore).
 */
export async function extractAudio(
  raw: string,
  options: { maxBytes?: number } = {},
): Promise<ExtractedAudio> {
  const maxBytes = options.maxBytes ?? MUSIC_MAX_BYTES;
  const url = validateMediaUrl(raw);
  if (!(await hasYtDlp())) {
    throw new MediaToolError(
      'yt-dlp non è installato sul server. Installalo (vedi Dockerfile) oppure carica il file MP3 a mano.',
      'missing-binary',
    );
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'sbooble-url-'));
  try {
    const outputTemplate = path.join(tmp, 'audio.%(ext)s');
    let stdout: string;
    try {
      const res = await execFileAsync(
        YTDLP,
        [
          '--no-playlist',
          '--no-warnings',
          '--extract-audio',
          '--audio-format',
          'mp3',
          '--audio-quality',
          '5',
          '--ffmpeg-location',
          FFMPEG,
          // Limite di dimensione: interrompe un download troppo grande prima di
          // riempire il disco (l'MP3 finale viene comunque ricontrollato sotto).
          '--max-filesize',
          `${Math.ceil(maxBytes / 1024 / 1024)}M`,
          '--print',
          'after_move:filepath',
          '-o',
          outputTemplate,
          url.toString(),
        ],
        { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      );
      stdout = res.stdout;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MediaToolError(`Download fallito: ${message.slice(0, 300)}`, 'failed');
    }

    // Il file finale è quello con estensione mp3 (o il percorso stampato).
    const printed = stdout.trim().split('\n').pop()?.trim();
    const files = await readdir(tmp);
    const mp3 = files.find((f) => f.endsWith('.mp3')) ?? files[0];
    if (!mp3) {
      throw new MediaToolError('Nessun file audio prodotto', 'failed');
    }
    const finalPath = printed && existsSync(printed) ? printed : path.join(tmp, mp3);
    const data = await readFile(finalPath);
    if (data.length === 0) throw new MediaToolError('File audio vuoto', 'failed');
    if (data.length > maxBytes) {
      throw new MediaToolError(
        `Traccia troppo grande (${(data.length / 1024 / 1024).toFixed(1)} MB, max ${Math.round(maxBytes / 1024 / 1024)} MB)`,
        'too-large',
      );
    }

    // Metatags già estratti dal file finale: `--print` non li dà qui, quindi una
    // seconda passata veloce sul link (solo metadati, senza riscaricare).
    const meta = await probeMedia(raw).catch(
      (): { title: string; author: string; durationSec?: number; thumbnail?: string; extractor: string } => ({
        title: 'Traccia da link',
        author: '',
        extractor: 'sconosciuto',
      }),
    );

    return {
      title: meta.title,
      author: meta.author,
      durationSec: meta.durationSec,
      thumbnail: meta.thumbnail,
      extractor: meta.extractor,
      data,
      mime: 'audio/mpeg',
    };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
