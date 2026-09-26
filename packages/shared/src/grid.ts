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
 *  - il numero di lettere rare, che è il fattore dominante.
 *
 * ATTENZIONE, da non confondere (vedi DOCS/SCHEDE-ALGORITMO.md, Appendice):
 *  - `RARE_ITALIAN` = ['z'] è una lettera ITALIANA rara, produttiva (35k voci);
 *  - `FOREIGN_LETTERS` = ['k','w','x','y','j'] sono lettere NON italiane, quasi
 *    solo prestiti/derivati (k 481, x 327, y 287, w 264, j 153 voci): in griglia
 *    sono in gran parte "celle morte". Non entrano MAI nel gioco (`foreignMax`
 *    è 0 in tutte le difficoltà) e `rareMin` si applica solo a `RARE_ITALIAN`.
 *
 * Controllare solo le vocali lasciava i primi tre livelli indistinguibili
 * (mediane 64/62/61 su 4x4). Con entrambe le leve le mediane diventano
 * nettamente separate.
 */
export interface DifficultyComposition {
  /** Quota minima e massima di vocali nella griglia. */
  vowels: { min: number; max: number };
  /** Numero massimo di lettere ITALIANE rare (`RARE_ITALIAN`), quota griglia. */
  rareMax: number;
  /**
   * Numero massimo di lettere NON italiane (`FOREIGN_LETTERS`), quota griglia.
   * Vale 0 in tutte le difficoltà: le parole straniere restano nel dizionario,
   * ma le griglie non le pescano (nessuna cella morta per lettere non italiane).
   */
  foreignMax?: number;
  /**
   * Numero MINIMO di lettere ITALIANE rare da mettere in griglia (misura "full
   * criteria"). Serve ai livelli difficili, dove la presenza di una lettera
   * trappola italiana (Z) è parte della difficoltà e non può essere lasciata al
   * caso. NON riguarda le straniere.
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
   *
   * `foreignMax: 0` su tutte le difficoltà: le lettere non italiane non entrano
   * più nelle griglie (vedi `FOREIGN_LETTERS`). Il tetto storico (fino al 22%,
   * con `k w x y j` incluse) era la causa principale delle "celle morte".
   */
  facile: { vowels: { min: 0.40, max: 0.52 }, rareMax: 0.03, foreignMax: 0 },
  normale: { vowels: { min: 0.27, max: 0.38 }, rareMax: 0.12, foreignMax: 0 },
  // Poche vocali e una quota di Z: meno parole, più lunghe da comporre.
  difficile: { vowels: { min: 0.16, max: 0.27 }, rareMax: 0.12, foreignMax: 0 },
};

/** Consonanti italiane comuni usate per riempire la griglia. */
export const COMMON_CONSONANTS = [
  'r', 's', 't', 'n', 'l', 'c', 'm', 'd', 'p', 'g', 'v', 'b', 'f',
] as const;

const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;

/** Lettere ITALIANE rare, produttive: entrano in griglia fino a `rareMax`. */
export const RARE_ITALIAN = ['z'] as const;

/**
 * Lettere NON italiane (prestiti/derivati): non entrano in griglia, salvo
 * esplicito `foreignMax > 0`. Restano nel dizionario, quindi le parole già
 * formate in altro modo (o con l'eventuale straniera richiesta) restano valide.
 */
export const FOREIGN_LETTERS = ['k', 'w', 'x', 'y', 'j'] as const;

/**
 * Insieme storico, tenuto per compatibilità e per misurare l'insieme delle
 * "lettere difficili". Per la GENERAZIONE usare `RARE_ITALIAN` e `FOREIGN_LETTERS`.
 */
export const RARE_LETTERS = [...RARE_ITALIAN, ...FOREIGN_LETTERS] as const;

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
    foreignMax: 0,
    // Consonanti ad alta frequenza (la pagina indica A E I O R S T C: oltre a
    // queste servono N, L, M, D per poter formare parole italiane).
    consonants: ['r', 's', 't', 'n', 'l', 'c', 'm', 'd'],
    hqChance: 0.17,
  },
  normale: {
    vowels: { min: 0.3, max: 0.35 },
    rareMax: 0.05,
    foreignMax: 0,
    // Pool standard: entrano le consonanti medie (b, v, f, g, p).
    consonants: COMMON_CONSONANTS,
    hqChance: 0.17,
  },
  difficile: {
    // "< 30% o > 55% (sbilanciato)": si usa il caso consonantico, che è quello
    // che rende la griglia difficile.
    vowels: { min: 0.16, max: 0.29 },
    //
    // Tetto alle rare italiane (Z) RIDOTTO (era 0.22): al 22% uscivano griglie
    // con 8 lettere rare su 36, cioè un quinto della griglia bloccato — il
    // criterio chiede "presenza di lettere rare", non una griglia di sole rare.
    rareMax: 0.12,
    foreignMax: 0,
    // Almeno una Z: senza, una griglia "difficile" può uscire con lettere tutte
    // comuni e risultare facile. La rara obbligatoria è ITALIANA, non `j`/`x`.
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

  // 1. Numero di vocali, rare italiane e straniere, nella fascia della difficoltà.
  const minV = Math.round(total * comp.vowels.min);
  const maxV = Math.round(total * comp.vowels.max);
  const vowelCount = minV + Math.floor(random() * (maxV - minV + 1));
  const rareMax = Math.max(0, Math.round(total * comp.rareMax));
  const rareMin = Math.max(0, Math.min(rareMax, comp.rareMin ?? 0));
  // Il minimo può superare il massimo quando la quota è piccola (rareMax 0 con
  // rareMin 1): in quel caso vince il minimo, è una richiesta esplicita.
  // Si applica alle sole lettere ITALIANE rare: le straniere non sono mai
  // obbligatorie e, con `foreignMax: 0`, non entrano affatto.
  const rareCount = Math.max(
    rareMin,
    Math.floor(random() * (Math.max(rareMax, rareMin) + 1)),
  );
  const foreignMax = Math.max(0, Math.round(total * (comp.foreignMax ?? 0)));
  const foreignCount = foreignMax > 0 ? Math.floor(random() * (foreignMax + 1)) : 0;

  // 2. Composizione della griglia.
  const consonantPool = comp.consonants ?? COMMON_CONSONANTS;
  const hqChance = comp.hqChance ?? 0.17;
  const faces: string[] = [];
  for (let i = 0; i < vowelCount; i++) faces.push(pick(VOWELS));
  for (let i = 0; i < rareCount; i++) faces.push(pick(RARE_ITALIAN));
  for (let i = 0; i < foreignCount; i++) faces.push(pick(FOREIGN_LETTERS));
  // 'H' e 'Qu' servono per parole comunissime (che/chi/qui/qua): li includiamo
  // in modo probabilistico, senza consumare il budget di lettere rare.
  if (random() < hqChance && faces.length < total) faces.push('h');
  if (random() < hqChance && faces.length < total) faces.push('q');
  while (faces.length < total) faces.push(pick(consonantPool));

  shuffleWith(faces, rng);
  return buildGrid(size, faces);
}

/**
 * Difetti di STRUTTURA di una griglia: le zone che il giocatore percepisce come
 * "consonanti inutili".
 *
 * Misurato sulle schede "full criteria" difficili (15 schede): 13 avevano almeno
 * una riga o una colonna SENZA vocali, 5 un tassello `h` senza `c`/`g` accanto
 * (un `h` isolato non forma nessuna parola di 3+ lettere: cella morta garantita),
 * e fino a 8 lettere rare su 36. Le schede con più zone morte avevano 15–28 parole
 * contro le 42–46 di quelle ben distribuite, nella stessa categoria.
 *
 * Le tre regole sono TARATE sulle misure (`measure:schede`):
 *  1. nessuna consonante con la vocale più vicina OLTRE 2 celle (Chebyshev):
 *     passano il 69–100% delle griglie. La versione "entro 1 cella" scartava
 *     il 98% delle griglie difficili (con 4 vocali su 16 è quasi impossibile);
 *  2. al massimo UNA riga o colonna senza vocali (passa il 4–69%): con meno del
 *     30% di vocali non si possono coprire tutte le righe E tutte le colonne;
 *  3. nessuna `h` senza `c`/`g` vicini (passa l'83–90%).
 *
 * Ritorna l'elenco dei problemi (vuoto = griglia giocabile).
 */
export function gridStructureIssues(grid: Grid): string[] {
  const size = grid.size;
  const letters = grid.tiles.map((t) => t.letter);
  const at = (r: number, c: number): string | null =>
    r < 0 || c < 0 || r >= size || c >= size ? null : (letters[r * size + c] ?? null);
  const isVowel = (ch: string | null): boolean => !!ch && VOWELS.includes(ch as (typeof VOWELS)[number]);
  /** Lontananza massima ammessa fra una consonante e la vocale più vicina. */
  const MAX_DISTANCE = 2;
  /** Righe/colonne senza vocali ammesse (oltretutto non si può chiedere zero). */
  const MAX_DEAD_LINES = 1;
  const issues: string[] = [];

  let farFromVowel = 0;
  let deadRows = 0;
  for (let r = 0; r < size; r++) {
    let rowVowels = 0;
    for (let c = 0; c < size; c++) {
      const ch = at(r, c);
      if (!ch) continue;
      if (isVowel(ch)) {
        rowVowels++;
        continue;
      }
      let near = false;
      for (let dr = -MAX_DISTANCE; dr <= MAX_DISTANCE && !near; dr++) {
        for (let dc = -MAX_DISTANCE; dc <= MAX_DISTANCE; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (isVowel(at(r + dr, c + dc))) {
            near = true;
            break;
          }
        }
      }
      if (!near) farFromVowel++;
    }
    if (rowVowels === 0) deadRows++;
  }
  let deadCols = 0;
  for (let c = 0; c < size; c++) {
    let colVowels = 0;
    for (let r = 0; r < size; r++) if (isVowel(at(r, c))) colVowels++;
    if (colVowels === 0) deadCols++;
  }
  if (farFromVowel > 0) issues.push(`${farFromVowel} consonanti lontane da ogni vocale`);
  if (deadRows + deadCols > MAX_DEAD_LINES) {
    issues.push(`${deadRows} righe e ${deadCols} colonne senza vocali`);
  }

  // Un `h` serve solo dentro i digrammi ch/gh: senza un c o una g accanto è un
  // tassello inutile (in italiano non esistono parole di 3+ lettere con la sola h).
  let deadH = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (at(r, c) !== 'h') continue;
      let ok = false;
      for (let dr = -1; dr <= 1 && !ok; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const near = at(r + dr, c + dc);
          if (near === 'c' || near === 'g') {
            ok = true;
            break;
          }
        }
      }
      if (!ok) deadH++;
    }
  }
  if (deadH > 0) issues.push(`${deadH} h senza c/g vicini`);

  // Lettere NON italiane: dovrebbero essere 0 (foreignMax 0). Se una entra
  // comunque (configurazione futura, admin, test) deve almeno stare vicino a una
  // vocale, altrimenti è una cella morta sicura. Difesa in profondità.
  let foreign = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ch = at(r, c);
      if (ch && (FOREIGN_LETTERS as readonly string[]).includes(ch)) foreign++;
    }
  }
  if (foreign > 0) issues.push(`${foreign} lettere non italiane in griglia`);

  return issues;
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

/**
 * Trova un PERCORSO legale che compone `word` sulla griglia, o `null`.
 *
 * Serve al suggerimento della modalità apprendimento: per animare una parola
 * sulla board bisogna conoscerne il tracciato, non solo il testo (la stessa
 * parola può essere composta in più modi). DFS con le stesse regole del gioco:
 * 8 direzioni, ogni cella una volta sola. `q` vale `qu`, quindi confronta la
 * LETTERA della parola (che in griglia è una sola faccia), non i suoi caratteri.
 */
export function findWordPath(grid: Grid, word: string): number[] | null {
  const target = word.toLowerCase();
  const size = grid.size;
  const n = size * size;
  const visited = new Array<boolean>(n).fill(false);
  const path: number[] = [];

  const dfs = (index: number, at: number): boolean => {
    const tile = grid.tiles[index]!;
    const value = letterValue(tile.letter);
    // `value` può essere più lungo di 1 (`qu`): si consuma in blocco.
    if (target.slice(at, at + value.length) !== value) return false;
    const next = at + value.length;
    path.push(index);
    if (next === target.length) return true;

    visited[index] = true;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = tile.row + dr;
        const c = tile.col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const ni = r * size + c;
        if (visited[ni]) continue;
        if (dfs(ni, next)) {
          visited[index] = false;
          return true;
        }
      }
    }
    visited[index] = false;
    path.pop();
    return false;
  };

  for (let i = 0; i < n; i++) {
    path.length = 0;
    if (dfs(i, 0)) return [...path];
  }
  return null;
}
