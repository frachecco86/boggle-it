/**
 * Accesso al dizionario.
 *
 * v0.1: `words.txt` ordinato (una parola per riga).
 *
 * Il carrier supporta due casi:
 *  1. Compressione **trasparente** (`Content-Encoding`): il server Express invia
 *     `words.br` con l'header, oppure Netlify comprime `words.txt` automaticamente.
 *     In entrambi i casi il browser decomprime da solo e `res.text()` e' leggibile.
 *  2. `words.txt.gz` servito **senza** header: lo decomprimiamo con `DecompressionStream('gzip')`.
 *
 * Nota: brotli NON e' decomprimibile dal browser (DecompressionStream accetta solo
 * gzip/deflate/deflate-raw), quindi un `.br` senza header non e' utilizzabile.
 *
 * Client: Set in memoria per lookup O(1). Server: stessa lista come fonte di verita'.
 */
import { normalizeWord } from '@boggle/shared';

export interface Dictionary {
  readonly size: number;
  has(word: string): boolean;
  /** Ritorna la forma normalizzata se valida, altrimenti null. */
  normalizeAndCheck(raw: string): string | null;
}

export function createDictionary(words: Iterable<string>): Dictionary {
  const set = new Set<string>();
  for (const w of words) {
    const n = normalizeWord(w);
    if (n) set.add(n);
  }
  return {
    size: set.size,
    has(word: string) {
      return set.has(normalizeWord(word));
    },
    normalizeAndCheck(raw: string) {
      const n = normalizeWord(raw);
      return set.has(n) ? n : null;
    },
  };
}

/** Parsing del file `words.txt` (una parola per riga). */
export function createDictionaryFromText(text: string): Dictionary {
  return createDictionary(text.split('\n'));
}

/** Rileva testo binario (compresso non ancora decompresso). */
function looksBinary(text: string): boolean {
  return /[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 500));
}

/**
 * Carica il dizionario.
 * Prova `words.txt` (compressione trasparente o testo semplice), poi `words.txt.gz`.
 */
export async function loadDictionary(baseUrl = '/dictionary'): Promise<Dictionary> {
  const errors: string[] = [];

  // 1. words.txt: compressione trasparente (br/gzip) o non compresso.
  const plain = await tryFetchText(`${baseUrl}/words.txt`);
  if (plain.ok) return createDictionaryFromText(plain.text);
  errors.push(plain.error ?? 'words.txt non disponibile');

  // 2. words.txt.gz servito senza header: decomprimiamo noi (gzip e' supportato ovunque).
  const gz = await tryFetchBytes(`${baseUrl}/words.txt.gz`);
  if (gz.ok) {
    const text = await decompressGzip(gz.bytes);
    if (text) return createDictionaryFromText(text);
  }
  if (gz.error) errors.push(gz.error);

  throw new Error(`Impossibile caricare il dizionario: ${errors.join(' | ')}`);
}

interface FetchTextResult {
  ok: boolean;
  text: string;
  error?: string;
}

async function tryFetchText(url: string): Promise<FetchTextResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, text: '', error: `${url}: HTTP ${res.status}` };
    const text = await res.text();
    if (looksBinary(text)) return { ok: false, text: '', error: `${url}: risposta binaria` };
    return { ok: true, text };
  } catch (err) {
    return { ok: false, text: '', error: `${url}: ${String(err)}` };
  }
}

interface FetchBytesResult {
  ok: boolean;
  bytes: ArrayBuffer;
  error?: string;
}

async function tryFetchBytes(url: string): Promise<FetchBytesResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, bytes: new ArrayBuffer(0), error: `${url}: HTTP ${res.status}` };
    return { ok: true, bytes: await res.arrayBuffer() };
  } catch (err) {
    return { ok: false, bytes: new ArrayBuffer(0), error: `${url}: ${String(err)}` };
  }
}

/**
 * Decompressione gzip lato browser (supportata ovunque: browser e Node).
 * Ritorna null se il formato non e' valido o non supportato.
 */
async function decompressGzip(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    // non era gzip, oppure formato non supportato
    return null;
  }
}
