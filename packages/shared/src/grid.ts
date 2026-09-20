import type { Grid, GridSize, Tile } from './types.js';
import { DICE_4, DICE_5, DICE_6 } from './dice.js';

const DICE_BY_SIZE: Record<GridSize, readonly string[]> = {
  4: DICE_4,
  5: DICE_5,
  6: DICE_6,
};

/** Mostra "Qu" per la faccia 'q', altrimenti la lettera maiuscola. */
export function letterDisplay(letter: string): string {
  return letter === 'q' ? 'Qu' : letter.toUpperCase();
}

/** Testo effettivo di una faccia per la composizione della parola ('q' → 'qu'). */
export function letterValue(letter: string): string {
  return letter === 'q' ? 'qu' : letter;
}


/**
 * Genera una griglia N×N estraendo una faccia casuale da ogni dado.
 * Ogni dado è usato una sola volta.
 */
export function generateGrid(size: GridSize, rng: () => number = Math.random): Grid {
  const dice = DICE_BY_SIZE[size];
  if (dice.length !== size * size) {
    throw new Error(`Set di dadi incoerente per griglia ${size}x${size}: ${dice.length} dadi`);
  }
  const shuffled = [...dice];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const tiles: Tile[] = shuffled.map((die, index) => {
    const letter = die[randomIntWith(rng, die.length)]!;
    const row = Math.floor(index / size);
    const col = index % size;
    return { index, row, col, letter, display: letterDisplay(letter) };
  });
  return { size, tiles };
}

function randomIntWith(rng: () => number, max: number): number {
  return Math.min(max - 1, Math.floor(rng() * max));
}

/** True se due celle sono adiacenti (8 direzioni). */
export function areAdjacent(a: Tile, b: Tile): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
}

/**
 * Verifica che un percorso sia legale:
 * - indici validi e tutti presenti in griglia
 * - nessuna cella ripetuta
 * - ogni coppia consecutiva è adiacente
 */
export function isValidPath(grid: Grid, path: number[]): boolean {
  if (path.length === 0) return false;
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const idx = path[i]!;
    if (!Number.isInteger(idx) || idx < 0 || idx >= grid.tiles.length) return false;
    if (seen.has(idx)) return false;
    seen.add(idx);
    if (i > 0) {
      const prev = grid.tiles[path[i - 1]!]!;
      const cur = grid.tiles[idx]!;
      if (!areAdjacent(prev, cur)) return false;
    }
  }
  return true;
}

/** Costruisce la stringa della parola a partire da un percorso. */
export function wordFromPath(grid: Grid, path: number[]): string {
  return path.map((idx) => letterValue(grid.tiles[idx]!.letter)).join('');
}

/**
 * Verifica che la parola dichiarata corrisponda al percorso.
 * Difesa contro client manomessi.
 */
export function pathMatchesWord(grid: Grid, path: number[], word: string): boolean {
  return wordFromPath(grid, path).toLowerCase() === word.toLowerCase();
}

export { DICE_4, DICE_5, DICE_6 };
