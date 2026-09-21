/**
 * Indice delle parole del dizionario: categoria grammaticale + voce Wikizionario.
 *
 * Perché un modulo a parte: la pagina Parole deve mostrare per ogni parola la
 * categoria grammaticale (`sost`, `verb`, `agg`, …) e il link alla definizione.
 * Queste informazioni NON stanno in `words.txt` (che è una lista di forme) ma in
 * `word-index.br`, generato da `pnpm --filter @boggle/dictionary build`.
 *
 * Il file è ~800 KB compressi, ~4,5 MB decompressi: lo carichiamo una volta sola
 * all'avvio e lo teniamo come mappa in memoria. Il costo (~4 MB di RSS) è
 * accettabile per un servizio che tiene già in memoria 360 schede e il dizionario.
 *
 * Formato del file (bucket per compattezza, vedi `build-words.mjs`):
 *   `tag\nparola parola …\n` per ogni categoria,
 *   `~w\nparole con voce Wikizionario…`,
 *   `~acc\nnormale<TAB>originale…` per le forme accentate.
 */
import { existsSync, readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

/** Base URL pubblica delle voci di Wikizionario in italiano. */
export const WIKTIONARY_BASE = 'https://it.wiktionary.org/wiki/';

export interface WordIndex {
  /** parola → categoria grammaticale (`sost`, `verb`, …). */
  pos: Map<string, string>;
  /** parole che hanno una voce di Wikizionario (link disponibile). */
  hasEntry: Set<string>;
  /** parola → forma accentata da usare nel link (`citta` → `città`). */
  display: Map<string, string>;
}

/**
 * Carica l'indice da `word-index.br`.
 *
 * Se il file manca (build offline, dizionario non rigenerato) ritorna un indice
 * VUOTO invece di lanciare: la pagina Parole funziona comunque, semplicemente
 * senza tag né link. La ricerca e i filtri sulle schede non dipendono da qui.
 */
export function loadWordIndex(file: string): WordIndex {
  const empty: WordIndex = { pos: new Map(), hasEntry: new Set(), display: new Map() };
  if (!existsSync(file)) return empty;

  const lines = brotliDecompressSync(readFileSync(file)).toString('utf8').split('\n');
  const pos = new Map<string, string>();
  const hasEntry = new Set<string>();
  const display = new Map<string, string>();

  let i = 0;
  while (i < lines.length) {
    const section = lines[i++];
    if (!section) continue;
    if (section.startsWith('~')) {
      // Sezioni speciali: alcune contengono una riga sola, `~acc` ne ha molte.
      if (section === '~acc') {
        while (i < lines.length && lines[i] && !lines[i]!.startsWith('~')) {
          const [norm, shown] = lines[i++]!.split('\t');
          if (norm && shown) display.set(norm, shown);
        }
      } else {
        // `~w`: elenco delle parole con voce di Wikizionario.
        const words = lines[i++] ?? '';
        for (const w of words.split(' ')) if (w) hasEntry.add(w);
      }
      continue;
    }
    // Bucket di categoria: la riga successiva elenca le parole.
    const words = lines[i++] ?? '';
    for (const w of words.split(' ')) if (w) pos.set(w, section);
  }

  return { pos, hasEntry, display };
}
