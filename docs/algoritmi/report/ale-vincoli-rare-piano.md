# Piano — vincoli sulle lettere rare nell'algoritmo `ale`

> Stato: **revisione 2 (proposta semplice, autoritativa)**. Sostituisce la rev. 1
> (esplorativa: iniezione, cap proporzionale, floor per fascia, calibrazione a due
> passate), conservata solo come storico nelle note a fondo pagina.
>
> Obiettivo: far **apparire** le lettere rare in `ale` — soprattutto su
> **difficile** — con il minimo di parti mobili: niente iniezione, niente cap
> proporzionale, niente flussi per fascia, niente calibrazione a due passate.

---

## 0. Decisione in breve

Quattro modifiche, tutte localizzate in `schedaAle.ts`:

1. **`qu` fuori dalla banda vocali** (`ALE_VOWEL_TOKENS = {a,e,i,o,u}`), come nel full.
2. **`tokenFloor`** di campionamento per `qu`, espresso in **quota di cella** (0,6%).
3. **`rareByTier`**: gate di *accettazione* applicato **dopo** l'assegnazione della
   fascia naturale (`facile: max 1`, `difficile: min 1`). Non cambia `D`: non è
   circolare.
4. **`h` con peso posizionale** (solo celle adiacenti a `c`/`g`) **calibrato sulla
   frequenza naturale** di `h`, così da non alterare la distribuzione delle lettere.

Il **`rareCap` resta fisso a 3**: dopo il floor di `qu` il tetto *morde davvero*
(vedi §3.5), quindi non si tocca. Si scarta solo la variante *proporzionale*
(`rareRate`), non il cap.

La gestione di `h` (punto 4) è ortogonale e può essere una tappa separata.

---

## 1. Il problema vero: la difficoltà non vede le lettere

`ale` assegna la fascia **dopo**, da `D = 0,5·R + 0,5·M`:
`R` = rarità delle **parole trovate** (anelli di frequenza), `M` = ricchezza.
Due griglie con le stesse parole ma `h`/`z`/`qu` diverse hanno lo **stesso `D`**.

Conseguenza misurata sul catalogo `ale` attuale (135 schede):

| dimensione | facile · rare medie | normale | difficile | difficile: `Qu` / `h` / `z` |
| --- | --- | --- | --- | --- |
| 4×4 | 0,40 | 0,20 | **0,13** | 0% / 0% / 13% |
| 5×5 | 0,20 | 0,27 | **0,20** | 0% / 7% / 13% |
| 6×6 | 0,73 | 0,60 | **0,33** | 0% / 0% / 33% |

Le rare sono **anti-correlate** con la difficoltà: "difficile" ne ha *meno* di
"facile". Non è un problema di floor: è il classificatore che non le vede. Per
questo la rev. 1 finiva in iniezione e calibrazione a due passate — stava imponendo
a valle una proprietà che non entra a monte.

La soluzione semplice non è forzare le rare, ma **garantire la disponibilità**
(floor di `qu`) e **selezionare per fascia** (gate), lasciando `D` intatto.

---

## 2. Cosa NON serve (rispetto alla rev. 1)

| elemento rev. 1 | perché si scarta |
| --- | --- |
| **cap proporzionale** (`rareRate`, §4.3 rev. 1) | il cap **fisso** a 3 basta e ora morde; la quota proporzionale è una variabile in più senza effetto utile |
| **iniezione** (§4.1 rev. 1) | con un floor di `qu` c'è già disponibilità; il gate seleziona |
| **flussi per fascia / floor per fascia** (§4.9.2 rev. 1) | il gate opera *dopo* la classificazione: nessun flusso dedicato |
| **gate post-hoc a due passate** (§4.6 rev. 1) | serve solo se si cambiano i *parametri di generazione* per fascia. Un **filtro di accettazione** non cambia `D` né i confini k-means → una sola passata |
| **`h` globale a floor alto** | alza la quota di `h` e fa crollare la validità per struttura; si sostituisce con il peso posizionale calibrato (§3.4) |

**Il `rareCap: 3` resta** (punto 1 della correzione). Con il floor leggero le rare
per griglia restano basse e il tetto non viene raggiunto: è una rete di sicurezza,
non più un vincolo attivo. Resta comunque fisso, non proporzionale.

---

## 3. Il disegno

### 3.1 `qu` non è una vocale

`ALE_VOWEL_TOKENS = {a,e,i,o,u}`. Allinea `ale` al full (`VOWELS = a e i o u`,
`q` non conta come vocale in `gridStructureIssues`) e libera il floor di `qu`
dal vincolo sulla banda vocali. Effetto da solo quasi nullo (la banda è 30–60%),
ma è il prerequisito dei punti 3.2.

### 3.2 `tokenFloor`: floor di campionamento in quota di cella

`tokenFloor: { qu: 0.006 }` significa "una cella su 167 è `qu`", **non** "il peso
di `qu` nel dizionario è 0,6%". Conversione esatta (un solo token floored):

```
w_qu = p · (Σf − f_qu) / (1 − p)
```

con `Σf = Σ_t f_t ≈ 7,494` (somma delle frequenze di dizionario dei 26 token),
`f_qu ≈ 0,0131`, `p = 0,003` → `w_qu ≈ 0,0225` (contro `f_qu ≈ 0,0131`: circa 1,7×).
La quota realizzata è esattamente `p`. **Attenzione**: usare `p` come peso
diretto (senza la conversione) realizza `p / (Σf − f_qu + p) ≈ 0,53%`, cioè
circa un ottavo del target (`Σf ≈ 7,5` fa da divisore); è l'errore più facile da
commettere.

Effetto misurato (simulazione token + struttura, 20.000 griglie):

| scenario | validità 4/5/6 | `Qu` 4/5/6 | `h` | `z` |
| --- | --- | --- | --- | --- |
| base | 58 / 65 / 67% | 2 / 4 / 6% | 4 / 8 / 11% | 18 / 26 / 36% |
| `qu=4%` | 55 / 60 / 57% | **44 / 58 / 71%** | 4 / 6 / 9% | 17 / 24 / 31% |

Il floor di `qu` è la vittoria facile: costo di validità quasi nullo, presenza
che passa da ~3% a 44–71%.

### 3.3 `rareByTier`: gate dopo la classificazione

Nuovo campo dei rail:

```ts
rareByTier: {
  facile:    { max: 1 },   // poche rare
  normale:   {},           // nessun vincolo
  difficile: { min: 1 },   // almeno una tra h/z/qu
} | null
```

Applicato in `nextAleCandidate` **dopo** `tierForDifficulty` e il controllo della
banda di parole:

```ts
if (rails.rareByTier) {
  const rule = rails.rareByTier[difficulty];
  const rare = grid.tiles.filter((t) => ALE_RARE_TOKENS.has(t.letter === 'q' ? 'qu' : t.letter)).length;
  if ((rule.min !== undefined && rare < rule.min) ||
      (rule.max !== undefined && rare > rule.max)) {
    if (stats) stats.tierRareOut++;
    return null;
  }
}
```

**Non è circolare.** `D` e i confini k-means restano quelli della popolazione
non filtrata; il gate scarta solo alcune accettazioni. La calibrazione resta
**single-pass**. Le bande di parole per fascia, calcolate sui membri non filtrati,
restano valide: nel prototipo tutti i secchi si riempiono senza ripieghi.

### 3.4 `h`: peso posizionale calibrato sulle frequenze naturali

Requisito (correzione 2): il boost di `h` non deve gonfiare la sua frequenza;
deve solo **smistare** le `h` naturali sulle celle strutturalmente valide.
Definizioni:

- `f_h ≈ 0,0698` (quota di voci di `Dict'` con `h`); `m_h = f_h / Σf ≈ 0,93%`
  è la **marginale naturale di cella**.
- Una cella è **sacrificabile** se è una consonante comune (non `c`/`g`, che fanno
  da ancora, non rara `h`/`z`/`qu`, non straniera) e ha un `c` o un `g` in una
  delle 8 celle adiacenti.
- Sia `P` la frazione di celle sacrificabili della griglia (si calcola **per
  griglia**, non serve registrarla in provenance).

Implementazione in **due fasi** (non serve campionare in ordine):

1. fase 1: si campionano tutte le celle con peso di `h` = 0;
2. fase 2: ogni cella sacrificabile è promossa a `h` con probabilità
   `q = min(1, hBoost · m_h / P)`.

Così `E[#h] = N · P · q = N · m_h · hBoost`: **stesso numero atteso di `h` di un
campionamento naturale**, ma tutte su celle valide. La struttura non scarta più
`h senza c/g` (le reiezioni scendono a **zero**), quindi la presenza per griglia
sale da ~4–11% a ~14–28% (4×4→6×6) *senza* alterare le altre lettere. `h`
continua a contare nel `rareCap` (con marginale naturale contribuisce raramente).

Regole:
- **non** usare un floor assoluto alto per `h` (è ciò che fa crollare la validità);
- il moltiplicatore esplicito `hBoost ≥ 1` (default 1) permette di alzare il
  target `m_h · hBoost`, tenuto basso e documentato;
- `c` e `g` non sono mai promosse: restano le ancore della struttura.

### 3.5 Cap fisso a 3

`rareCap: 3` invariato. Con il floor all'1% + gate le rare per griglia restano
basse (medie 0,2–1,4): il tetto fa da rete di sicurezza e **non viene mai
raggiunto** nei flussi di produzione (0 reiezioni “>3 rari”). Nessuna quota
proporzionale (`rareRate`/`rareCapMin`/`rareCapMax`).

---

## 4. Misure del prototipo

Le misure di esplorazione (simulazione token + struttura, 20.000 griglie) sono
servite a scegliere le leve, non i valori finali. Il floor definitivo è stato
scelto **molto leggero (0,6%)** per non far dominare `qu`: porta la presenza su
difficile nel 7–27%, lasciando `h` e `z` come rare dominanti. I numeri finali del
catalogo (4/5/6×6, `tokenFloor.qu = 0,6%`, `h` posizionale, 5000 campioni) sono
in [`report/ale.md`](./ale.md) §4.

Le tabelle seguenti restano come **storico** della taratura (floor 4%, `h` non
ancora posizionale):

| dim | fascia | senza gate: `Qu` / rare medie | **con gate: `Qu` / anyRare / rare medie** |
| --- | --- | --- | --- |
| 4×4 | facile | 60% / 1,27 | 33% / 47% / 0,47 |
| | normale | 53% / 0,93 | 53% / 60% / 0,93 |
| | difficile | 40% / 0,47 | **80% / 100% / 1,20** |
| 5×5 | facile | 87% / 1,33 | 67% / 93% / 0,93 |
| | normale | 60% / 1,13 | 60% / 73% / 1,13 |
| | difficile | 47% / 0,80 | **80% / 100% / 1,33** |
| 6×6 | facile | 73% / 1,87 | 53% / 73% / 0,73 |
| | normale | 87% / 1,60 | 87% / 93% / 1,60 |
| | difficile | 67% / 1,67 | **80% / 100% / 1,87** |

Lettura:

- **Senza gate** le rare restano anti-correlate (facile > difficile): conferma del §1.
- **Con gate** l'ordine si rovescia (`rare medie` facile < normale < difficile) e
  `difficile` ha `anyRare = 100%`, con `Qu` all'80% in tutte le dimensioni.
- Costo: 229 / 254 / 356 tentativi per 45 schede; `noGrid` e ripieghi invariati.

---

## 5. Implementazione

### 5.1 `AleGuardRails` (bozza)

```ts
export interface AleGuardRails {
  vowels: { min: number; max: number } | null;

  /** Floor di campionamento per token, in QUOTA DI CELLA (non di dizionario). */
  tokenFloor: Partial<Record<'h' | 'z' | 'qu', number>> | null;

  /** Marginale naturale di h + peso posizionale su celle adiacenti a c/g. */
  hNearCG: boolean;
  /** Moltiplicatore del target di h (1 = frequenza naturale). */
  hBoost?: number;

  /** Gate di presenza rari DOPO la fascia: contiene {min,max}. null = nessuno. */
  rareByTier: Record<Difficulty, { min?: number; max?: number }> | null;

  /** Tetto FISSO alle celle rare (h+z+qu). Resta 3. */
  rareCap: number | null;

  structure: boolean;
  noUncoveredLines: boolean;
  anchorMinLength: Record<GridSize, number> | null;
}

export const DEFAULT_ALE_GUARD_RAILS: AleGuardRails = {
  vowels: { min: 0.3, max: 0.6 },
  tokenFloor: { qu: 0.006 },
  hNearCG: true,
  hBoost: 1,
  rareByTier: { facile: { max: 1 }, normale: {}, difficile: { min: 1 } },
  rareCap: 3,
  structure: true,
  noUncoveredLines: true,
  anchorMinLength: { 4: 6, 5: 7, 6: 8 },
};
```

### 5.2 Funzioni

- `ALE_VOWEL_TOKENS = {a,e,i,o,u}`.
- `sampleTokens(freq, count, rng, floors?)`: peso del token floored dalla
  conversione esatta del §3.2 (`w = p·(Σf−f_t)/(1−p)`), gli altri invariati.
- `sampleTokensPositional(...)` / due fasi per `h` (§3.4), con `P_eff` da
  provenance o misurato.
- `nextAleCandidate`: gate `rareByTier` dopo la banda di fascia; nuovo contatore
  `stats.tierRareOut`.
- `AleGuardRails`/`AleGenerationStats` aggiornati; `report:ale` mostra
  presenza `Qu/h/z` e rare medie **per fascia**.

### 5.3 Calibrazione

- `DEFAULT_ALE_GUARD_RAILS` cambia → il confronto deep-equal in
  `committedCalibration` (runtime, `apps/server/src/ale.ts`) **invalida da solo**
  la vecchia `calibration.json`.
- Rigenerare (5000 campioni) e aggiornare provenance (`guardRails`, eventuale
  `hNearCG`/`hBoost`).

---

## 6. Tappe

> **Stato**: Tappa 0, Tappa 1 e Tappa 2 **fatte** (v0.40.0): `qu` fuori dalle
> vocali, `tokenFloor.qu = 0,6%`, `rareByTier`, `h` posizionale (`hNearCG`), cap
> fisso 3, calibrazione 5000, schede rigenerate. Numeri in
> [`report/ale.md`](./ale.md).

1. **Tappa 0 — `qu` fuori dalle vocali** (§3.1). ✅
2. **Tappa 1 — floor `qu` + gate `rareByTier`** (§3.2, §3.3). ✅
   Risultato: `difficile` con `anyRare = 100%`, rare medie ordinate
   facile < normale < difficile; 15/15 in banda, zero ripieghi.
3. **Tappa 2 — `h` posizionale calibrata** (§3.4). ✅
   Risultato: reiezioni “h senza c/g” a zero, `h` nello 0–33% delle schede senza
   alterarne la frequenza aggregata; 15/15 in banda, zero ripieghi, riproduzione
   15/15.
4. **Chiusura**: aggiornare `docs/algoritmi/ale.md`, `report/ale.md`, questo
   piano, `apps/web/src/version.ts`; test; copia bundle (`copy-schede.mjs`). ✅

---

## 7. Criteri di accettazione

- k-means k=3 converge in tutte le dimensioni, nessun `perTierFallback`.
- 15/15 schede per fascia in banda globale + fascia, zero ripieghi.
- **Presenza**: `difficile` con almeno una rara su 15/15 (`anyRare = 100%`),
  `Qu ≥ 50%`; rare medie ordinate facile < normale < difficile.
- `rareCap = 3` invariato; nessuna griglia con > 3 rare.
- Nessuna regressione su parole, ancore, struttura; riproduzione 15/15 vs catalogo
  dopo la rigenerazione.
- `h` posizionale: nessuna `h` senza `c`/`g`; frequenza aggregata di `h`
  compatibile con la naturale (target `m_h`, entro tolleranza).

---

## 8. Rischi e note

- **Bias del floor `qu`**: alza `qu` sopra la frequenza di dizionario, di
  proposito; le altre lettere restano invariate (cambia solo la normalizzazione).
  Da dichiarare nel report.
- **Gate e disponibilità**: il gate scarta candidati `difficile` senza rare. Nel
  prototipo i secchi si riempiono senza ripieghi; in produzione monitorare
  `tierRareOut` e l'eventuale fallback rilassato.
- **`h` posizionale**: `P_eff` va misurato per dimensione; se la frazione di celle
  idonee è bassa su 4×4, `q` cresce e la coda destra di `h` può avvicinarsi al cap.
  Tenere `hBoost` basso.
- **`qu` vocale+raro**: risolto escludendolo dalla banda vocali (§3.1).

---

## Appendice — storia (rev. 1, superata)

La rev. 1 proponeva: cap proporzionale, iniezione, `hqChance` stile full, floor
per fascia con flussi dedicati e gate a calibrazione a due passate. Le misure
(token + struttura) che la motivavano restano valide e sono riassunte in §3.2 e
§4; le parti impiantistiche sono state sostituite dal disegno a gate + floor del
§3. In particolare:

- il **cap proporzionale** non serve: basta il cap fisso 3, che *dopo* il floor
  di `qu` morde davvero;
- la **calibrazione a due passate** non serve: un filtro di accettazione non
  modifica `D`, quindi non sposta i confini delle fasce.

### File toccati (previsione)

- `packages/shared/src/schedaAle.ts` — rail, floor, gate, `h` posizionale,
  `nextAleCandidate`, `calibrateAle`;
- `apps/server/src/ale.ts` — `committedCalibration` (già copre i nuovi rail);
- `apps/server/scripts/gen-schede-ale.ts`, `report-ale.ts` — provenance e diagnosi;
- `packages/dictionary/data/ale/calibration.json` — rigenerata;
- `packages/shared/schede/schede-*.json` — rigenerate;
- `docs/algoritmi/ale.md`, `docs/algoritmi/report/ale.md`, questo piano;
- `apps/web/src/version.ts` — changelog.
