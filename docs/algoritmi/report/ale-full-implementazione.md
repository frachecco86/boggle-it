# Implementazione — evoluzione algoritmo `ale` (branch `ale-full`)

> Specifica di implementazione dell'evoluzione `ale-full`, **inclusa** la
> definizione di "parola comune": si adotta la **variante 4** (metrica ad anelli
> di frequenza pesati), che sostituisce la rarità binaria basata su NVdB+lemmi.
>
> Il documento è auto-contenuto: ogni formula, costante, file e ordine di
> esecuzione è esplicitato. Quando qualcosa non è scritto qui, vale il
> comportamento di `packages/shared/src/schedaAle.ts`. I numeri misurati e la
> verifica di riproduzione sono in [`ale.md`](./ale.md).

---

## 1. Definizioni (formule esatte)

### 1.1 Anelli di frequenza

Fonte: `packages/dictionary/data/frequency-it.txt` — parole giocabili ordinate
per frequenza d'uso (OpenSubtitles 2018), una per riga, dalla più frequente.

Costanti nuove in `schedaAle.ts`:

```ts
export const ALE_RARITY_RINGS = { easy: 5000, medium: 20000 } as const;
```

Costruzione degli insiemi (fatta nel server/scripts, vedi §3):

1. si legge il file riga per riga;
2. ogni riga si normalizza con `cleanAleWord` (già esistente: minuscole,
   accenti piegati, solo `a-z`, ≥3 lettere, `q` solo se seguita da `u`); le
   righe scartate non contano ai fini delle posizioni (si prendono le prime
   5000/20000 voci **valide dopo la pulizia**);
3. `ringEasy` = `Set` delle prime 5000 voci pulite; `ringMedium` = `Set` delle
   prime 20000 voci pulite (include `ringEasy`: le fasce sorgente sono
   annidate; gli **anelli** si derivano per differenza al momento del conteggio).

Anello di una parola `w`:

| condizione | anello | indice |
|---|---|---|
| `w ∈ ringEasy` | facile | 0 |
| `w ∈ ringMedium ∖ ringEasy` | medio | 1 |
| altrimenti | raro | 2 |

### 1.2 Rarità `R` (NUOVA definizione)

Per una griglia con parole trovate `words` (dal solver, `wordCount = |words|`):

- quote: `f0 = #{w : anello 0} / wordCount`, `f1 = #{w : anello 1} / wordCount`,
  `f2 = #{w : anello 2} / wordCount` (somma = 1);
- **`R = (0·f0 + 1·f1 + 2·f2) / 2`** — cioè `(f1 + 2·f2) / 2` ∈ [0, 1].
- Se `wordCount = 0`: `R = 0` (come oggi; il caso è comunque scartato dal
  range di parole).

Sostituisce in toto la vecchia `R` (quota fuori da `Common = NVdB ∩ Dict'` con
ponte sui lemmi). **NVdB, `lemmas.br` e Morph-it non servono più alla
pipeline ale.**

### 1.3 Ricchezza `M` e difficoltà `D` (invariate come formule)

- `M = 1 − wordCount / score`, con `score = Σ (lunghezza − 2)`; `M = 0` se
  `score ≤ 0`.
- `D = 0.5·R + 0.5·M` con `ALE_DIFFICULTY_WEIGHTS = { rarity: 0.5, richness: 0.5 }`
  (invariati).

Livello atteso dopo il cambio di `R` (dallo studio su 300 griglie/dimensione):
`R` media ~0,68 (4×4), ~0,71 (5×5), ~0,74 (6×6) — più alta della vecchia
(~0,56–0,59) perché l'anello "raro" conta doppio. Le fasce si ri-centrano da
sole in calibrazione (k-means): non serve ritoccare i pesi.

### 1.4 Guard rails (nuovi valori)

`AleGuardRails` diventa:

```ts
export interface AleGuardRails {
  vowels: { min: number; max: number } | null;   // invariato: { min: 0.3, max: 0.6 }
  rareCap: number | null;                        // invariato: 3 (somma di h, z, qu)
  noUncoveredLines: boolean;                     // invariato: true
  structure: boolean;                            // NUOVO: true
  anchorMinLength: Record<GridSize, number> | null; // NUOVO: { 4: 6, 5: 7, 6: 8 }
}
```

`DEFAULT_ALE_GUARD_RAILS`:

```ts
{
  vowels: { min: 0.3, max: 0.6 },
  rareCap: 3,
  noUncoveredLines: true,
  structure: true,
  anchorMinLength: { 4: 6, 5: 7, 6: 8 },
}
```

Significato dei due rails nuovi:

- **structure** (`true`): la griglia deve superare `gridStructureIssues`
  (già esistente in `packages/shared/src/grid.ts`, usata dall'algoritmo
  "full"): (i) nessuna consonante a distanza di Chebyshev > 2 da ogni vocale;
  (ii) al più una riga/colonna senza vocali; (iii) nessuna `h` senza `c` o `g`
  in una cella adiacente. Le vocali qui sono le lettere `a e i o u` di
  `VOWELS` in `grid.ts` (la `q` non conta come vocale in questa regola — la
  regola è riusata così com'è, senza varianti).
- **anchorMinLength**: la griglia (di dimensione `size`) deve avere almeno una
  parola trovata di lunghezza ≥ `anchorMinLength[size]`.

### 1.5 Calibrazione

Invariata la sequenza: campione di 2000 griglie valide → intervallo globale di
parole `[lo, hi]` (Tukey su q1/q3 ristretto con `rho = ALE_CALIBRATION_RHO =
0.35`) → difficoltà composita dei superstiti → k-means k=3 (fallback tertili).

**Novità — bande di parole per fascia.** Dopo il k-means:

1. ogni griglia superstite viene assegnata alla sua fascia con
   `tierForDifficulty` (già esistente);
2. per ogni fascia si raccolgono i `wordCount` dei membri e si applica la
   **stessa** procedura Tukey+ρ (stessa ρ=0,35) a quel sottoinsieme:
   `lo_t = max(1, round(med_t − (med_t − tukeyLo_t)·ρ))`,
   `hi_t = round(med_t + (tukeyHi_t − med_t)·ρ)`;
3. la banda della fascia viene **tagliata al range globale**:
   `lo_t = max(lo_t, lo)`, `hi_t = min(hi_t, hi)`;
4. se una fascia ha **meno di 30 membri** nel campione: la sua banda è il range
   globale (fallback documentato in provenance con `perTierFallback: true`).

`AleCalibration.tiers[i]` guadagna il campo `wordRange: { lo: number; hi: number }`.

### 1.6 Provenance e invalidazione

`AleCalibration.provenance` diventa:

```ts
{
  samples: number;
  guardRails: AleGuardRails;        // ora include structure e anchorMinLength
  dictSize: number;
  rings: { easy: number; medium: number };  // NUOVO (= ALE_RARITY_RINGS)
  metric: 'rings-v1';               // NUOVO: identifica la definizione di R
  wordCount: { min, q1, median, q3, max };
  rho: number;
  weights: { rarity: number; richness: number };
  usedKmeans: boolean;
  perTierFallback: boolean;         // NUOVO: true se una fascia ha usato il range globale
}
```

Rimosso `commonSize` (non esiste più `Common`). Il runtime
(`committedCalibration` in `apps/server/src/ale.ts`) accetta la calibrazione
committata solo se **tutti** questi controlli passano:

- `guardRails` identici (JSON deep-equal) a `DEFAULT_ALE_GUARD_RAILS`;
- `weights` identici ad `ALE_DIFFICULTY_WEIGHTS`;
- `rho === ALE_CALIBRATION_RHO`;
- `metric === 'rings-v1'` e `rings` deep-equal ad `ALE_RARITY_RINGS`.

Se uno fallisce: ricalcolo al volo (comportamento già esistente).

---

## 2. `packages/shared/src/schedaAle.ts` — modifiche funzione per funzione

### 2.1 Rimossi

- `buildAleCommon`, `buildAleLemmas`, `isAleCommon` (e i loro export): il
  concetto di `Common` basato su NVdB+lemmi sparisce.
- Ogni riferimento a NVdB / Morph-it / lemmi nei commenti di testata del
  modulo: riscritto per descrivere gli anelli di frequenza.

### 2.2 Nuovi

```ts
/** Anello di frequenza di una parola: 0 = top-5000, 1 = 5001–20000, 2 = oltre. */
export function aleRingOf(
  word: string,
  rings: { easy: ReadonlySet<string>; medium: ReadonlySet<string> },
): 0 | 1 | 2;

/** Conteggi per anello + rarità pesata R = (f1 + 2·f2)/2. */
export function aleRarityRings(
  words: readonly string[],
  rings: { easy: ReadonlySet<string>; medium: ReadonlySet<string> },
): { ringCounts: [number, number, number]; rarity: number };
```

### 2.3 Modificati

- **`AleBoardStats`**: `commonCount` → sostituito da
  `ringCounts: [number, number, number]`. Il campo `rarity` resta con lo
  stesso nome ma contiene la nuova `R` ad anelli (commento aggiornato:
  "rarità pesata sugli anelli di frequenza, vedi `aleRarityRings`").
- **`scoreAleBoard(grid, trie, options)`**: la firma perde
  `common: Set<string>` dal secondo argomento... — **cambio di firma**:
  `scoreAleBoard(grid, trie, options: { minLength?, limit?, rings })`.
  Dentro: niente più test `isAleCommon`; si calcolano `ringCounts` e `rarity`
  con `aleRarityRings`. `score` e `longest` invariati.
- **`AleGuardRails`** e **`DEFAULT_ALE_GUARD_RAILS`**: come in §1.4.
- **`generateAleGrid`**: nuovo ordine di controlli (dal più economico al più
  costoso), con contatori in `AleGenerationStats` per ogni motivo di scarto:
  1. campionamento token (invariato);
  2. `tokenGuardRailIssues` (vocali, rareCap — invariato);
  3. **structure**: se `rails.structure`, si costruisce la griglia
     (`buildAleGrid`) e si valuta `gridStructureIssues`; le violazioni si
     registrano in `railRejections` con i messaggi originali della funzione;
  4. **copertura** (`solveGridCoverage`, invariato se `noUncoveredLines`);
  5. **ancora**: `solveGridCoverage` restituisce già `words`: se
     `rails.anchorMinLength`, si richiede `max(len(words)) ≥
     anchorMinLength[size]` — stesso solve del punto 4, **nessun costo
     aggiuntivo**; motivo di scarto: `nessuna parola ≥ N lettere`.
- **`calibrateAle`**: aggiunge il calcolo delle bande per fascia (§1.5) e i
  nuovi campi di provenance (§1.6). La firma del secondo argomento cambia:
  `{ guardRails, dictSize, rings, rho?, weights? }` (`commonSize` rimosso).
- **`sampleAleBoards`**: firma aggiornata — via `common` e `lemmas`, dentro
  `rings`:
  `sampleAleBoards(size, freq, trie, rings, n, masterSeed, rails, stats)`.
- **`generateAleScheda`**: **sostituita** dalla generazione a flusso (§2.4).

### 2.4 Generazione "a tre secchi" (nuova produzione)

Due funzioni:

```ts
/** Un candidato classificato: griglia valida + stats + fascia naturale. */
export interface AleCandidate {
  grid: Grid;
  stats: AleBoardStats;
  difficulty: Difficulty;   // fascia assegnata da tierForDifficulty
  distance: number;         // distanza dal centro della fascia (per i ripieghi)
}

/**
 * Il PROSSIMO candidato del flusso deterministico.
 * `attempt` è il contatore globale del flusso: il seme della griglia è
 * `seed + attempt`, come oggi. Ritorna `null` se il candidato non è
 * accettabile (guard rails, range globale, o banda della sua fascia).
 * Il chiamante incrementa `attempt` e riprova.
 */
export function nextAleCandidate(options: {
  size: GridSize;
  freq: AleFrequency;
  trie: TrieNode;
  rings: { easy: ReadonlySet<string>; medium: ReadonlySet<string> };
  calibration: AleCalibration;
  seed: number;
  attempt: number;
  rails?: AleGuardRails;
  stats?: AleGenerationStats;
}): AleCandidate | null;
```

Regole di accettazione dentro `nextAleCandidate`, in ordine:

1. `generateAleGrid` con tutti i rails → se `null`: `stats.noGrid++`, ritorna `null`;
2. `scoreAleBoard` con `rings`;
3. se `wordCount` fuori dal range **globale** `[lo, hi]`: `stats.wordCountOut++`, `null`;
4. `D = compositeDifficulty(rarity, wordCount, score)`;
   `difficulty = tierForDifficulty(D, calibration)`;
5. se `wordCount` fuori dalla **banda della fascia** `tier.wordRange`:
   `stats.tierBandOut++` (contatore NUOVO), `null`;
6. altrimenti ritorna il candidato; `distance` =
   `|D − tier.targetDifficulty|` (serve per i ripieghi, §2.5).

```ts
/**
 * Riempie i tre secchi (facile/normale/difficile) con `perTier` schede
 * ciascuno, pescando dal flusso. Deterministica: stesso (seed, perTier, size)
 * → stesse schede.
 */
export function generateAleBuckets(options: {
  size: GridSize;
  perTier: number;
  freq: AleFrequency;
  trie: TrieNode;
  rings: { easy: ReadonlySet<string>; medium: ReadonlySet<string> };
  calibration: AleCalibration;
  seed: number;
  idStart: number;          // primo numero di id per OGNI fascia (come oggi)
  maxAttempts?: number;     // default 500 × perTier, sul flusso globale
  rails?: AleGuardRails;
  stats?: AleGenerationStats;
}): Record<Difficulty, Scheda[]>;
```

Comportamento:

- `attempt` parte da 0 e cresce a ogni chiamata a `nextAleCandidate`.
- Un candidato accettato entra nel secchio della sua fascia **solo se il
  secchio non è pieno**; se è pieno, il candidato si scarta senza contatori
  (è una scheda valida di un'altra fascia — non è un errore).
- Per ogni fascia si tiene traccia del **miglior candidato non accettato**
  (distanza minima dal centro) visto finora: serve al ripiego.
- Stop: tutti i secchi pieni, oppure `attempt` raggiunge `maxAttempts`.
- **Ripiego** (per fascia non piena a fine flusso): si completa il secchio con
  i migliori candidati visti per quella fascia (in ordine di distanza), anche
  se fuori banda di fascia; se non ce ne sono, si rilancia il flusso da
  `maxAttempts` con i soli rails + range globale fino a riempire. Ogni ripiego
  va **loggato** dallo script chiamante (come oggi) e contato in
  `stats.fallbacks` (contatore NUOVO).
- **Id**: per ogni fascia, `id = `${size}-${difficulty}-${NNN}`` con `NNN =
  idStart + posizione di riempimento del secchio` (0-based, padded a 3). Gli id
  restano quindi contigui per fascia e non collidono con standard/full che
  precedono nel file (stesso contratto di oggi: `idStart = kept.length + 1` lo
  decide il chiamante).
- La `Scheda` prodotta è identica di formato a oggi: `words === allWords`,
  `variant: 'ale'`, `longest` da stats.

`AleGenerationStats` — nuovi/aggiornati: `tierBandOut` (nuovo), `fallbacks`
(nuovo), `difficultyOut` (**rimosso**: non esiste più un target per scheda),
gli altri invariati.

### 2.5 Nota su determinismo e riproducibilità

Il flusso dipende solo da `(size, seed, rails, rings, calibration, trie)`:
stessi ingressi → stesse schede, come oggi. Il report deve continuare a
verificare la riproduzione contro il catalogo (15/15 per fascia).

---

## 3. `apps/server/src/ale.ts` — ingressi

- **Rimossi**: `NVDB_PATH`, `ALE_LEMMAS_PATH`, `MORPH_PATH`, `loadAleLemmas`,
  il caricamento di NVdB e lemmi dentro `loadAleInputs`, e i campi `common`,
  `lemmas`, `nvdbCount` di `AleInputs`.
- **Nuovo** `FREQUENCY_PATH = path.join(DICT_DIR, 'frequency-it.txt')` e il
  caricamento degli anelli:

```ts
export interface AleInputs {
  rawCount: number;
  dictPrime: string[];
  dictSet: Set<string>;
  freq: AleFrequency;
  rings: { easy: Set<string>; medium: Set<string> };   // da frequency-it.txt
  trie: TrieNode;
}
```

  Costruzione di `rings`: come in §1.1 (pulizia con `cleanAleWord`, prime
  5000/20000 voci valide). Log di avvio aggiornato:
  `ale: anelli di frequenza 5.000 / 20.000 (da frequency-it.txt)`.
- `calibrationFor`: passa a `calibrateAle` i nuovi campi
  (`rings: ALE_RARITY_RINGS`, `metric: 'rings-v1'`, niente `commonSize`) e
  aggiorna `committedCalibration` con i controlli di §1.6.
- `generateAleBatch(options)` (usata dall'admin, §5): implementata sopra il
  flusso — si pesca da `nextAleCandidate` finché non si raccolgono `count`
  candidati della fascia richiesta (secchi pieni delle altre fasce ignorati),
  con lo stesso ripiego di §2.4 applicato alla singola fascia. Firma esterna
  invariata (`{ size, difficulty, count, startIndex, seed?, inputs? }`):
  l'endpoint admin non cambia.

---

## 4. Script offline

### 4.1 `apps/server/scripts/gen-schede-ale.ts`

- Carica gli ingressi da `ale-inputs.ts` (ri-esporta `ale.ts`: nessuna modifica
  strutturale, solo i campi nuovi).
- Per ogni dimensione: calibrazione (2000 campioni, ρ=0,35) → **una sola**
  chiamata a `generateAleBuckets({ perTier: n })` → scrittura dei tre file
  `schede-{size}-{difficolta}.json` (merge con standard/full esistenti come
  oggi, `--append`/`--replace` invariati).
- CLI: `--difficolta` **rimosso** (la generazione è sempre per tutte e tre le
  fasce insieme); `--n`, `--samples`, `--seed`, `--size`, `--append`,
  `--replace` invariati. Errore esplicito se si passa `--difficolta`:
  "la generazione ale è a tre secchi: usa --n per il numero per fascia".
- Log per fascia: schede prodotte, parole medie, quota in banda di fascia,
  ripieghi.

### 4.2 `apps/server/scripts/report-ale.ts`

- Sezione calibrazione: al posto di "rarità R (NVdB)" stampa la distribuzione
  delle **quote per anello** (f0/f1/f2 medie) e della nuova `R`; poi M e D
  come oggi; poi la tabella delle fasce **con la banda parole per fascia**.
- Sezione generazione: usa `generateAleBuckets` (stesso seed e conteggio della
  produzione) e riporta per fascia: riempimento, ripieghi, tentativi totali
  del flusso, scarti per motivo (incluso `tierBandOut`).
- Verifica di riproduzione invariata (griglie prodotte vs catalogo).
- Intestazione del report: `2000 campioni, 15 schede per fascia, seed 1`.

### 4.3 Script dichiarati legacy

- `packages/dictionary/scripts/build-ale-lemmas.mjs`: non più usato dalla
  pipeline. **Non cancellare** il file né `data/ale/lemmas.br` /
  `data/ale/nvdb.words.txt` in questo branch: si aggiunge una riga in testa
  allo script ("LEGACY: non più usato dall'algoritmo ale, vedi
  docs/algoritmi/report/ale-full-implementazione.md §1.2") e una nota in
  `docs/algoritmi/ale.md`.

---

## 5. Server (`apps/server/src/index.ts`) e client

- Endpoint admin `POST /admin/schede/genera` per `ale`: **nessuna modifica** —
  continua a chiamare `generateAleBatch` per (size, difficulty, count); la
  differenza è interna (§3). Il log "✓ Admin: generate …" resta valido.
- `GET /config`, `/schede`, `/preview`, gioco single/multiplayer: **nessuna
  modifica** (il formato `Scheda` non cambia).
- Client web: **nessuna modifica** funzionale. Solo la voce di changelog
  (§7.4).

---

## 6. Test

### 6.1 `packages/shared/src/schedaAle.test.ts` — riscrivere/aggiungere

- **Rimuovere**: i describe su `buildAleCommon`, `buildAleLemmas`,
  `isAleCommon` e ogni test che costruisce `Common`/lemmi.
- **`aleRingOf` / `aleRarityRings`**: parola nel top-5k → anello 0; nel
  5–20k → 1; fuori → 2; `R` = 0 se tutte anello 0, 1 se tutte anello 2,
  0,5 se metà anello 1 (f1 = 1 → (1 + 0)/2) e metà... (casi esatti su liste
  piccole costruite a mano); `wordCount = 0` → `R = 0`.
- **Guard rails**: una griglia con `h` isolata viene scartata (structure); una
  griglia senza parole ≥ soglia viene scartata (anchor); i messaggi finiscono
  in `railRejections`.
- **`calibrateAle`**: con campioni sintetici, `tiers[i].wordRange` è dentro il
  range globale, ordinato per fascia nel senso atteso dai dati, e
  `provenance.metric === 'rings-v1'`; fallback per-tier se una fascia ha < 30
  membri.
- **`nextAleCandidate` + `generateAleBuckets`**: su dizionario giocattolo
  (come i test end-to-end esistenti): riempie i tre secchi, deterministico
  (stessa chiamata → stessi id e griglie), nessun `difficultyOut`, id contigui
  per fascia.
- I test end-to-end esistenti su `sampleAleBoards`/`scoreAleBoard` vanno
  aggiornati alle nuove firme (`rings` al posto di `common`/`lemmas`).

### 6.2 Altri pacchetti

- `apps/server`: `schede.test.ts`, `rooms.test.ts` ecc. non toccano ale — devono
  passare invariati. Eventuali test che importano i simboli rimossi
  (`isAleCommon`…) vanno aggiornati (oggi solo `schedaAle.test.ts` e
  `report-ale.ts` li usano).
- `pnpm typecheck` pulito su tutti i workspace.

---

## 7. Documentazione

1. `docs/algoritmi/ale.md`: nuova definizione di R (anelli), rails aggiornati,
   bande per fascia, generazione a tre secchi; sezione "Radice/lemma" marcata
   LEGACY con rimando a questo documento.
2. `docs/algoritmi/report/ale.md`: **rigenerato** alla fine (Step 8.5).
3. `PLAN.md` (rimosso dal repo): era il piano di lavoro da cui nasce questa
   specifica; non serve più.
4. `apps/web/src/version.ts`: nuova voce di changelog (card di riassunto +
   dettaglio tecnico: metrica ad anelli, nuovi rails, bande per fascia,
   generazione a secchi).
5. `README.md`: tabella "Memoria del server" — la riga sulla generazione ale
   perde "+ radici"; sezione Dizionario: NVdB/Morph-it restano fonti del
   dizionario principale, ma non più della pipeline ale (una frase).

---

## 8. Ordine di esecuzione (con gate di verifica)

1. **Shared**: modifiche a `schedaAle.ts` (§2) → `pnpm --filter @boggle/shared
   test` verde (test nuovi inclusi) → `pnpm typecheck`.
2. **Server**: `ale.ts` (§3) → `pnpm --filter @boggle/server test` verde →
   typecheck.
3. **Script**: `gen-schede-ale.ts`, `report-ale.ts` (§4) → typecheck.
4. **Ricalibrazione + rigenerazione catalogo**:
   `pnpm --filter @boggle/server gen:schede:ale -- --replace --samples 2000`
   → gate: k-means converge su tutte e tre le dimensioni; nessun
   `perTierFallback`; schede 15/15 per fascia, tutte in banda globale + fascia;
   ripieghi = 0.
5. **Report**: `pnpm --filter @boggle/server report:ale -- --all-sizes`
   → gate: riproduzione 15/15 per fascia vs catalogo.
6. **Bundle web**: `node apps/web/scripts/copy-schede.mjs`.
7. **Docs + version.ts** (§7).
8. **Smoke test manuale**: server + client locali (`pnpm dev`), admin →
   genera 5 ale su 5×5 (una fascia) → compaiono in "Sfoglia le schede";
   partita single player su una scheda ale nuova per dimensione.
9. Commit + push su `ale-full`.

---

## 9. Criteri di accettazione finali

- k-means k=3 converge in tutte le dimensioni (nessun fallback ai tertili) e
  ogni cluster ≥ 10% del campione.
- Ogni scheda prodotta: dentro il range globale **e** la banda della sua
  fascia, ≥ 1 parola ancora (6/7/8+), zero problemi di struttura.
- Tentativi totali del flusso per 45 schede/dimensione ≤ ~3× il caso attuale
  (riferimento attuale: media 1,7–6,1 tentativi per scheda, max 23 su 500).
- Rarità media per fascia ordinata (facile < normale < difficile) in ogni
  dimensione, con la nuova R.
- Tutti i test verdi, typecheck pulito, report aggiornato nel repo.

---

## 10. Cosa NON cambia (esplicito)

- Formato `Scheda` (id, grid, `words === allWords`, `longest`, `variant`).
- Alfabeto di 26 token con `QU` unico e campionamento per frequenza dei token.
- Guard rails esistenti (vocali 30–60%, ≤3 rari, copertura righe/colonne).
- Intervallo globale di parole: Tukey + ρ=0,35 su 2000 campioni, seed 1.
- Punteggio `lunghezza − 2`, pesi di D (0,5/0,5), ρ (0,35).
- Endpoint HTTP, protocollo Socket.IO, client (tranne changelog).
- `words` nel riepilogo resta uguale ad `allWords` anche per ale (l'idea B del
  brainstorming — riepilogo con sole parole attese — **non** è in questo
  piano).
