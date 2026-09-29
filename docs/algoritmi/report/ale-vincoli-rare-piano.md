# Piano — vincoli sulle lettere rare nell'algoritmo `ale`

> Stato: **proposta da discutere**, nessuna modifica al codice.
> Obiettivo: portare in `ale` i vincoli di *presenza* delle lettere rare che ha
> il "full criteria" (`hqChance`, `rareMin`), rendere il tetto delle rare
> **proporzionale** alla griglia e valutare vincoli **dipendenti dalla difficoltà**.

---

## 1. Stato attuale

### 1.1 Guard rails di `ale` (`AleGuardRails`, `schedaAle.ts`)

| campo | valore | semantica |
| --- | --- | --- |
| `vowels` | `{min:0.3, max:0.6}` | banda quota vocali (`qu` conta come vocale) |
| `rareCap` | `3` | **tetto assoluto** di celle rare totali tra `h`, `z`, `qu` |
| `structure` | `true` | `gridStructureIssues`: `h` solo con `c`/`g` adiacente, ecc. |
| `noUncoveredLines` | `true` | ogni riga/colonna attraversata da una parola |
| `anchorMinLength` | `{4:6, 5:7, 6:8}` | almeno una parola lunga |

`rareCap` è **solo un tetto**: non esiste alcun minimo. La generazione campiona i
token per frequenza di dizionario e poi **scarta**, non compone.

### 1.2 Cosa fa il "full criteria" (`FULL_COMPOSITION`, `grid.ts`)

| campo | effetto |
| --- | --- |
| `hqChance` (0,17 / 0,30) | con probabilità data **inserisce** una `h` e una `q` (che/chi, qui/qua) |
| `rareMin: 1` (difficile) | **obbliga** almeno una `z` |
| `rareMax` (0,03 / 0,12) | tetto alle `z`, **in quota** sulla griglia |

### 1.3 Misure sul catalogo (base `packages/shared/schede`)

| variante | schede con `Qu` | schede con `h` |
| --- | --- | --- |
| standard | 8% | 11% |
| **full** | **29%** | 11% |
| **ale** | **3%** | **3%** |

Frequenze dei token in `Dict'`: `qu` **1,31%** (21° su 26), `h` **6,98%** (20°),
`z` **9,67%** (19°). Il campionamento per frequenza, da solo, rende `qu` quasi
assente.

---

## 2. Obiettivi

1. **A — Presenza minima**: garantire (o rendere probabile) almeno un `qu`,
   un `h` e/o una `z` in una frazione controllata di schede, come fa
   `hqChance`/`rareMin` per il full.
2. **B — `rareCap` proporzionale**: sostituire il tetto assoluto `3` con un
   valore legato al numero di celle (oggi è severo su 4×4 e permissivo su 6×6).
3. **C — Dipendenza dalla difficoltà**: far variare (alcuni) vincoli per fascia
   (facile / normale / difficile).

---

## 3. Problemi di progetto da risolvere

1. **Campionamento vs iniezione.** Per garantire un token raro:
   - *reiezione*: si continua a campionare finché il token c'è. Con `qu` all'1,3%
     servono ~75 tentativi medi per griglia → con la solve di copertura/ancora è
     troppo caro.
   - *iniezione*: dopo il campionamento si sostituisce qualche cella con il token
     richiesto (eventualmente con il suo contesto, es. `c`/`g` accanto alla `h`).
     È economica e deterministica, ma **altera la distribuzione per frequenza**:
     va scelto e documentato (bias intenzionale).
   - *misto*: iniezione per `qu`/`h`/`z`, reiezione per le combinazioni
     strutturali (`h` + `c`/`g`).
2. **`qu` ha doppio ruolo.** In `ALE_VOWEL_TOKENS` **e** in `ALE_RARE_TOKENS`:
   iniettare `qu` sposta la quota vocali (banda 30–60%) e il conteggio rare.
   Serve decidere: o si esclude `qu` dal conteggio vocali della banda, o si
   allarga la banda quando `qu` è presente, o si conta `qu` solo come raro.
3. **`h` richiede `c`/`g`.** Il rail `structure` scarta una `h` isolata: iniettare
   la `h` senza il contesto la fa scartare. Soluzione: iniettare `h` **con** una
   `c`/`g` adiacente, oppure iniettare solo la `h` e lasciare che la struttura
   filtri (spreco).
4. **La difficoltà è un OUTPUT, non un input.** In `ale` la fascia si assegna
   *dopo*, da `D = 0,5·R + 0,5·M` (e il full non ha questo problema perché
   compone con la difficoltà come input). Regole "per difficoltà" sono quindi
   **auto-referenziali**: cambiarle cambia `D`, che cambia la fascia.
   → Vedi §4.4.
5. **Ogni cambio ai rail invalida la calibrazione.** I rail sono confrontati
   deep-equal in `committedCalibration` (runtime): va rifatta la calibrazione con
   lo stesso campione (5000) e aggiornata la provenance.
6. **Determinismo.** L'iniezione deve usare l'rng del flusso (`seed + attempt`),
   non `Math.random`, per restare riproducibile.

---

## 4. Proposta

### 4.1 Nuovi campi di `AleGuardRails` (bozza)

```ts
export interface AleGuardRails {
  vowels: { min: number; max: number } | null;

  /** Tetto alle celle rare (h+z+qu). Proporzionale al numero di celle. */
  rareRate: number | null;        // es. 0.10 → 4×4≈2, 5×5≈3, 6×6≈4
  rareCapMin: number;             // clamp inferiore (es. 1)
  rareCapMax: number | null;      // clamp superiore opzionale

  /** Presenza minima (difficulty-blind, vale per tutte le fasce). */
  presence: { qu?: number; h?: number; z?: number } | null;

  /** Probabilità di forzare una coppia h+q (stile full), difficulty-blind. */
  hqChance: number | null;

  structure: boolean;
  noUncoveredLines: boolean;
  anchorMinLength: Record<GridSize, number> | null;

  /** Override per fascia, applicati DOPO l'assegnazione naturale della fascia. */
  byTier?: Record<Difficulty, {
    rareRange?: { min: number; max: number };  // celle rare totali
    presence?: { qu?: number; h?: number; z?: number };
  }> | null;
}
```

### 4.2 Cap proporzionale (obiettivo B)

```ts
rareCap(size) = clamp(round(rareRate * size * size), rareCapMin, rareCapMax)
```

- Risolve l'incoerenza attuale: **3 celle** = 18,8% su 4×4, 8,3% su 6×6.
- Con `rareRate = 0.10`: 4×4→2, 5×5→3 (2,5 arrotondato), 6×6→4.
- È lo stesso principio di `rareMax` del full (quota), ma su `h+z+qu`.
- Da tarare sui dati: misurare la distribuzione attuale di `h+z+qu` per
  dimensione e scegliere `rareRate`/clamp per **non** cambiare troppo le griglie
  già buone.

### 4.3 Presenza minima / `hqChance` (obiettivo A)

Due leve complementari:

- **`hqChance`** (probabilistico, come il full): con probabilità `p` la griglia
  deve contenere una `qu` (e/o una `h`). Implementazione: se assente dopo il
  campionamento, **iniezione** di `qu` (+ eventuale `c`/`g` per la `h`).
- **`presence`** (deterministico): minimi `qu?`, `h?`, `z?` sempre richiesti.

Pseudo-codice dentro `generateAleGrid` (dopo il campionamento, prima della
struttura):

```
tokens = sampleTokens(...)
if (rng() < hqChance && !tokens.includes('qu')) injectQu(tokens)
if (presence?.qu && count(tokens,'qu') < presence.qu) injectQu(tokens, ...)
if (presence?.h  && count(tokens,'h')  < presence.h)  injectH(tokens) // + c/g
if (presence?.z  && count(tokens,'z')  < presence.z)  injectZ(tokens)
// poi: rail vocali (ricalcolato), rareCap proporzionale, struttura, copertura, ancora
```

`injectQu`/`injectH` scelgono celle a basso costo (non vocali, non rare) usando
l'rng, e ricalcolano i contatori. Se non c'è spazio, il candidato si scarta.

**Decisione su `qu`**: propongo di **contarlo solo come raro** per la banda
vocali (oggi è anche vocale). Altrimenti forzare `qu` rischia di sforare il 60% di
vocali su griglie piccole. In alternativa, banda vocali leggermente allargata.

### 4.4 Dipendenza dalla difficoltà (obiettivo C) — il punto critico

La fascia è un **risultato**, quindi distinguo due famiglie:

- **(C1) Vincoli di composizione decisi prima** (token/celle). Possono dipendere
  dalla difficoltà solo se questa è un **target** in ingresso. Ma la generazione
  attuale è a tre secchi, senza target: si assegna la fascia naturale. Imporre
  composizioni diverse per fascia **non separa `D`** (misurato: `corr(#rare, D)`
  ≈ −0,11…−0,18). Quindi C1 da solo non basta.
- **(C2) Gate applicati DOPO l'assegnazione naturale**, dentro `nextAleCandidate`:
  dopo aver calcolato `D` e la fascia, si accetta il candidato solo se rispetta
  il vincolo di quella fascia (`byTier.rareRange`/`presence`).

**Circolarità (C2)**: se il gate cambia quali griglie finiscono in una fascia, la
distribuzione di `D` di quella fascia cambia → i confini k-means calcolati senza
gate non valgono più. Serve una **calibrazione auto-consistente** a due passate:

1. **Passata 1**: campione con i rail di generazione (senza gate) → k-means →
   fasce provvisorie.
2. **Passata 2**: applica i gate `byTier` al campione usando le fasce provvisorie,
   **ricalcola** range globale / k-means / bande per fascia sui superstiti.
3. Ripeti (2) finché i confini non si muovono (in pratica 1–2 iterazioni), oppure
   fissa i gate a un **proxy** stabile e accetta lo scostamento.

Questa logica va implementata in `calibrateAle` (o in una funzione
`calibrateAleWithTiers`) e usata **identicamente** in calibrazione e produzione,
pena l'invalidamento della provenance.

**Raccomandazione**: implementare prima A e B (difficulty-blind), che sono
semplici e non circolari; solo dopo valutare C con la calibrazione a due passate.
Se C non porta un guadagno misurabile sulla qualità delle schede, tenerla fuori.

### 4.5 Tabella indicativa (da tarare con misure)

| fascia | rare (h+z+qu) | presenza |
| --- | --- | --- |
| facile | 0–1 | — |
| normale | 1–2 | `qu` **oppure** `h` |
| difficile | 2–4 (dipende dalla dimensione) | `qu` o `h`, preferibilmente una `z` |

Numeri puramente indicativi: vanno scelti dopo aver misurato la distribuzione
reale e l'effetto su `R`, `M`, parole e ancore.

---

## 5. Piano di implementazione a tappe

Ogni tappa: **cambio rail → test → ricalibrazione 5000 → report → misura**.

1. **Tappa B — cap proporzionale**
   - `rareRate`/clamp in `AleGuardRails`; `rareCapOf(size)`.
   - Misurare la distribuzione attuale di `h+z+qu` per dimensione e scegliere i
     valori; aggiornare `provenance.guardRails`.
2. **Tappa A — presenza (`hqChance`, `presence`)**
   - Iniezione deterministica con rng; contesto per la `h`; decisione su `qu`
     come vocale/raro.
   - Verifica: quota di schede con `Qu`/`h`/`z` per fascia e dimensione.
3. **Tappa C — gate per fascia + calibrazione auto-consistente**
   - `byTier` in `nextAleCandidate` (dopo la fascia naturale) e in `calibrateAle`
     (due passate). Solo se A+B non bastano.
4. **Chiusura**: `report:ale` aggiornato (presence per fascia, rare per fascia),
   docs (`docs/algoritmi/ale.md`, `report/ale.md`, implementazione), changelog,
   test.

---

## 6. Criteri di accettazione (da confermare)

- k-means k=3 converge in tutte le dimensioni, nessun `perTierFallback`.
- 15/15 schede per fascia in banda globale + fascia, zero ripieghi.
- **Presenza**: `Qu` e `h` non più a ~3%; obiettivo da definire (es. `Qu` ≥ 50%
  su difficile, `h` ≥ 30%). `z` almeno una su difficile.
- Nessuna regressione su parole, ancore, struttura; riproduzione 15/15 vs catalogo.
- `R` media ordinata per fascia (facile < normale < difficile).

---

## 7. Rischi e domande aperte

- **Bias del campionamento**: l'iniezione rompe la distribuzione per frequenza
  (che è il fondamento di `ale`). Va resa esplicita nei commenti e nel report.
- **Costo**: l'iniezione è economica, la reiezione no; l'aggiunta del contesto
  `c`/`g` per la `h` può far fallire copertura/ancora più spesso → possibili
  ripieghi in più (da monitorare).
- **`qu` vocale+raro**: decisione da prendere (escluderlo dalla banda vocali?).
- **Difficoltà auto-referenziale**: la calibrazione a due passate è il punto più
  delicato; se instabile, C va abbandonato.
- **Interazione con i pesi/ρ**: la scala dei punteggi (ramo `nonlinear-score`)
  cambia `M`; i due rami vanno allineati prima di mischiare le due modifiche.

---

## 8. File toccati (previsione)

- `packages/shared/src/schedaAle.ts` — `AleGuardRails`, iniezione, `nextAleCandidate`, `calibrateAle`;
- `apps/server/src/ale.ts` — validazione `committedCalibration`;
- `apps/server/scripts/gen-schede-ale.ts`, `report-ale.ts` — provenance e diagnosi;
- `packages/dictionary/data/ale/calibration.json` — rigenerata;
- `packages/shared/schede/schede-*.json` — rigenerate;
- `docs/algoritmi/ale.md`, `docs/algoritmi/report/ale.md`, questo piano;
- `apps/web/src/version.ts` — changelog.
