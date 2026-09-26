/**
 * Una "scheda": una griglia pre-generata e pre-risolta, con le parole trovabili.
 * I giocatori non giocano griglie generate al volo: pescano una scheda dal
 * catalogo, così ogni partita è deterministica, riproducibile e verificata.
 *
 * Le schede sono generate offline (`pnpm gen:schede`) e versionate in
 * `packages/shared/schede/`. Ogni scheda porta DUE elenchi di parole:
 *  - `words`: le parole della FASCIA della difficoltà (5k / 20k / 60k parole più
 *    frequenti). Sono le parole "attese": su queste si misura la densità della
 *    scheda, e sono quelle mostrate nel riepilogo ("parole che esistevano").
 *  - `allWords`: TUTTE le parole componibili sulla griglia secondo il dizionario
 *    intero. È l'insieme che il gioco ACCETTA: se trovi una parola rara fuori
 *    fascia vale lo stesso (vedi `schedaGen.ts`).
 *
 * Lato admin le schede si possono aggiungere a runtime; il server le persiste su
 * file (vedi `SCHEDE_DIR`) e le serve dallo stesso catalogo. Le schede scritte
 * con il formato 1 (senza `allWords`) restano leggibili: valgono le sole `words`.
 */
import type { Difficulty } from './difficulty.js';
import { letterDisplay } from './grid.js';
import type { Grid, GridSize, Tile } from './types.js';

/** Versione del formato degli elementi di `Scheda`: da alzare su cambi incompatibili. */
export const SCHEDA_FORMAT_VERSION = 3;

/**
 * Insieme di criteri con cui una scheda è stata generata.
 *
 *  - `standard`: il modello storico;
 *  - `full`: i "full criteria" (rapporto vocali/consonanti per livello,
 *    frequenza delle lettere, numero di parole e parole ancora della pagina
 *    *Criteri generazione schede*).
 */
export type SchedaVariant = 'standard' | 'full';

/** Ordine con cui le varianti si mostrano nel selettore. */
export const SCHEDA_VARIANTS: readonly SchedaVariant[] = ['standard', 'full'];

/** Etichette per l'interfaccia. */
export const SCHEDA_VARIANT_LABELS: Record<SchedaVariant, string> = {
  standard: 'Standard',
  full: 'Full criteria',
};

/** Una riga di spiegazione per il selettore. */
export const SCHEDA_VARIANT_HINTS: Record<SchedaVariant, string> = {
  standard: 'Il catalogo storico.',
  full: 'Criteri completi: vocali/consonanti, frequenza delle lettere, numero di parole e parole ancora.',
};

export function isSchedaVariant(value: unknown): value is SchedaVariant {
  return value === 'standard' || value === 'full';
}

/** Variante valida a partire da un valore arbitrario (default `standard`). */
export function resolveSchedaVariant(value: unknown): SchedaVariant {
  return isSchedaVariant(value) ? value : 'standard';
}

/**
 * Variante di una scheda. Le schede senza `variant` (formato ≤ 2, schede create
 * a mano dall'admin) valgono `standard`.
 */
export function schedaVariantOf(scheda: Pick<Scheda, 'variant'>): SchedaVariant {
  return resolveSchedaVariant(scheda.variant);
}

/**
 * Parole accettate sulla griglia: `allWords` dal formato 2, altrimenti le sole
 * parole della fascia (schede vecchie o create a mano).
 */
export function acceptedWords(scheda: Pick<Scheda, 'words' | 'allWords'>): string[] {
  return Array.isArray(scheda.allWords) && scheda.allWords.length > 0 ? scheda.allWords : scheda.words;
}

export interface Scheda {
  /** Identificatore stabile e leggibile, es. `4-normale-017`. */
  id: string;
  size: GridSize;
  difficulty: Difficulty;
  /**
   * Griglia come stringa riga per riga, `\n` fra le righe (dalla riga 0).
   * Un carattere per cella, `q` = faccia "Qu"; lettere minuscole.
   */
  grid: string;
  /**
   * Insieme di criteri di generazione. Assente nelle schede di formato ≤ 2 e in
   * quelle create a mano: valgono `standard` (vedi `schedaVariantOf`).
   */
  variant?: SchedaVariant;
  /**
   * Parole della FASCIA della difficoltà trovabili sulla griglia, ordinate per
   * lunghezza decrescente. Pre-calcolate: a runtime non si risolve più nulla.
   * I punti si derivano (`lunghezza − 2`), quindi non vengono salvati.
   */
  words: string[];
  /**
   * Tutte le parole componibili sulla griglia secondo il dizionario intero,
   * ordinate per lunghezza decrescente. È l'insieme ACCETTATO in partita:
   * `words` ne è un sottoinsieme.
   *
   * Assente nelle schede di formato 1 (allora valgono le sole `words`).
   */
  allWords?: string[];
  /** Lunghezza della parola più lunga DELLA FASCIA. */
  longest: number;
}

/** Contenuto di un file `schede-<size>-<difficulty>.json`. */
export interface SchedaFile {
  version: number;
  generatedAt: string;
  size: GridSize;
  difficulty: Difficulty;
  schede: Scheda[];
}

/** Nome del file per una coppia dimensione/difficoltà. */
export function schedaFileName(size: GridSize, difficulty: Difficulty): string {
  return `schede-${size}-${difficulty}.json`;
}

/** Chiave `size-difficulty` usata come identificatore di partizione. */
export function schedaKey(size: GridSize, difficulty: Difficulty): string {
  return `${size}-${difficulty}`;
}

/** Serializza una griglia come matrice di lettere (righe unite da `\n`). */
export function gridToRows(grid: Grid): string {
  const rows: string[] = [];
  for (let r = 0; r < grid.size; r++) {
    rows.push(
      grid.tiles
        .filter((t) => t.row === r)
        .sort((a, b) => a.col - b.col)
        .map((t) => t.letter)
        .join(''),
    );
  }
  return rows.join('\n');
}

/** Ricostruisce la griglia completa (con `display`) dalla stringa riga-per-riga. */
export function rowsToGrid(rows: string): Grid {
  const lines = rows.split('\n').filter(Boolean);
  const size = lines.length as GridSize;
  const tiles: Tile[] = [];
  for (let r = 0; r < size; r++) {
    const line = lines[r]!;
    for (let c = 0; c < line.length; c++) {
      const letter = line[c]!;
      tiles.push({
        row: r,
        col: c,
        index: r * size + c,
        letter,
        display: letterDisplay(letter),
      });
    }
  }
  return { size, tiles };
}
