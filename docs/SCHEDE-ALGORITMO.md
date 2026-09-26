# Algoritmo di generazione delle schede — `standard` e `full`

Questo documento descrive **due insiemi di criteri indipendenti** con cui il
progetto genera e valida una scheda:

- **LEGACY / `standard`** — il modello storico;
- **FULL / `full criteria`** — i criteri completi della pagina *Criteri generazione schede*.

Sono separati di proposito: ogni parte si legge e si rigenera da sola, e alcune
cose (lessico, griglia, solver, formato scheda) sono **ripetute** in entrambe le
parti anche se identiche. Preferire la lettura per sezioni.

Indice:

- [0. Vocabolario](#0-vocabolario)
- [PARTE A — Comune: lessico, griglia, solver, formato scheda](#parte-a--comune)
- [PARTE B — LEGACY / `standard`](#parte-b--legacy--standard)
  - [B.1 Composizione](#b1-composizione)
  - [B.2 Generazione griglia](#b2-generazione-griglia)
  - [B.3 Densità](#b3-densità)
  - [B.4 Parole ancora](#b4-parole-ancora)
  - [B.5 Cosa NON controlla](#b5-cosa-non-controlla)
  - [B.6 Procedura di generazione](#b6-procedura-di-generazione)
  - [B.7 Sorgente di riferimento (rigenera standard)](#b7-sorgente-di-riferimento-standard)
- [PARTE C — FULL / `full criteria`](#parte-c--full--full-criteria)
  - [C.1 Composizione](#c1-composizione)
  - [C.2 Generazione griglia](#c2-generazione-griglia)
  - [C.3 Densità](#c3-densità)
  - [C.4 Parole ancora](#c4-parole-ancora)
  - [C.5 Lunghezza media](#c5-lunghezza-media)
  - [C.6 Struttura giocabile](#c6-struttura-giocabile)
  - [C.7 Cosa NON è implementato](#c7-cosa-non-è-implementato)
  - [C.8 Procedura di generazione](#c8-procedura-di-generazione)
  - [C.9 Sorgente di riferimento (rigenera full)](#c9-sorgente-di-riferimento-full)
- [PARTE D — Taratura e verifica](#parte-d--taratura-e-verifica)

---

## 0. Vocabolario

- **Scheda**: griglia **pre-generata e pre-risolta**, con l'elenco delle parole
  componibili. I giocatori non generano griglie al volo: pescano dal catalogo.
- **Griglia**: `N×N` (`4×4`, `5×5`, `6×6`). Una cella/faccia = una lettera;
  la faccia `q` vale **`qu`**.
- **`words`**: parole **attese** = quelle della **fascia di frequenza** della
  difficoltà, componibili sulla griglia. Sono quelle mostrate nel riepilogo
  ("parole che esistevano").
- **`allWords`**: parole **accettate** = **tutte** quelle del **dizionario
  intero** componibili. È l'insieme che il gioco accetta in partita.
- **`variant`**: insieme di criteri con cui la scheda è nata, `standard` o `full`.
- **Densità**: numero di parole **accettate** (`allWords`) sulla griglia.
- **Parole ancora**: almeno `count` parole di almeno `length` lettere.
- **Lunghezza media**: media delle lettere di `allWords`.
- **Struttura giocabile**: assenza di "zone morte" (consonanti isolate, righe o
  colonne senza vocali, `h` inutili).
- **Varianti disponibili**: `standard` (predefinita), `full`.

---

## PARTE A — Comune

Valida per **entrambi** i criteri. Ripetuta anche in B e C.

### A.1 Lessico: un dizionario intero + tre fasce

- Si costruiscono **quattro** trie:
  - `full` — **dizionario intero** giocabile → da qui `allWords`;
  - `bands.facile` — prime **5 000** parole italiane per frequenza d'uso;
  - `bands.normale` — prime **20 000**;
  - `bands.difficile` — prime **60 000**.
- Le fasce si ritagliano da una lista **ordinata per frequenza**
  (`frequency-it.txt`, generata da `build-frequency.mjs`): non sono liste curate.
- Una parola entra in una fascia **solo se è già giocabile** (sta in `full`):
  così `words ⊆ allWords`, sempre.
- Filtro di pulizia prima dei trie: le fonti contengono ~50k troncamenti
  (`andar`, `abbacchier`, `nauseer`). Una parola si tiene solo se:
  - termina in **vocale**, oppure
  - compare in `consonant-endings.txt` (prestiti/apocopi legittime), oppure
  - compare in `protectedWords` (whitelist curate).
- Le **abbreviazioni non sono ammesse** (vedi l'Appendice): `abbreviations.txt` è
  stato rimosso. Conteneva abbreviazioni vere (`dott`) ma anche ~100 etichette di
  materia/grammatica (`idr`, `geogr`, `fis`, `sost`, `avv`), cioè troncamenti di
  classificazione che non sono parole italiane.
- La lista delle parole giocabili **coincide** con il dizionario: non esistono
  esclusioni extra di "parole funzionali".

### A.2 Griglia: costruzione (non campionamento)

- `generateGrid` **costruisce** la griglia invece di pescare 16 dadi:
  1. numero esatto di **vocali** nella fascia della difficoltà;
  2. numero limitato di **lettere rare** (z k w x y j);
  3. `h` e `q` in modo probabilistico (`hqChance`), senza consumare il budget rare
     (servono a *che/chi/qui/qua*);
  4. il resto **consonanti comuni**;
  5. **mescola** con Fisher-Yates.
- **Perché non si campiona dalle fasce**: misurato, le statistiche di lettera
  dell'italiano **non cambiano** con la frequenza (vocali 45,6% nel top 5k e
  45,0% nel 20k–60k; rare 1,14% vs 1,24%). Campionando dalla fascia, le tre
  difficoltà producevano **la stessa griglia**.
- `q` è una faccia speciale: `letterValue('q') === 'qu'`, `letterDisplay('q') === 'Qu'`.

### A.3 Solver

- `buildTrie` costruisce un trie compatto (`children: Map<char,node>`, `word`
  sul nodo terminale); `maxLength` limita la memoria (default 14).
- `solveGrid` fa una **DFS con potatura**: scende nel trie solo se il prefisso
  esiste; limite di parole (`limit`) e lunghezza minima 3.
- La griglia si risolve **due volte**: su `full` → `allWords`; sulla fascia
  della difficoltà → `words`.

### A.4 Formato della scheda

- Campi: `id`, `size`, `difficulty`, `grid` (righe separate da `\n`, `q` = Qu),
  `variant`, `words`, `allWords`, `longest`.
- `longest` = lunghezza della parola più lunga di `allWords` (insieme accettato).
- Punteggio parola: **`lunghezza − 2`** (3 lettere → 1 punto), minimo 3 lettere.
  Nel multiplayer una parola trovata da un solo giocatore vale **doppio**.

### A.5 Perché offline

- **Filtro di qualità**: non si può giudicare una griglia senza risolverla
  (quante parole, la più lunga, la media) → ciclo genera → risolve → giudica,
  troppo caro a runtime.
- **Determinismo**: soluzione pre-calcolata uguale per tutti.
- **Riproducibilità**: la stessa scheda si rigioca e si confronta.

---
## PARTE B — LEGACY / `standard`

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

---
## PARTE C — FULL / `full criteria`

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

## Appendice — Algoritmo `ale` (IMPLEMENTATO)

Terza variante, dal documento *algoritmo schede "ale"*. È una pipeline **a sé**:
non usa `COMPOSITION`/`SPECS`, ma campionamento per frequenza e calibrazione.
Codice: `packages/shared/src/schedaAle.ts`; generazione:
`pnpm --filter @boggle/server gen:schede:ale`.

**Differenze sostanziali da `standard`/`full`:**

- **Lettere campionate per FREQUENZA dei token**, non composte a mano. La
  frequenza è la frazione di voci di `Dict'` che contengono il token.
- **`QU` è un TOKEN unico**: `quando` → `[QU, A, N, D, O]`, `acqua` →
  `[A, C, QU, A]`. L'alfabeto è di 26 simboli (nessuna `Q` isolata).
- **Difficoltà = quota di parole fuori da `Common`** (`Common` = NVdB ∩ `Dict'`),
  non la composizione della griglia.
- **Limiti calibrati**: da un campione di griglie si derivano l'intervallo di
  parole accettate (Tukey + `rho`) e le tre fasce di difficoltà (k-means k=3,
  con fallback ai tertili).

**Pre-processing (`Dict → Dict'`):** accenti piegati, solo `a-z`, lunghezza ≥ 3
lettere, `q` solo se seguita da `u` (`iraq`, `soqquadro` scartate).

**Radice/lemma (IMPORTANTE):** NVdB contiene i **lemmi** (`amare`), non tutte le
forme flesse. Una parola è quindi **comune** se lo è lei **oppure la sua radice**
(lemma da Morph-it, formato `forma<TAB>lemma<TAB>tag`):

| Forma | Lemma | `Common` ha la forma? | Esito |
| --- | --- | --- | --- |
| `amo` | `amare` | no | **comune** (radice) |
| `cani` | `cane` | no | **comune** (radice) |
| `cervi` | `cervo` | no | **comune** (radice) |
| `abbacchiamo` | `abbacchiare` | no | rara |

Senza la radice la difficoltà era gonfiata dalla morfologia (0,80/0,85/0,89);
con la radice scende a valori realistici (**0,51/0,57/0,64**).

**Guard rails (ATTIVI, scelta di progetto):** banda vocali 38–52%, al più una tra
`H`/`Z`/`QU`, nessuna riga o colonna di sole consonanti, nessuna lettera non
italiana. La spec li dà opzionali: qui sono fissi e **devono essere identici in
calibrazione e produzione** (cambiarli invalida `calibration.json`).

**Produzione**: ciclo di reiezione con seme (`seed + attempt`), 500 tentativi,
ripiego sul candidato più vicino. Le schede hanno `words === allWords` (nessuna
fascia di frequenza separata) e id che partono **dopo** standard/full nello
stesso file (`5-facile-016`…), per non collidere.

**Stato**: 45 schede, **solo 5×5** (15 per difficoltà). La calibrazione è per
dimensione: aggiungere altre dimensioni richiede una nuova calibrazione.

---

## Appendice — Modalità apprendimento (IMPLEMENTATA)

Modalità del single player per **imparare le parole** invece di gareggiare.
Si attiva dalle impostazioni partita (Sì/No) e cambia tre cose:

- **Tempo infinito**: il round non scade, si esce solo a mano. L'effect del conto
  alla rovescia non parte quando la modalità è attiva.
- **Tasto suggerimento (💡)**: scegle una parola **non ancora trovata** e ne
  **anima il percorso** sulla griglia, accendendo le celle in sequenza. Preferisce
  le parole più lunghe (più difficili da vedere). Il percorso lo calcola
  `findWordPath` in `grid.ts` (DFS, 8 direzioni, `q` = "qu"): la stessa parola si
  può comporre in più modi, quindi serve il tracciato, non solo il testo.
- **Definizione**: il pulsante "?" accanto alla parola appena trovata (o
  suggerita) apre le definizioni. Fonte: dump di Wikizionario (kaikki.org /
  wiktextract), estratto in `definitions.br` da
  `pnpm --filter @boggle/dictionary build:definitions`.

**Perché le definizioni sono "filtrate"**: le voci `form-of` (es. `amo` →
"prima persona di amare") sono **escluse**. Non spiegano il significato, dicono
solo da quale lemma deriva; il significato sta nel lemma. Per una forma flessa
il pannello mostra quindi il link alla voce online, non un testo vuoto.

**Dove**: `useSoloGame.ts` (suggerimento, tempo infinito), `GridBoard`
(`hintPath` → celle `.tile--hint` animate), `CurrentWord` + `WordDefinition`
(pannello), rotta `GET /words/:word/definition`.

---

## PARTE D — Taratura e verifica

- `measure:schede [--variant standard|full] [--n N] [--size S]` misura, per ogni
  dimensione × difficoltà: percentili di parole accettate, quota dentro banda,
  quota con struttura valida, lunghezza media, correlazione parole↔punti,
  composizione media. Da qui si aggiustano i numeri negli `*_SPEC`. Se la quota
  "entrambe" è < 10%, la banda è troppo stretta.
- `verify:schede [--measure N] [--verbose] [--size S] [--difficolta D]` controlla
  ogni scheda (su disco o generata fresca) contro i criteri e **esce con codice 1**
  se trova violazioni (usabile in CI). Verifica:
  - densità nella banda della variante;
  - parole ancora (`length` × `count`);
  - lunghezza media (solo full);
  - struttura giocabile (solo full);
  - coerenza di `longest` con `allWords`;
  - `words ⊆ allWords`;
  - presenza nel dizionario (schede stale).
- Con le bande chiuse su entrambi i lati la disparità del catalogo `full` scende
  da 1,7–2,8× a **1,1–1,6×** su parole e punti.

---

## Appendice — Abbreviazioni ed etichette di materia (RIMOSSE)

`packages/dictionary/data/abbreviations.txt` è stato **eliminato** e non è più una
fonte del dizionario.

- Conteneva due categorie diverse:
  - **abbreviazioni vere** (`dott`, `prof`, `sig`, `ing`, `rag`, `egr`…), ~35;
  - **etichette di materia/grammatica** (`idr` = idraulica, `geogr`, `chim`,
    `fis`, `mat`, `sost`, `avv`, `verb`, `prep`…), ~97: troncamenti usati per
    classificare gli altri lemmi, **non parole italiane**.
- **Effetto osservato**: `idr` compariva tra le parole trovabili delle schede pur
  non essendo nel dizionario generato da Morph-it. Con l'etichetta "abbreviazione"
  sfuggiva al filtro dei troncamenti (che scarta le parole che finiscono in
  consonante) ed entrava nel lessico giocabile.
- **Rimozione**: eliminate tutte le voci del file. Dal dizionario sono sparite
  **113 voci** (368.213 → 368.100); 6 restano perché sono già parole piene o in
  `consonant-endings.txt` (`prof`, `societa`, `ecc`, `bot`, `con`, `dir`, `fin`,
  `sport`, `tip`).
- **Codice**: rimosso `abbreviations` da `createSchedaPool` e dagli script
  (`gen-schede`, `measure-schede`, `verify-schede`); `build-words.mjs` non la
  applica più. `frequency-it.txt` è stato filtrato sulle sole parole giocabili
  (la fascia difficile è 59.959 invece di 60.000: è tutte le parole disponibili).
- **Catalogo**: rigenerato. `verify:schede` non trova violazioni e **nessuna**
  delle 113 voci rimosse compare più in `allWords`/`words` (verificato: 0).

---

## Appendice — Lettere rare e lettere non italiane (IMPLEMENTATO)

La separazione è ora nel codice: `RARE_ITALIAN = ['z']` e
`FOREIGN_LETTERS = ['k','w','x','y','j']` (`packages/shared/src/grid.ts`).

- **`z` è italiana e produttiva**: 35 602 voci nel dizionario (9,7% delle
  parole). È l'unica lettera rara usata, con tetti 3% / 12% / 12%.
- **`k w x y j` sono quasi tutte prestiti/derivati**: k 481, x 327, y 287, w 264,
  j 153 voci; nella fascia *facile* (prime 5 000) solo 33 parole in tutto
  (`taxi`, `weekend`, `show`, `killer`, `gay`…).
- **Scelta implementata**: `foreignMax: 0` in tutte le difficoltà — le lettere non
  italiane **non entrano mai in griglia**. Le parole straniere restano nel
  dizionario e sono accettate se componibili con altre lettere.
- Perché la separazione:
  - `z` = rarità giocabile; `k w x y j` = lettere straniere, in gran parte "celle
    morte" (non formano nessuna parola di 3+ lettere);
  - il vecchio `rareMin 1` poteva **obbligare** una lettera morta (`j`), perché non
    distingueva `z` da `j`; ora si applica solo a `z`;
  - `gridStructureIssues` segnala comunque come difetto ogni lettera non italiana
    presente in griglia (difesa in profondità se `foreignMax` tornasse > 0).
- **Catalogo rigenerato** con i nuovi criteri: 135 schede (10 standard + 5 full per
  ognuna delle 9 combinazioni), **0 celle non italiane**, 77 schede con almeno una
  `z`. `verify:schede` non trova violazioni.
- **Da rimisurare**: i numeri di densità sono tarati sul vecchio insieme di
  lettere. Il catalogo attuale è conforme, ma `measure:schede` mostra che per la
  variante `full` difficile la quota che soddisfa *tutti* i criteri in un colpo è
  bassa (~1–4%): il generatore usa il ripiego più spesso. È un effetto
  pre-esistente (la struttura era già il collo di bottiglia), non introdotto da
  questa modifica; si può allargare la banda in `FULL_SPEC` se si vuole ridurlo.

---

## Verifica di fedeltà dei sorgenti

- `COMPOSITION`, `FULL_COMPOSITION`, `DENSITY`, `MIN_LONGEST`, `STANDARD_SPEC`,
  `FULL_SPEC`, `BAND_SIZES`, i limiti di solve: **copiati alla lettera** da
  `packages/shared/src/schedaGen.ts` e `grid.ts`.
- Ordine dei controlli: standard → densità → ancore; full → struttura → densità →
  ancore → lunghezza media (identico all'originale).
- Non reimplementati nei due blocchi: `solveGrid` e `buildTrie` (in `solver.ts`,
  qui `declare`) e l'I/O degli script.
