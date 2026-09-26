/**
 * Generazione di schede: griglia + soluzione verificata e filtrata.
 *
 * Perché offline (o da admin) e non a runtime per ogni partita:
 *  - le schede si possono filtrare per qualità (numero di parole, parola lunga),
 *    cosa impossibile senza risolvere la griglia;
 *  - risolvere la griglia durante una partita multiplayer è spreco (e la soluzione
 *    non sarebbe uguale per tutti);
 *  - la stessa scheda può essere rigiocata e confrontata.
 *
 * ============================================================================
 * COME FUNZIONA
 * ============================================================================
 *
 *   1. TRE TRIE PER FASCIA DI FREQUENZA (non tre liste curate a mano):
 *      facile = prime  5.000 parole italiane più frequenti
 *      normale = prime 20.000
 *      difficile = prime 60.000
 *      Da qui vengono le parole ATTESE (`words`): su queste si misura la densità
 *      della scheda e sono quelle mostrate nel riepilogo. Niente rank per parola
 *      e niente "% di parole comuni" da calcolare dopo.
 *
 *   2. COMPOSIZIONE CONTROLLATA PER DIFFICOLTÀ (vedi `grid.ts`): quota di vocali
 *      e tetto alle lettere rare. Le griglie facili hanno vocali e consonanti
 *      comuni, quelle difficili più consonanti rare.
 *
 *      PERCHÉ NON SI CAMPIONANO LE LETTERE DALLA FASCIA (come nella prima
 *      versione dell'algoritmo): misurato, le statistiche di lettera
 *      dell'italiano NON cambiano con la frequenza — vocali 45,6% nel top 5k e
 *      45,0% nel 20k–60k, lettere rare 1,14% contro 1,24%. Campionando dalla
 *      fascia, le tre difficoltà producevano la STESSA griglia. La composizione
 *      resta quindi controllata (ed è la leva che si sente giocando).
 *
 *   3. SOLVE sul DIZIONARIO INTERO → `allWords`: sono le parole che il giocatore
 *      può trovare, e su queste si misura la densità della scheda (vedi il punto
 *      della misura più sotto). Un secondo solve sul trie della fascia → `words`:
 *      le parole ATTESE (le più frequenti componibili), quelle mostrate nel
 *      riepilogo "parole che esistevano". `words` è un sottoinsieme di `allWords`.
 *
 *   4. FILTRO DI QUALITÀ, due sole condizioni, entrambe su `allWords`:
 *      - densità: numero di parole dentro la banda `[min, max]` della coppia
 *        dimensione × difficoltà;
 *      - almeno UNA parola lunga (vicina al massimo della griglia): evita griglie
 *        fatte solo di parole corte.
 *
 *      PERCHÉ LA DENSITÀ SI MISURA SUL DIZIONARIO INTERO e non sul trie della
 *      fascia (come nella prima versione): misurato, contando le parole della
 *      fascia il numero si INVERTE fra i livelli — un trie da 60k parole trova
 *      più parole di uno da 5k, quindi "facile" risultava più povero di
 *      "difficile" (mediane su 4×4: 17 / 20 / 16). Contando le parole che il
 *      giocatore può davvero trovare la scala è quella giusta: 79 / 45 / 24 su
 *      4×4, 175 / 125 / 67 su 5×5, 314 / 207 / 131 su 6×6.
 *
 *   5. RETRY: fino a `maxAttempts` griglie; se nessuna passa si tiene quella più
 *      vicina al centro della banda (ripiego, segnalato da `verify:schede`).
 *
 * I numeri delle bande (`DENSITY`, `MIN_LONGEST`) sono MISURATI: vedi
 * `pnpm --filter @boggle/server measure:schede`.
 */
import type { Difficulty } from './difficulty.js';
import { generateGrid } from './grid.js';
import { gridToRows, type Scheda } from './scheda.js';
import { solveGrid, type TrieNode } from './solver.js';
import type { GridSize } from './types.js';

/** Trie per fascia di difficoltà. */
export interface SchedaTries {
  /** Dizionario intero (tutte le parole giocabili): serve per `allWords`. */
  full: TrieNode;
  /** Un trie per difficoltà, costruito sulle parole più frequenti della fascia. */
  bands: Record<Difficulty, TrieNode>;
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
 * Quante parole (le più frequenti) entrano nel trie di ogni fascia.
 *
 * Sono la MANOPOLA della difficoltà: fasce più strette = meno parole comuni in
 * griglia. I valori sono quelli dell'algoritmo (5k / 20k / 60k).
 */
export const BAND_SIZES: Record<Difficulty, number> = {
  facile: 5_000,
  normale: 20_000,
  difficile: 60_000,
};

/** Nome della fascia usata da ogni difficoltà (per test e diagnostica). */
export function bandNameFor(difficulty: Difficulty): keyof SchedaTries['bands'] {
  return difficulty;
}

/**
 * Banda di DENSITÀ per dimensione × difficoltà: quante parole (del dizionario
 * intero) devono essere trovabili sulla griglia.
 *
 * `min` / `max` sono MISURATI (`measure-schede.ts`, 300 griglie per
 * configurazione) e vanno in ordine: più parole sui livelli facili, meno su
 * quelli difficili.
 */
const DENSITY: Record<GridSize, Record<Difficulty, { min: number; max: number }>> = {
  4: {
    facile: { min: 46, max: 200 },
    normale: { min: 25, max: 120 },
    difficile: { min: 10, max: 60 },
  },
  5: {
    facile: { min: 95, max: 450 },
    normale: { min: 60, max: 250 },
    difficile: { min: 25, max: 140 },
  },
  6: {
    facile: { min: 200, max: 900 },
    normale: { min: 110, max: 480 },
    difficile: { min: 50, max: 300 },
  },
};

/**
 * Lunghezza minima della parola più lunga della scheda: "una parola vicina al
 * massimo della griglia". Su una 4×4 il massimo realistico è ~7, quindi si chiede
 * almeno una parola da 6; su 5×5 da 7; su 6×6 da 8.
 */
const MIN_LONGEST: Record<GridSize, number> = { 4: 6, 5: 7, 6: 8 };

/*
 * Tolleranza sul numero di parole quando si verifica una scheda già generata: il
 * generatore usa `[min, max]` tassativi, il verificatore un margine più largo per
 * non segnalare differenze introdotte da un dizionario leggermente diverso.
 */
const DENSITY_TOLERANCE = 0.15;

/**
 * Tetto sulle parole enumerate per griglia.
 *
 * Per la FASCIA è una rete di sicurezza (le fasce arrivano a poche centinaia di
 * parole); per il dizionario INTERO deve essere alto, altrimenti l'elenco
 * accettato verrebbe troncato e qualche parola valida verrebbe rifiutata in
 * partita. `verify:schede` controlla che il tetto non sia mai stato raggiunto.
 */
const BAND_SOLVE_LIMIT = 3_000;
const FULL_SOLVE_LIMIT = 50_000;

/** Criteri esposti agli strumenti di verifica (una sola fonte di verità). */
export const SCHEDA_CRITERIA = {
  density: DENSITY,
  minLongest: MIN_LONGEST,
  bandSizes: BAND_SIZES,
  densityTolerance: DENSITY_TOLERANCE,
  bandSolveLimit: BAND_SOLVE_LIMIT,
  fullSolveLimit: FULL_SOLVE_LIMIT,
} as const;

/** Banda di densità (numero di parole) per dimensione e difficoltà. */
export function densityBandFor(size: GridSize, difficulty: Difficulty) {
  return DENSITY[size][difficulty];
}

/** Lunghezza minima della parola più lunga, per dimensione. */
export function minLongestFor(size: GridSize): number {
  return MIN_LONGEST[size];
}

/* ------------------------------------------------------------------ */
/* Generazione                                                         */
/* ------------------------------------------------------------------ */

/**
 * Genera una scheda di qualità, o `null` se nessun tentativo la soddisfa.
 *
 * Criteri (entrambi verificati a ogni tentativo):
 *  1. DENSITÀ — numero di parole della fascia dentro `[min, max]`.
 *  2. PAROLA LUNGA — la più lunga trovata raggiunge `MIN_LONGEST[size]`.
 *
 * Il risultato porta `words` (fascia) e `allWords` (dizionario intero), entrambi
 * ordinati per lunghezza decrescente.
 */
export function generateScheda(options: GenerateSchedaOptions): Scheda | null {
  const { size, difficulty, tries } = options;
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 400;
  const bandTrie = tries.bands[difficulty];

  const band = DENSITY[size][difficulty];
  const minLongest = MIN_LONGEST[size];

  /*
   * Candidato di ripiego: la griglia più vicina alla banda vista finora.
   *
   * Perché serve: se dopo `maxAttempts` nessuna griglia soddisfa i criteri,
   * `null` farebbe riprovare il pool all'infinito senza produrre schede. Il
   * ripiego è comunque una griglia valida e risolta, solo fuori banda.
   *
   * ATTENZIONE: il ripiego va EVITATO per quanto possibile — se scatta spesso, il
   * catalogo contiene schede che non rispettano la difficoltà dichiarata. Lo
   * script `verify:schede` le segnala. Se succede, allargare la banda in `DENSITY`.
   */
  let best: { grid: ReturnType<typeof generateGrid>; allWords: string[]; distance: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Griglia con la composizione della difficoltà (vocali e rare controllate).
    const grid = generateGrid(size, rng, difficulty);
    /*
     * Le parole che il giocatore PUÒ trovare: si risolve sul dizionario intero.
     * È anche l'insieme che il gioco accetta in partita (`allWords`), quindi
     * questo solve serve sia al filtro sia al risultato: nessuno spreco.
     */
    const allWords = solveGrid(grid, tries.full, { limit: FULL_SOLVE_LIMIT, minLength: 3 });

    let longest = 0;
    for (const w of allWords) if (w.length > longest) longest = w.length;

    /*
     * Distanza dal centro della banda, normalizzata: usata solo per scegliere il
     * ripiego. Il termine sulla lunghezza evita di preferire una griglia dentro
     * banda ma senza nessuna parola lunga.
     */
    const mid = (band.min + band.max) / 2;
    const distance =
      Math.abs(allWords.length - mid) / Math.max(1, mid) +
      Math.max(0, minLongest - longest) / minLongest;
    if (!best || distance < best.distance) best = { grid, allWords, distance };

    // 1. Densità: quante parole si possono trovare, nella banda della difficoltà.
    if (allWords.length < band.min || allWords.length > band.max) continue;
    // 2. Almeno una parola "vicina al massimo" della griglia.
    if (longest < minLongest) continue;

    return toScheda(options, size, difficulty, grid, allWords, bandTrie);
  }

  if (best) return toScheda(options, size, difficulty, best.grid, best.allWords, bandTrie);
  return null;
}

/**
 * Compone la `Scheda` finale.
 *
 * `allWords` (dizionario intero) è già calcolato: è l'insieme accettato in
 * partita. Qui si aggiungono le parole ATTESE della fascia, cioè le più
 * frequenti componibili sulla griglia: si risolvono una volta sola, sulla
 * griglia accettata, perché servono solo al riepilogo.
 */
function toScheda(
  options: GenerateSchedaOptions,
  size: GridSize,
  difficulty: Difficulty,
  grid: ReturnType<typeof generateGrid>,
  allWords: string[],
  bandTrie: TrieNode,
): Scheda {
  const words = solveGrid(grid, bandTrie, { limit: BAND_SOLVE_LIMIT, minLength: 3 });
  return {
    id: options.id ?? '',
    size,
    difficulty,
    grid: gridToRows(grid),
    words,
    allWords,
    longest: allWords[0]?.length ?? 0,
  };
}
