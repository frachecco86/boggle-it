# Algoritmo `full` (full criteria)

<!-- Parte di docs/algoritmi — vedi README.md per l’indice -->

Criteri completi della pagina *Criteri generazione schede*. Lessico, griglia, solver e
formato: [comune.md](./comune.md). Codice: `packages/shared/src/schedaGen.ts` (`FULL_SPEC`),
`grid.ts` (`FULL_COMPOSITION`, `gridStructureIssues`). Rigenerazione:
`pnpm gen:schede -- --variant full --n 5 --replace`.

---

## L'algoritmo `full` (`full criteria`)

Criteri completi della pagina *Criteri generazione schede*. Aggiunge composizione
dedicata, struttura giocabile, ancore multiple e lunghezza media.

### C.1 Composizione

- Modello full (`FULL_COMPOSITION`): rapporto vocali/consonanti per livello e
  **frequenza delle lettere controllata dal pool di consonanti**.
- Valori per la griglia full:

| Difficoltà | quota vocali | rare IT max (z) | non IT max | pool consonanti | `rareMin` | `hqChance` |
| --- | --- | --- | --- | --- | --- | --- |
| facile | 40–45% | 0% | 0% | `r s t n l c m d` (alta frequenza) | — | 0.17 |
| normale | 30–35% | 5% | 0% | `COMMON_CONSONANTS` (b, v, f, g, p) | — | 0.17 |
| difficile | 16–29% | 12% | 0% | `COMMON_CONSONANTS` | **1** (una z) | 0.30 |

- Note di taratura:
  - il pool facile deriva dalla pagina ("A E I O R S T C") ma aggiunge `N L M D`,
    altrimenti non si formano abbastanza parole italiane;
  - il difficile usa il caso "sbilanciato" (<30% vocali), quello che rende la
    griglia difficile;
  - `rareMax` del difficile **ridotto da 0.22 a 0.12**: al 22% uscivano griglie con
    8 rare su 36 (un quinto bloccato). Il criterio chiede *presenza*, non griglie
    di sole rare;
  - `rareMin: 1` garantisce almeno una **z** (lettera rara italiana): senza, una
    griglia "difficile" poteva uscire con lettere tutte comuni e risultare facile.
- `foreignMax: 0` su tutte le difficoltà: le lettere non italiane (`k w x y j`)
  non entrano mai in griglia.

### C.2 Generazione griglia

- `generateGrid(size, rng, difficulty, FULL_COMPOSITION[difficulty])`.
- Passi:
  - `vowelCount` = intero casuale tra `round(N²·0.40)` e `round(N²·0.45)` (facile)
    / `0.30–0.35` (normale) / `0.16–0.29` (difficile);
  - `rareCount` = `max(rareMin, intero in [0, max(rareMax, rareMin)])`, solo `z`.
    Attenzione al caso `rareMax=0` con `rareMin=1`: vince il minimo;
  - `foreignCount` = 0 (`foreignMax: 0`);
  - aggiunge `h` con probabilità `hqChance`, poi `q` con probabilità `hqChance`
    (senza consumare il budget rare);
  - riempie il resto dal **pool di consonanti** della difficoltà;
  - mescola con Fisher-Yates e costruisce le tile.
- **Controllo di struttura** (`gridStructureIssues`, vedi C.6): eseguito **prima**
  del solve, scarta subito le zone morte.

### C.3 Densità

- Criterio: numero di parole **accettate** (`allWords`) dentro la banda
  dimensione × difficoltà (`FULL_SPEC.density`), misurata sul **dizionario
  intero**.
- I criteri della pagina danno **un solo limite** ("numero minimo di parole" per
  il facile, "< N parole" per il difficile). Con un limite solo la banda è larga
  quanto la distribuzione naturale (2–3×). Il **lato mancante è misurato**
  (`measure:schede --variant full`): tetto ≈ p75 per il facile, minimo ≈ mediana
  per il difficile.
- Bande `FULL_SPEC.density`:

| Dimensione | facile | normale | difficile |
| --- | --- | --- | --- |
| 4×4 | 121–170 (`>120` + tetto) | 60–100 | 25–44 (`<45` + minimo) |
| 5×5 | 201–300 | 100–160 | 38–79 |
| 6×6 | 351–560 | 180–280 | 75–129 |

- La banda sul **punteggio** non serve: misurato `r(parole, punti) = 0,99` (98%
  della varianza dei punti spiegata dal numero di parole) e i punti per parola
  variano solo ±10–15%. Stringere il numero di parole stringe i punti.

### C.4 Parole ancora

- Più parole lunghe, non una sola (`FULL_SPEC.anchors`):

| Dimensione | facile | normale | difficile |
| --- | --- | --- | --- |
| 4×4 | 6+ ×2 | 5+ ×1 | 5+ ×1 |
| 5×5 | 7+ ×2 | 6+ ×3 | 6+ ×1 |
| 6×6 | 8+ ×2 | 7+ ×4 | 8+ ×1 |

- Traducono i requisiti di lunghezza della pagina ("multiple parole da 7+", "3–5
  parole da 6–7 lettere", "parole di 8+ lettere", ecc.).

### C.5 Lunghezza media

- Criterio della pagina: 3–5 lettere per il facile, 7+ per il difficile.
- Su griglie reali la direzione è **invertita** (facile 4,4 · normale 4,1 ·
  difficile 3,8 su 4×4): con vocali e consonanti comuni si formano parole lunghe,
  mentre gli incontri consonantici del difficile producono molte parole corte. Su
  una 4×4 una media di 7 è **impossibile** (le parole corte dominano).
- Realizzato con **bande misurate** che mantengono l'ordine reale (`FULL_SPEC.meanLength`):

| Dimensione | facile | normale | difficile |
| --- | --- | --- | --- |
| 4×4 | 4.15–4.70 | 3.85–4.30 | 3.55–4.05 |
| 5×5 | 4.55–5.10 | 4.15–4.70 | 3.70–4.25 |
| 6×6 | 4.85–5.35 | 4.30–4.85 | 3.90–4.50 |

- Così il criterio dice che una scheda facile deve avere parole *mediamente
  lunghe* (segno di griglia ricca), non solo tante parole.

### C.6 Struttura giocabile

- Controllo `gridStructureIssues`, eseguito **prima** del solve (costa poco).
- Misura che l'ha motivata: su 15 schede full difficili, 13 avevano almeno una
  riga/colonna senza vocali, 5 un `h` senza `c`/`g` accanto, fino a 8 rare su 36.
  Le schede con più zone morte avevano 15–28 parole contro 42–46 di quelle ben
  distribuite.
- Tre regole, tarate sulle misure:
  1. nessuna consonante con la vocale più vicina **oltre 2 celle** (Chebyshev) —
     passano il 69–100% delle griglie. La versione "entro 1 cella" scartava il 98%
     delle difficili (4 vocali su 16);
  2. al massimo **una** riga o colonna senza vocali — passa il 4–69%. Con meno del
     30% di vocali non si possono coprire tutte le righe *e* tutte le colonne;
  3. nessuna `h` senza `c`/`g` vicini — passa l'83–90%. In italiano non esistono
     parole di 3+ lettere con la sola `h`.

### C.7 Cosa NON è implementato

- **Morfologia e desinenze** (cluster di suffissi, radici comuni): servirebbe
  un'analisi morfologica. In parte lo fa la fascia di frequenza: il top 5k ha
  desinenze regolari, il 60k no.
- **Geometria dei percorsi** (lineare / a L / a serpentina): servirebbe il
  tracciato di ogni parola trovata, non solo la parola.
- La **lunghezza media** della pagina è realizzata con le bande misurate di C.5.

### C.8 Procedura di generazione

- Tentativi fino a `maxAttempts` (default **400**). Per ogni tentativo:
  1. genera la griglia con `FULL_COMPOSITION[difficulty]`;
  2. calcola i difetti di **struttura** (`gridStructureIssues`);
  3. risolve su `full` → `allWords` (limite **50 000**, lunghezza minima 3);
  4. calcola `anchorCount` e `meanLength`;
  5. registra come **ripiego** la griglia più vicina al centro banda (distanza
     normalizzata su parole + ancore mancanti + lunghezza media sotto soglia +
     **0,5 per ogni difetto di struttura**);
  6. accetta se **struttura pulita** **e** densità in banda **e**
     `anchorCount ≥ count` **e** `meanLength ∈ banda`;
  7. altrimenti continua.
- Se nessuna passa: restituisce il **ripiego**; solo se non esiste alcun
  candidato restituisce `null`.
- A griglia accettata: risolve sulla fascia → `words` (limite **3 000**), poi
  compone la `Scheda` con `longest = allWords[0].length`.

### C.9 Sorgente di riferimento (rigenera full)

Autosufficiente per i soli criteri **full** (il solver è `declare`).

```ts
// ===== TIPI MINIMI =====
export type GridSize = 4 | 5 | 6;
export type Difficulty = 'facile' | 'normale' | 'difficile';
export type SchedaVariant = 'standard' | 'full';

export interface Tile { index: number; row: number; col: number; letter: string; display: string }
export interface Grid { size: GridSize; tiles: Tile[] }
export interface TrieNode { children: Map<string, TrieNode>; word?: string }

// ===== LESSICO (fasce di frequenza) =====
export const BAND_SIZES: Record<Difficulty, number> = {
  facile: 5_000,
  normale: 20_000,
  difficile: 60_000,
};

// ===== COMPOSIZIONE FULL =====
export interface DifficultyComposition {
  vowels: { min: number; max: number };
  rareMax: number;
  rareMin?: number;
  consonants?: readonly string[];
  hqChance?: number;
}

export const COMMON_CONSONANTS = [
  'r', 's', 't', 'n', 'l', 'c', 'm', 'd', 'p', 'g', 'v', 'b', 'f',
] as const;
const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;
export const RARE_ITALIAN = ['z'] as const;
export const FOREIGN_LETTERS = ['k', 'w', 'x', 'y', 'j'] as const;

export const FULL_COMPOSITION: Record<Difficulty, DifficultyComposition> = {
  facile: {
    vowels: { min: 0.4, max: 0.45 },
    rareMax: 0,
    foreignMax: 0,
    consonants: ['r', 's', 't', 'n', 'l', 'c', 'm', 'd'],
    hqChance: 0.17,
  },
  normale: {
    vowels: { min: 0.3, max: 0.35 },
    rareMax: 0.05,
    foreignMax: 0,
    consonants: COMMON_CONSONANTS,
    hqChance: 0.17,
  },
  difficile: {
    vowels: { min: 0.16, max: 0.29 },
    rareMax: 0.12,
    foreignMax: 0,
    rareMin: 1,
    consonants: COMMON_CONSONANTS,
    hqChance: 0.3,
  },
};

// ===== GRIGLIA =====
export function letterDisplay(l: string): string { return l === 'q' ? 'Qu' : l.toUpperCase(); }
export function letterValue(l: string): string { return l === 'q' ? 'qu' : l; }

export function buildGrid(size: GridSize, faces: string[]): Grid {
  const tiles: Tile[] = faces.map((letter, index) => ({
    index, letter, row: Math.floor(index / size), col: index % size,
    display: letterDisplay(letter),
  }));
  return { size, tiles };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function generateGrid(
  size: GridSize,
  rng: () => number = Math.random,
  difficulty: Difficulty = 'normale',
  comp: DifficultyComposition = FULL_COMPOSITION[difficulty],
): Grid {
  const total = size * size;
  const random = () => Math.min(0.999999, Math.max(0, rng()));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!;

  const minV = Math.round(total * comp.vowels.min);
  const maxV = Math.round(total * comp.vowels.max);
  const vowelCount = minV + Math.floor(random() * (maxV - minV + 1));
  const rareMax = Math.max(0, Math.round(total * comp.rareMax));
  const rareMin = Math.max(0, Math.min(rareMax, comp.rareMin ?? 0));
  const rareCount = Math.max(rareMin, Math.floor(random() * (Math.max(rareMax, rareMin) + 1)));
  const foreignMax = Math.max(0, Math.round(total * (comp.foreignMax ?? 0)));
  const foreignCount = foreignMax > 0 ? Math.floor(random() * (foreignMax + 1)) : 0;

  const pool = comp.consonants ?? COMMON_CONSONANTS;
  const hq = comp.hqChance ?? 0.17;
  const faces: string[] = [];
  for (let i = 0; i < vowelCount; i++) faces.push(pick(VOWELS));
  for (let i = 0; i < rareCount; i++) faces.push(pick(RARE_ITALIAN));
  for (let i = 0; i < foreignCount; i++) faces.push(pick(FOREIGN_LETTERS));
  if (random() < hq && faces.length < total) faces.push('h');
  if (random() < hq && faces.length < total) faces.push('q');
  while (faces.length < total) faces.push(pick(pool));

  shuffle(faces, rng);
  return buildGrid(size, faces);
}

// ===== STRUTTURA GIOCABILE (zone morte) =====
export function gridStructureIssues(grid: Grid): string[] {
  const size = grid.size;
  const letters = grid.tiles.map((t) => t.letter);
  const at = (r: number, c: number): string | null =>
    r < 0 || c < 0 || r >= size || c >= size ? null : (letters[r * size + c] ?? null);
  const isVowel = (ch: string | null) => !!ch && (VOWELS as readonly string[]).includes(ch);
  const MAX_DISTANCE = 2;
  const MAX_DEAD_LINES = 1;
  const issues: string[] = [];

  let farFromVowel = 0, deadRows = 0;
  for (let r = 0; r < size; r++) {
    let rowVowels = 0;
    for (let c = 0; c < size; c++) {
      const ch = at(r, c);
      if (!ch) continue;
      if (isVowel(ch)) { rowVowels++; continue; }
      let near = false;
      for (let dr = -MAX_DISTANCE; dr <= MAX_DISTANCE && !near; dr++)
        for (let dc = -MAX_DISTANCE; dc <= MAX_DISTANCE; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (isVowel(at(r + dr, c + dc))) { near = true; break; }
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
  if (deadRows + deadCols > MAX_DEAD_LINES) issues.push(`${deadRows} righe e ${deadCols} colonne senza vocali`);

  let deadH = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (at(r, c) !== 'h') continue;
    let ok = false;
    for (let dr = -1; dr <= 1 && !ok; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const near = at(r + dr, c + dc);
        if (near === 'c' || near === 'g') { ok = true; break; }
      }
    if (!ok) deadH++;
  }
  if (deadH > 0) issues.push(`${deadH} h senza c/g vicini`);

  // Lettere NON italiane: dovrebbero essere 0 (foreignMax 0). Difesa in profondità.
  let foreign = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const ch = at(r, c);
      if (ch && (FOREIGN_LETTERS as readonly string[]).includes(ch)) foreign++;
    }
  if (foreign > 0) issues.push(`${foreign} lettere non italiane in griglia`);

  return issues;
}

// ===== SPEC FULL =====
export interface SchedaSpec {
  composition: Record<Difficulty, DifficultyComposition>;
  density: Record<GridSize, Record<Difficulty, { min: number; max: number }>>;
  anchors: Record<GridSize, Record<Difficulty, { length: number; count: number }>>;
  requirePlayableStructure?: boolean;
  meanLength?: Record<GridSize, Record<Difficulty, { min: number; max: number }>>;
}

export const FULL_SPEC: SchedaSpec = {
  composition: FULL_COMPOSITION,
  density: {
    4: { facile: { min: 121, max: 170 }, normale: { min: 60, max: 100 }, difficile: { min: 25, max: 44 } },
    5: { facile: { min: 201, max: 300 }, normale: { min: 100, max: 160 }, difficile: { min: 38, max: 79 } },
    6: { facile: { min: 351, max: 560 }, normale: { min: 180, max: 280 }, difficile: { min: 75, max: 129 } },
  },
  anchors: {
    4: { facile: { length: 6, count: 2 }, normale: { length: 5, count: 1 }, difficile: { length: 5, count: 1 } },
    5: { facile: { length: 7, count: 2 }, normale: { length: 6, count: 3 }, difficile: { length: 6, count: 1 } },
    6: { facile: { length: 8, count: 2 }, normale: { length: 7, count: 4 }, difficile: { length: 8, count: 1 } },
  },
  requirePlayableStructure: true,
  meanLength: {
    4: { facile: { min: 4.15, max: 4.7 }, normale: { min: 3.85, max: 4.3 }, difficile: { min: 3.55, max: 4.05 } },
    5: { facile: { min: 4.55, max: 5.1 }, normale: { min: 4.15, max: 4.7 }, difficile: { min: 3.7, max: 4.25 } },
    6: { facile: { min: 4.85, max: 5.35 }, normale: { min: 4.3, max: 4.85 }, difficile: { min: 3.9, max: 4.5 } },
  },
};

// ===== GENERAZIONE SCHEDA FULL =====
export interface SchedaTries { full: TrieNode; bands: Record<Difficulty, TrieNode> }
export interface Scheda {
  id: string; size: GridSize; difficulty: Difficulty; variant: SchedaVariant;
  grid: string; words: string[]; allWords: string[]; longest: number;
}

declare function solveGrid(
  grid: Grid, trie: TrieNode, options: { limit?: number; minLength?: number },
): string[];

const FULL_SOLVE_LIMIT = 50_000;
const BAND_SOLVE_LIMIT = 3_000;

export function generateFullScheda(options: {
  size: GridSize; difficulty: Difficulty; tries: SchedaTries;
  rng?: () => number; maxAttempts?: number; id?: string;
}): Scheda | null {
  const { size, difficulty, tries } = options;
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 400;
  const bandTrie = tries.bands[difficulty];
  const spec = FULL_SPEC;
  const band = spec.density[size][difficulty];
  const anchor = spec.anchors[size][difficulty];
  const meanBand = spec.meanLength![size][difficulty];

  let best: { grid: Grid; allWords: string[]; distance: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = generateGrid(size, rng, difficulty, spec.composition[difficulty]);
    const structure = gridStructureIssues(grid); // prima del solve
    const allWords = solveGrid(grid, tries.full, { limit: FULL_SOLVE_LIMIT, minLength: 3 });

    let anchorCount = 0, totalLength = 0;
    for (const w of allWords) {
      if (w.length >= anchor.length) anchorCount++;
      totalLength += w.length;
    }
    const meanLength = allWords.length > 0 ? totalLength / allWords.length : 0;

    const mid = (band.min + band.max) / 2;
    const distance =
      Math.abs(allWords.length - mid) / Math.max(1, mid) +
      Math.max(0, anchor.count - anchorCount) / Math.max(1, anchor.count) +
      Math.max(0, meanBand.min - meanLength) / meanBand.min +
      structure.length * 0.5;
    if (!best || distance < best.distance) best = { grid, allWords, distance };

    if (structure.length > 0) continue;                                     // struttura
    if (allWords.length < band.min || allWords.length > band.max) continue; // densità
    if (anchorCount < anchor.count) continue;                               // ancore
    if (meanLength < meanBand.min || meanLength > meanBand.max) continue;   // lunghezza media

    return toFull(options, size, difficulty, grid, allWords, bandTrie);
  }
  if (best) return toFull(options, size, difficulty, best.grid, best.allWords, bandTrie);
  return null;
}

function toFull(
  options: { id?: string }, size: GridSize, difficulty: Difficulty,
  grid: Grid, allWords: string[], bandTrie: TrieNode,
): Scheda {
  const words = solveGrid(grid, bandTrie, { limit: BAND_SOLVE_LIMIT, minLength: 3 });
  return {
    id: options.id ?? '', size, difficulty, variant: 'full',
    grid: gridToRows(grid), words, allWords, longest: allWords[0]?.length ?? 0,
  };
}

function gridToRows(grid: Grid): string {
  const rows: string[] = [];
  for (let r = 0; r < grid.size; r++) {
    rows.push(grid.tiles.filter((t) => t.row === r).sort((a, b) => a.col - b.col)
      .map((t) => t.letter).join(''));
  }
  return rows.join('\n');
}
```

---
