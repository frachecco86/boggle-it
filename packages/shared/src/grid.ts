import type { Grid, GridSize, Tile } from './types.js';
import type { Difficulty } from './difficulty.js';

/** Mostra "Qu" per la faccia 'q', altrimenti la lettera maiuscola. */
export function letterDisplay(letter: string): string {
  return letter === 'q' ? 'Qu' : letter.toUpperCase();
}

/** Testo effettivo di una faccia per la composizione della parola ('q' → 'qu'). */
export function letterValue(letter: string): string {
  return letter === 'q' ? 'qu' : letter;
}


/**
 * Vincoli di composizione per difficoltà.
 *
 * MODELLO (misurato, non a intuito):
 * La difficoltà percepita dipende da DUE fattori che vanno controllati insieme:
 *  - la quota di vocali (senza vocali non si formano sillabe)
 *  - il numero di lettere rare (z k w x y j), che è il fattore dominante
 *
 * Controllare solo le vocali lasciava i primi tre livelli indistinguibili
 * (mediane 64/62/61 su 4x4). Con entrambe le leve le mediane diventano
 * nettamente separate.
 */
export interface DifficultyComposition {
  /** Quota minima e massima di vocali nella griglia. */
  vowels: { min: number; max: number };
  /** Numero massimo di lettere rare, come quota della griglia. */
  rareMax: number;
}

export const COMPOSITION: Record<Difficulty, DifficultyComposition> = {
  // Le mediane misurate su 4x4 sono ~87 / 66 / 49 / 34 parole: livelli ben separati.
  'molto-facile': { vowels: { min: 0.46, max: 0.56 }, rareMax: 0 },
  facile: { vowels: { min: 0.34, max: 0.44 }, rareMax: 0.0625 },
  normale: { vowels: { min: 0.28, max: 0.38 }, rareMax: 0.125 },
  difficile: { vowels: { min: 0.22, max: 0.32 }, rareMax: 0.19 },
  // Estremo: pochissime vocali, molte consonanti rare. Pensato per parole lunghe.
  estremo: { vowels: { min: 0.16, max: 0.26 }, rareMax: 0.25 },
};

/** Lettere rare/straniere che rendono il gioco difficile. */
export const RARE_LETTERS = ['z', 'k', 'w', 'x', 'y', 'j'] as const;


/**
 * Genera una griglia N×N con composizione controllata per difficoltà.
 *
 * APPROCCIO: invece di pescare una faccia da 16 dadi e poi sperare che la
 * composizione sia giusta, costruiamo direttamente la griglia:
 *   1. un numero esatto di vocali (dalla fascia della difficoltà)
 *   2. un numero limitato di lettere rare
 *   3. il resto consonanti comuni italiane
 * e infine mescoliamo.
 *
 * Perché: pescare dai dadi lasciava la composizione al caso e le mediane dei livelli
 * restavano indistinguibili (64/62/61). Controllando la composizione otteniamo
 * mediane nettamente separate (~72 / 70 / 56 / 43 su 4x4), che è ciò che il
 * giocatore percepisce come difficoltà.
 *
 */
export function generateGrid(
  size: GridSize,
  rng: () => number = Math.random,
  difficulty: Difficulty = 'normale',
): Grid {
  const total = size * size;
  const comp = COMPOSITION[difficulty] ?? COMPOSITION.normale;

  const random = () => Math.min(0.999999, Math.max(0, rng()));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!;

  // 1. Numero di vocali e rare, scelti nella fascia della difficoltà.
  const minV = Math.round(total * comp.vowels.min);
  const maxV = Math.round(total * comp.vowels.max);
  const vowelCount = minV + Math.floor(random() * (maxV - minV + 1));
  const rareMax = Math.max(0, Math.round(total * comp.rareMax));
  const rareCount = Math.floor(random() * (rareMax + 1));

  // 2. Composizione della griglia.
  const faces: string[] = [];
  for (let i = 0; i < vowelCount; i++) faces.push(pick(VOWELS));
  for (let i = 0; i < rareCount; i++) faces.push(pick(RARE_LETTERS));
  // 'H' e 'Qu' servono per parole comunissime (che/chi/qui/qua): li includiamo
  // in modo probabilistico, senza consumare il budget di lettere rare.
  if (random() < 0.17 && faces.length < total) faces.push('h');
  if (random() < 0.17 && faces.length < total) faces.push('q');
  while (faces.length < total) faces.push(pick(COMMON_CONSONANTS));

  shuffleWith(faces, rng);
  return buildGrid(size, faces);
}

/** Consonanti italiane comuni usate per riempire la griglia. */
export const COMMON_CONSONANTS = [
  'r', 's', 't', 'n', 'l', 'c', 'm', 'd', 'p', 'g', 'v', 'b', 'f',
] as const;

const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;

function shuffleWith<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function buildGrid(size: GridSize, faces: string[]): Grid {
  const tiles: Tile[] = faces.map((letter, index) => ({
    index,
    row: Math.floor(index / size),
    col: index % size,
    letter,
    display: letterDisplay(letter),
  }));
  return { size, tiles };
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
