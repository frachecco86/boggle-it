/**
 * Una "scheda": una griglia pre-generata e pre-risolta, con TUTTE le parole
 * trovabili. I giocatori non giocano griglie generate al volo: pescano una scheda
 * dal catalogo, così ogni partita è deterministica, riproducibile e verificata.
 *
 * Le schede sono generate offline (`pnpm gen:schede`) e versionate in
 * `packages/shared/schede/`. Ogni scheda garantisce:
 *  - parole di varia lunghezza, incluse parole lunghe (≥ 7) quando possibile;
 *  - nei livelli facili, un'alta quota di parole comuni (non astruse): la griglia
 *    è risolta contro il lessico comune, non contro il dizionario intero.
 *
 * Lato admin le schede si possono aggiungere a runtime; il server le persiste su
 * file (vedi `SCHEDE_DIR`) e le serve dallo stesso catalogo.
 */
import type { Difficulty } from './difficulty.js';
import { letterDisplay } from './grid.js';
import type { Grid, GridSize, Tile } from './types.js';

/** Versione del formato degli elementi di `Scheda`: da alzare su cambi incompatibili. */
export const SCHEDA_FORMAT_VERSION = 1;

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
   * TUTTE le parole trovabili, ordinate per lunghezza decrescente.
   * Pre-calcolate: a runtime non si risolve più nulla. I punti si derivano
   * (`lunghezza − 2`), quindi non vengono salvati.
   */
  words: string[];
  /** Lunghezza della parola più lunga. */
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
