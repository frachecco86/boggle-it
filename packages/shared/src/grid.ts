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
  /**
   * Numero MINIMO di lettere rare da mettere in griglia (misura "full criteria").
   * Serve ai livelli difficili, dove la presenza di lettere trappola (Q, Z) è
   * parte della difficoltà e non può essere lasciata al caso.
   */
  rareMin?: number;
  /**
   * Consonanti ammesse (misura "full criteria": la frequenza delle lettere cambia
   * con il livello). Se assente si usa `COMMON_CONSONANTS`.
   */
  consonants?: readonly string[];
  /** Probabilità di includere una `h` e una `q` (per che/chi, qui/qua). */
  hqChance?: number;
}

export const COMPOSITION: Record<Difficulty, DifficultyComposition> = {
  /*
   * La composizione è un MEZZO, non l'obiettivo: la difficoltà vera è il numero
   * di parole trovabili (imposto dal generatore, vedi `schedaGen.ts`). Questi
   * valori danno al generatore un bacino di griglie con lettere plausibili.
   *
   * Misure sul dizionario (150 griglie per livello, dopo Fase 1): la sola
   * composizione produce mediane 59/55/50 parole su 4x4 — troppo vicine per
   * distinguere i livelli. È il FILTRO sulla densità di parole a separarli.
   */
  facile: { vowels: { min: 0.40, max: 0.52 }, rareMax: 0.03 },
  normale: { vowels: { min: 0.27, max: 0.38 }, rareMax: 0.12 },
  // Poche vocali e molte consonanti rare: meno parole, più lunghe da comporre.
  difficile: { vowels: { min: 0.16, max: 0.27 }, rareMax: 0.22 },
};

/** Consonanti italiane comuni usate per riempire la griglia. */
export const COMMON_CONSONANTS = [
  'r', 's', 't', 'n', 'l', 'c', 'm', 'd', 'p', 'g', 'v', 'b', 'f',
] as const;

const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;

/** Lettere rare/straniere che rendono il gioco difficile. */
export const RARE_LETTERS = ['z', 'k', 'w', 'x', 'y', 'j'] as const;

/**
 * Composizione per le schede "full criteria" (`Criteri generazione schede`).
 *
 * Differenze rispetto a `COMPOSITION`:
 *  - la quota di vocali segue le fasce della pagina: 40–45% (facile), 30–35%
 *    (medio), sotto il 30% (difficile);
 *  - la frequenza delle lettere è controllata dal POOL di consonanti: solo
 *    consonanti ad alta frequenza nel facile, consonanti medie nel medio,
 *    lettere rare/difficili (Q, Z) nel difficile — dove almeno una lettera
 *    rara è OBBLIGATORIA (`rareMin`).
 *
 * Misura non implementata: morfologia/desinenze e geometria dei percorsi (la
 * pagina le elenca fra i criteri). Richiederebbero un'analisi morfologica delle
 * parole e il tracciato di ogni parola trovata: nel generatore non ci sono.
 */
export const FULL_COMPOSITION: Record<Difficulty, DifficultyComposition> = {
  facile: {
    vowels: { min: 0.4, max: 0.45 },
    rareMax: 0,
    // Consonanti ad alta frequenza (la pagina indica A E I O R S T C: oltre a
    // queste servono N, L, M, D per poter formare parole italiane).
    consonants: ['r', 's', 't', 'n', 'l', 'c', 'm', 'd'],
    hqChance: 0.17,
  },
  normale: {
    vowels: { min: 0.3, max: 0.35 },
    rareMax: 0.05,
    // Pool standard: entrano le consonanti medie (b, v, f, g, p).
    consonants: COMMON_CONSONANTS,
    hqChance: 0.17,
  },
  difficile: {
    // "< 30% o > 55% (sbilanciato)": si usa il caso consonantico, che è quello
    // che rende la griglia difficile.
    vowels: { min: 0.16, max: 0.29 },
    rareMax: 0.22,
    // Almeno una lettera rara: senza, una griglia "difficile" può uscire con
    // lettere tutte comuni e risultare facile.
    rareMin: 1,
    consonants: COMMON_CONSONANTS,
    hqChance: 0.3,
  },
};


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
  /**
   * Composizione da usare. Di default quella del modello standard; le schede
   * "full criteria" passano `FULL_COMPOSITION[difficulty]`.
   */
  composition: DifficultyComposition = COMPOSITION[difficulty] ?? COMPOSITION.normale,
): Grid {
  const total = size * size;
  const comp = composition;

  const random = () => Math.min(0.999999, Math.max(0, rng()));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!;

  // 1. Numero di vocali e rare, scelti nella fascia della difficoltà.
  const minV = Math.round(total * comp.vowels.min);
  const maxV = Math.round(total * comp.vowels.max);
  const vowelCount = minV + Math.floor(random() * (maxV - minV + 1));
  const rareMax = Math.max(0, Math.round(total * comp.rareMax));
  const rareMin = Math.max(0, Math.min(rareMax, comp.rareMin ?? 0));
  // Il minimo può superare il massimo quando la quota è piccola (rareMax 0 con
  // rareMin 1): in quel caso vince il minimo, è una richiesta esplicita.
  const rareCount = Math.max(
    rareMin,
    Math.floor(random() * (Math.max(rareMax, rareMin) + 1)),
  );

  // 2. Composizione della griglia.
  const consonantPool = comp.consonants ?? COMMON_CONSONANTS;
  const hqChance = comp.hqChance ?? 0.17;
  const faces: string[] = [];
  for (let i = 0; i < vowelCount; i++) faces.push(pick(VOWELS));
  for (let i = 0; i < rareCount; i++) faces.push(pick(RARE_LETTERS));
  // 'H' e 'Qu' servono per parole comunissime (che/chi/qui/qua): li includiamo
  // in modo probabilistico, senza consumare il budget di lettere rare.
  if (random() < hqChance && faces.length < total) faces.push('h');
  if (random() < hqChance && faces.length < total) faces.push('q');
  while (faces.length < total) faces.push(pick(consonantPool));

  shuffleWith(faces, rng);
  return buildGrid(size, faces);
}

function shuffleWith<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Costruisce la griglia a partire dall'elenco delle facce (una per cella,
 * gia' mescolate). Esportata perché il generatore di schede compone la griglia
 * con la distribuzione di lettere della fascia, non con le fasce di `COMPOSITION`.
 */
export function buildGrid(size: GridSize, faces: string[]): Grid {
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
