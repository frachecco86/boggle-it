# Algoritmo `standard` (LEGACY)

<!-- Parte di docs/algoritmi — vedi README.md per l’indice -->

Criteri storici. Lessico, griglia, solver e formato: [comune.md](./comune.md).
Codice: `packages/shared/src/schedaGen.ts` (`STANDARD_SPEC`), `grid.ts` (`COMPOSITION`).
Rigenerazione: `pnpm gen:schede` (senza `--variant`).

---

## L'algoritmo `standard` (LEGACY)

Il modello storico. Nato prima dei "full criteria": controlla **densità** e **una
parola lunga**, sopra una composizione che separa i livelli.

### B.1 Composizione

- Modello standard (`COMPOSITION`): tre leve insieme, **quota vocali**, **tetto
  rare italiane** e **tetto lettere non italiane**, perché controllarne una sola
  lascia i livelli indistinguibili (mediane 64/62/61 su 4×4).
- Valori per la griglia standard:

| Difficoltà | quota vocali | rare IT max (z) | non IT max |
| --- | --- | --- | --- |
| facile | 40–52% | 3% | 0 |
| normale | 27–38% | 12% | 0 |
| difficile | 16–27% | 12% | 0 |

- Pool consonanti: `COMMON_CONSONANTS` per tutte le difficoltà = `r s t n l c m
  d p g v b f`.
- Nessun `rareMin` (nessuna lettera rara obbligatoria).
- `foreignMax: 0` su tutte le difficoltà: le lettere **non italiane** (`k w x y j`)
  non entrano mai in griglia.
- `hqChance` = **0.17** per tutte le difficoltà.
- La composizione è un **mezzo**, non l'obiettivo: da sola produce mediane
  59/55/50 parole su 4×4, troppo vicine. È il **filtro sulla densità** a
  separare davvero i livelli.

### B.2 Generazione griglia

- `generateGrid(size, rng, difficulty, COMPOSITION[difficulty])`.
- Passi:
  - `vowelCount` = intero casuale tra `round(N²·0.40)` e `round(N²·0.52)` (facile)
    / `0.27–0.38` (normale) / `0.16–0.27` (difficile);
  - `rareCount` = intero casuale in `[0, round(N²·rareMax)]` (solo `z`);
  - `foreignCount` = 0 (con `foreignMax: 0`);
  - aggiunge `h` con probabilità `0.17`, poi `q` con probabilità `0.17`
    (senza consumare il budget rare);
  - riempie il resto da `COMMON_CONSONANTS`;
  - mescola con Fisher-Yates e costruisce le tile.
- **Nessun** controllo di struttura (vedi B.5).

### B.3 Densità

- Criterio centrale: numero di parole **accettate** (`allWords`) dentro la banda
  dimensione × difficoltà (`DENSITY`).
- La banda è **chiusa e tassativa** `[min, max]` in generazione.
- Misurata sul **dizionario intero**, non sulla fascia: contando la fascia il
  numero si **inverte** tra i livelli (mediane 17/20/16 su 4×4, perché un trie da
  60k trova più parole di uno da 5k). Contando le accettate la scala è giusta:
  79 / 45 / 24 su 4×4, 175 / 125 / 67 su 5×5, 314 / 207 / 131 su 6×6.
- Bande `DENSITY`:

| Dimensione | facile | normale | difficile |
| --- | --- | --- | --- |
| 4×4 | 46–200 | 25–120 | 10–60 |
| 5×5 | 95–450 | 60–250 | 25–140 |
| 6×6 | 200–900 | 110–480 | 50–300 |

### B.4 Parole ancora

- Una sola parola "vicina al massimo della griglia" (`MIN_LONGEST`).
- Requisito: `length` = **6 su 4×4, 7 su 5×5, 8 su 6×6**, `count` = **1**,
  **uguale per tutte le difficoltà**.

### B.5 Cosa NON controlla

- **Nessuna** banda sulla **lunghezza media**.
- **Nessun** controllo di **struttura giocabile** (zone morte ammesse).
- **Nessun** `rareMin` (nessuna rara obbligatoria).
- **Nessun** pool di consonanti differenziato: sempre `COMMON_CONSONANTS`.
- Non implementati (come in full): morfologia/desinenze, geometria dei percorsi.

### B.6 Procedura di generazione

- Tentativi fino a `maxAttempts` (default **400**). Per ogni tentativo:
  1. genera la griglia con `COMPOSITION[difficulty]`;
  2. risolve su `full` → `allWords` (limite **50 000**, lunghezza minima 3);
  3. calcola `anchorCount` (parole ≥ lunghezza ancora) e `meanLength` (non usata);
  4. registra come **ripiego** la griglia più vicina al centro banda (distanza
     normalizzata su parole + ancore mancanti);
  5. accetta se `allWords.length ∈ [min, max]` **e** `anchorCount ≥ 1`;
  6. altrimenti continua.
- Se nessuna passa: restituisce il **ripiego** (griglia valida ma fuori banda);
  solo se non esiste alcun candidato restituisce `null`.
- A griglia accettata: risolve sulla fascia → `words` (limite **3 000**), poi
  compone la `Scheda` con `longest = allWords[0].length`.
- Il ripiego va **evitato**: se scatta spesso, il catalogo contiene schede fuori
  difficoltà. Lo segnala `verify:schede` → in tal caso allargare la banda.

### B.7 Sorgente di riferimento (rigenera standard)

Autosufficiente per i soli criteri **standard** (il solver è `declare`).

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

// ===== COMPOSIZIONE STANDARD =====
export interface DifficultyComposition {
  vowels: { min: number; max: number };
  rareMax: number;
  foreignMax?: number;
  rareMin?: number;
  consonants?: readonly string[];
  hqChance?: number;
}

export const COMPOSITION: Record<Difficulty, DifficultyComposition> = {
  facile:    { vowels: { min: 0.40, max: 0.52 }, rareMax: 0.03, foreignMax: 0 },
  normale:   { vowels: { min: 0.27, max: 0.38 }, rareMax: 0.12, foreignMax: 0 },
  difficile: { vowels: { min: 0.16, max: 0.27 }, rareMax: 0.12, foreignMax: 0 },
};

export const COMMON_CONSONANTS = [
  'r', 's', 't', 'n', 'l', 'c', 'm', 'd', 'p', 'g', 'v', 'b', 'f',
] as const;
const VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;
// Lettere ITALIANE rare (produttive) e NON italiane (prestiti: mai in griglia).
export const RARE_ITALIAN = ['z'] as const;
export const FOREIGN_LETTERS = ['k', 'w', 'x', 'y', 'j'] as const;

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
  comp: DifficultyComposition = COMPOSITION[difficulty],
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

// ===== SPEC STANDARD =====
export interface SchedaSpec {
  composition: Record<Difficulty, DifficultyComposition>;
  density: Record<GridSize, Record<Difficulty, { min: number; max: number }>>;
  anchors: Record<GridSize, Record<Difficulty, { length: number; count: number }>>;
  requirePlayableStructure?: boolean;
  meanLength?: Record<GridSize, Record<Difficulty, { min: number; max: number }>>;
}

const DENSITY: Record<GridSize, Record<Difficulty, { min: number; max: number }>> = {
  4: { facile: { min: 46, max: 200 }, normale: { min: 25, max: 120 }, difficile: { min: 10, max: 60 } },
  5: { facile: { min: 95, max: 450 }, normale: { min: 60, max: 250 }, difficile: { min: 25, max: 140 } },
  6: { facile: { min: 200, max: 900 }, normale: { min: 110, max: 480 }, difficile: { min: 50, max: 300 } },
};

const MIN_LONGEST: Record<GridSize, number> = { 4: 6, 5: 7, 6: 8 };

export const STANDARD_SPEC: SchedaSpec = {
  composition: COMPOSITION,
  density: DENSITY,
  anchors: {
    4: { facile: { length: 6, count: 1 }, normale: { length: 6, count: 1 }, difficile: { length: 6, count: 1 } },
    5: { facile: { length: 7, count: 1 }, normale: { length: 7, count: 1 }, difficile: { length: 7, count: 1 } },
    6: { facile: { length: 8, count: 1 }, normale: { length: 8, count: 1 }, difficile: { length: 8, count: 1 } },
  },
  // NIENTE requirePlayableStructure, NIENTE meanLength.
};

// ===== GENERAZIONE SCHEDA STANDARD =====
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

export function generateStandardScheda(options: {
  size: GridSize; difficulty: Difficulty; tries: SchedaTries;
  rng?: () => number; maxAttempts?: number; id?: string;
}): Scheda | null {
  const { size, difficulty, tries } = options;
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 400;
  const bandTrie = tries.bands[difficulty];
  const spec = STANDARD_SPEC;
  const band = spec.density[size][difficulty];
  const anchor = spec.anchors[size][difficulty];

  let best: { grid: Grid; allWords: string[]; distance: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = generateGrid(size, rng, difficulty, spec.composition[difficulty]);
    const allWords = solveGrid(grid, tries.full, { limit: FULL_SOLVE_LIMIT, minLength: 3 });

    let anchorCount = 0;
    for (const w of allWords) if (w.length >= anchor.length) anchorCount++;

    const mid = (band.min + band.max) / 2;
    const distance =
      Math.abs(allWords.length - mid) / Math.max(1, mid) +
      Math.max(0, anchor.count - anchorCount) / Math.max(1, anchor.count);
    if (!best || distance < best.distance) best = { grid, allWords, distance };

    if (allWords.length < band.min || allWords.length > band.max) continue; // densità
    if (anchorCount < anchor.count) continue;                               // ancore

    return toStandard(options, size, difficulty, grid, allWords, bandTrie);
  }
  if (best) return toStandard(options, size, difficulty, best.grid, best.allWords, bandTrie);
  return null;
}

function toStandard(
  options: { id?: string }, size: GridSize, difficulty: Difficulty,
  grid: Grid, allWords: string[], bandTrie: TrieNode,
): Scheda {
  const words = solveGrid(grid, bandTrie, { limit: BAND_SOLVE_LIMIT, minLength: 3 });
  return {
    id: options.id ?? '', size, difficulty, variant: 'standard',
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
