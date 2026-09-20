/**
 * Accesso al dizionario.
 *
 * v0.1: `words.txt` ordinato (una parola per riga) servito dal server, anche come
 * `words.br`. Il server invia `Content-Encoding: br`, quindi il browser decomprime
 * in modo trasparente e qui serve solo parsare il testo.
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

/**
 * Carica il dizionario via fetch.
 * Prova, in ordine: words.txt (che il server puo' servire con content-encoding br/gzip),
 * poi words.br e words.txt.gz come fallback espliciti.
 */
export async function loadDictionary(baseUrl = '/dictionary'): Promise<Dictionary> {
  const urls = [`${baseUrl}/words.txt`, `${baseUrl}/words.br`, `${baseUrl}/words.txt.gz`];
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      // Se il file era compresso senza header, il testo conterra' byte di controllo.
      if (looksBinary(text)) continue;
      return createDictionaryFromText(text);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Impossibile caricare il dizionario: ${String(lastErr ?? 'nessuna fonte')}`);
}

function looksBinary(text: string): boolean {
  return /[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 500));
}
