/**
 * Generazione di schede: griglia + soluzione completa, verificata e filtrata.
 *
 * Perché offline (o da admin) e non a runtime per ogni partita:
 *  - le schede si possono filtrare per qualità (parole lunghe, parole comuni nei
 *    livelli facili), cosa impossibile senza risolvere la griglia;
 *  - risolvere la griglia durante una partita multiplayer è spreco (e la soluzione
 *    non sarebbe uguale per tutti);
 *  - la stessa scheda può essere rigiocata e confrontata.
 *
 * Il filtro chiave: nei livelli `molto-facile` e `facile` la griglia viene risolta
 * contro il LESSICO COMUNE, non contro il dizionario intero. Così tutte le parole
 * trovabili sono comuni (niente forme astruse tipo `sbrecciare` o `contumace`).
 * Nei livelli `normale` e `difficile` si usa il dizionario completo, accettando
 * solo griglie che contengono almeno una parola lunga.
 */
import type { Difficulty } from './difficulty.js';
import { generateGrid } from './grid.js';
import { gridToRows, type Scheda } from './scheda.js';
import { solveGrid, type TrieNode } from './solver.js';
import type { GridSize } from './types.js';

/** Trie del dizionario completo e del lessico comune. */
export interface SchedaTries {
  /** Dizionario completo (386k forme). */
  full: TrieNode;
  /** Lessico comune (~60k parole non astruse). */
  common: TrieNode;
}

export interface GenerateSchedaOptions {
  size: GridSize;
  difficulty: Difficulty;
  tries: SchedaTries;
  rng?: () => number;
  /** Tentativi massimi prima di rinunciare (default 400). */
  maxAttempts?: number;
  /** Id assegnato alla scheda (se assente, la generazione non lo popola). */
  id?: string;
}

/**
 * Requisiti minimi di qualità per dimensione e difficoltà.
 * Derivati dalle misure: le griglie comuni raggiungono 7/8/9 lettere nel 35-45%
 * dei casi, quindi il filtro non è proibitivo.
 */
const QUALITY: Record<Difficulty, { minWords: Record<GridSize, number>; minLongest: Record<GridSize, number>; minLongWords: Record<GridSize, number> }> = {
  'molto-facile': {
    minWords: { 4: 6, 5: 15, 6: 25 },
    minLongest: { 4: 7, 5: 8, 6: 9 },
    minLongWords: { 4: 1, 5: 2, 6: 3 },
  },
  facile: {
    minWords: { 4: 6, 5: 15, 6: 25 },
    minLongest: { 4: 7, 5: 8, 6: 9 },
    minLongWords: { 4: 1, 5: 2, 6: 3 },
  },
  normale: {
    minWords: { 4: 12, 5: 25, 6: 40 },
    minLongest: { 4: 7, 5: 8, 6: 9 },
    minLongWords: { 4: 1, 5: 3, 6: 5 },
  },
  difficile: {
    minWords: { 4: 12, 5: 25, 6: 40 },
    minLongest: { 4: 7, 5: 8, 6: 9 },
    minLongWords: { 4: 1, 5: 3, 6: 5 },
  },
};

/** Lunghezza oltre la quale una parola conta come "lunga". */
const LONG_WORD = 7;

/** I livelli facili usano il lessico comune; gli altri il dizionario completo. */
export function solvingTrieFor(difficulty: Difficulty): 'common' | 'full' {
  return difficulty === 'molto-facile' || difficulty === 'facile' ? 'common' : 'full';
}

/**
 * Genera una scheda di qualità, o `null` se nessun tentativo la soddisfa.
 *
 * Il risultato contiene TUTTE le parole trovabili (contro il trie del livello),
 * ordinate per lunghezza decrescente.
 */
export function generateScheda(options: GenerateSchedaOptions): Scheda | null {
  const { size, difficulty, tries } = options;
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 400;
  const trie = solvingTrieFor(difficulty) === 'common' ? tries.common : tries.full;
  const quality = QUALITY[difficulty];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = generateGrid(size, rng, difficulty);
    const words = solveGrid(grid, trie, { limit: 4000, minLength: 3 });
    const longest = words.reduce((m, w) => Math.max(m, w.length), 0);
    const longWords = words.filter((w) => w.length >= LONG_WORD).length;

    if (words.length < quality.minWords[size]) continue;
    if (longest < quality.minLongest[size]) continue;
    if (longWords < quality.minLongWords[size]) continue;

    const entries = [...words].sort(
      (a, b) => b.length - a.length || a.localeCompare(b),
    );

    return {
      id: options.id ?? '',
      size,
      difficulty,
      grid: gridToRows(grid),
      words: entries,
      longest,
    };
  }

  return null;
}
