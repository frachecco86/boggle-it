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

> **Principio guida.** Due livelli distinti, da non confondere:
> - **livello CAMPIONE** (quanti token rari *entrano* nella griglia): è qui che
>   agiscono frequenze e quote. Decide il carattere della griglia.
> - **livello VERIFICA** (quali griglie si *accettano*): i guard rails attuali.
>
> La raccomandazione pratica è lavorare **sul campione** (probabilità per token,
> per difficoltà), tenendo i guard rails come rete di sicurezza. Questo evita la
> circolarità di §4.6 perché `D` si calcola normalmente dopo.
>
> **Aggiornamento (§4.9)**: dopo una simulazione su 20.000 griglie la
> raccomandazione è cambiata — floor **globali** (`quShare`/`hShare`), `h`
> **condizionata** a `c`/`g`, **cap 3 invariato**, niente cap proporzionale. Le
> sezioni 4.0–4.8 restano come proposta iniziale; §4.9 è la versione misurata.

### 4.0 Vocabolario: "iniettare" vs "floored probability"

Prima di tutto, chiarire cosa vuol dire "iniettare" — è il punto che genera
confusione.

- **Floored probability (`pMin`)**: NON si tocca il campione a posteriori. Si
  cambia il *peso* con cui un token può uscire dall'urna. Oggi il peso di `qu` è
  la sua frequenza in `Dict'` (1,31%, che dopo la normalizzazione sui 26 token
  diventa **0,18%** di probabilità per cella). Con un floor `pMin(qu) = 3%` ogni
  cella ha il 3% di probabilità di essere `qu` invece dello 0,18%: nessuna
  garanzia, solo molto più probabile. Resta **campionamento**, quindi la
  distribuzione delle altre lettere non cambia (a meno di rinormalizzare), e non
  serve alcuna logica di sostituzione.
- **Iniezione**: si campiona normalmente e POI, se il token richiesto manca, si
  **sovrascrive** una cella esistente (scelta con l'rng tra quelle "sacrificabili",
  es. consonanti non rare e non in `c`/`g`). È una garanzia dura: a fine
  iniezione la griglia contiene quel token. Costa poco ed è deterministica; il
  prezzo è che la cella sovrascritta perde la lettera che aveva (e quindi qualche
  parola che quella cella abilitava).
- **`hqChance` stile full**: è un ibrido — con probabilità `p` si decide che la
  griglia DEVE avere `qu` (e/o `h`); il come (iniezione) è un dettaglio.

**Non si inietta "prima del campionamento"**: l'iniezione avviene sempre DOPO
(il campionamento occupa tutte le celle, non c'è posto "prima"). Quello che si
può fare *prima* è cambiare i **pesi** (floored probability) — ed è l'opzione più
pulita.

### 4.1 Cosa vuol dire "mettere una `h` vicino a `c`/`g`"

La regola di struttura (`gridStructureIssues`) scarta una `h` che non ha una
`c` o una `g` in una delle 8 celle adiacenti. Quindi una `h` "da sola" è una
cella morta e viene buttata. Due modi per rispettare la regola:

1. **Bias posizionale nel campionamento (preferito)**: invece di aumentare solo
   `p(h)`, si aumenta la probabilità di `h` **solo quando** la cella è adiacente
   a una `c`/`g` già presente. In pratica si campiona cella per cella: il peso di
   `h` è `pMin(h)` se vicino a `c`/`g`, altrimenti `p(h)` naturale (o zero). Così
   le `h` che escono sono quasi tutte valide e non si sprecano tentativi. Richiede
   di campionare in ordine (non più `sampleTokens` indipendente per cella) e di
   guardare il vicinato già riempito — più codice, ma nessuna sovrascrittura.
2. **Iniezione della coppia (semplice)**: dopo il campionamento, si cerca una
   `c`/`g` e si sovrascrive una cella adiacente libera con `h`. Garantisce la
   coppia in un colpo solo. Meno elegante (cambia una cella), ma banale da
   implementare e testare.

In entrambi i casi la `h` non va contata come vocale (non lo è) e concorre al
`rareCap` proporzionale.

### 4.2 `qu` NON è una vocale (decisione)

**Proposta: rimuovere `qu` da `ALE_VOWEL_TOKENS`.** Oggi `ALE_VOWEL_TOKENS` =
`{a,e,i,o,u,qu}` e `ALE_RARE_TOKENS` = `{h,z,qu}`: `qu` è in entrambi.
Conseguenze di tenerlo vocale:

- ogni `qu` che si aggiunge spinge la **quota vocali** verso l'alto (un token in
  più, e su 4×4 ogni token è il 6,25%: due `qu` fanno +12,5%);
- la banda 30–60% diventa un vincolo che **limita** la presenza di `qu`: più
  `qu` ⟹ più griglie respinte per "vocali fuori banda". È esattamente il motivo
  per cui forzare `qu` oggi è difficile.

Rimuoverlo dalla banda vocali:

- allinea `ale` al **full**, dove `VOWELS = a e i o u` e la `q` **non** conta
  come vocale nella regola di struttura (la nota in `gridStructureIssues` lo dice
  esplicitamente);
- libera la presenza di `qu` dal vincolo, quindi il floor `pMin(qu)` non sfora la
  banda;
- `qu` resta un **raro** a tutti gli effetti (conta in `rareRate`), coerente con
  il suo effetto sul gioco (poche parole con `qu`).

Rischio: cambiare `ALE_VOWEL_TOKENS` cambia la banda effettiva di un po' di
griglie → i confini delle fasce cambiano → **va rifatta la calibrazione** (come
per ogni rail). È un cambio piccolo ma va messo nello stesso passo della
presenza, non dopo.

### 4.3 Cap proporzionale (obiettivo B) — misurato: da solo non cambia nulla

Dati reali (5000 griglie valide per dimensione, campione con i rail attuali):

| dim | 0 rare | 1 | 2 | 3 | media | max osservato |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 76,7% | 20,6% | 2,6% | 0,1% | **0,26** | 3 |
| 5×5 | 65,8% | 27,7% | 5,7% | 0,8% | **0,42** | 3 |
| 6×6 | 52,2% | 34,4% | 11,1% | 2,3% | **0,63** | 3 |

Con `rareCap(size) = clamp(round(rareRate·cells), min, max)` e `rareRate = 0.10`:

| dim | celle | cap OGGI | cap proposto | quota oggi | quota proposta |
| --- | --- | --- | --- | --- | --- |
| 4×4 | 16 | 3 | **2** | 18,8% | 12,5% |
| 5×5 | 25 | 3 | **3** | 12,0% | 12,0% |
| 6×6 | 36 | 3 | **4** | 8,3% | 11,1% |

**Il cap attuale non morde mai** (max osservato = 3, raggiunto nello 0,1–2,3% dei
casi). Quindi il cap proporzionale, **da solo, è un no-op comportamentale**: serve
solo a dare una semantica uniforme. Diventa rilevante **solo dopo aver alzato la
presenza** (`pMin`/iniezione): a quel punto i conteggi si avvicinano al cap e il
valore proporzionale decide quante rare si vedono davvero. Va quindi tarato
**insieme** al floor, non prima.

### 4.4 Presenza: le tre leve e quando usarle

| leva | garanzia | costo | quando |
| --- | --- | --- | --- |
| **floored probability** (`tokenFloor`) | morbida (più probabile, non certo) | ~0 (cambia i pesi) | default per `qu`/`h`/`z` |
| **bias posizionale** (`hNearCG`) | morbida, ma quasi tutte valide | medio (campionamento in ordine) | `h` |
| **iniezione** (`presence`) | dura (≥ N) | basso, ma sacrifica una cella | quando serve la garanzia |

### 4.5 Numeri indicativi per i floor (da tarare)

Dati misurati (campionamento naturale, validi):

| token | peso normalizzato (prob. cella) | celle attese 4×4 / 6×6 | P(≥1) 4×4 / 6×6 (osservata) |
| --- | --- | --- | --- |
| `z` | 1,29% | 0,21 / 0,46 | 17,9% / 37,1% |
| `h` | 0,93% | 0,15 / 0,33 | 4,2% / 11,1% |
| `qu` | **0,18%** | 0,029 / 0,065 | **2,5% / 5,9%** |

Per portare `qu` al 50% delle griglie: su 4×4 serve una prob. cella ≈
`1 − 0,5^(1/16)` ≈ **4,2%** (≈23× il naturale); su 6×6 ≈ **1,9%**. Ecco perché
il floor va **per dimensione o comunque alto**.

Proposta di floor **per difficoltà** (da validare con una run di misura):

| fascia | `pMin(qu)` | `pMin(h)` | `pMin(z)` | note |
| --- | --- | --- | --- | --- |
| facile | 0 | 0,5% | 0 | poche rare, come oggi |
| normale | 1,5% | 2% | 0 | qualche `qu`/`h` |
| difficile | 4% | 3% | 0 | `qu` garantito in pratica |

Questi floor sono "di campionamento", quindi **non circolari**: `D` si calcola
dopo, normalmente. È la versione "C" a basso rischio (il gate post-hoc di §4.6
resta l'alternativa pesante).

### 4.6 Gate per fascia post-hoc (solo se i floor non bastano)

La fascia è un **risultato**, quindi regole "per difficoltà" applicate DOPO
(dentro `nextAleCandidate`) sono auto-referenziali: se il gate cambia quali
griglie finiscono in una fascia, i confini k-means calcolati senza gate non
valgono più. Serve una **calibrazione auto-consistente a due passate**:

1. campione con i rail di generazione (senza gate) → k-means → fasce provvisorie;
2. applica i gate `byTier` usando le fasce provvisorie, ricalcola range/k-means/bande;
3. ripeti (2) finché i confini non si muovono (1–2 iterazioni).

Raccomandazione: **implementare prima i floor (4.5)**, che non hanno questo
problema; usare i gate solo se i floor non danno la separazione voluta.

### 4.7 Tabella indicativa complessiva (da tarare)

| fascia | rare (h+z+qu) | `qu` | `h` | `z` |
| --- | --- | --- | --- | --- |
| facile | 0–1 | raro | raro | libero (come oggi) |
| normale | 1–2 | qualche | qualche | libero |
| difficile | 2–`rareCap` | frequente | frequente, vicino a c/g | ≥ 1 |

### 4.8 Nuovi campi di `AleGuardRails` (bozza)

```ts
export interface AleGuardRails {
  vowels: { min: number; max: number } | null;

  /**
   * Floor di probabilità per token, in quota di CELLA (non di dizionario).
   * Sostituisce/aumenta temporaneamente il peso di campionamento.
   * Es. { qu: 0.02, h: 0.03, z: 0.02 }.
   */
  tokenFloor: Partial<Record<'qu' | 'h' | 'z', number>> | null;

  /** Se true, la `h` sale di peso solo vicino a c/g (bias posizionale). */
  hNearCG: boolean;

  /**
   * Presenza garantita via iniezione (dopo il campionamento), indipendente
   * dalla difficoltà. `null` = nessuna garanzia dura.
   */
  presence: { qu?: number; h?: number; z?: number } | null;

  /** Tetto alle celle rare (h+z+qu), proporzionale al numero di celle. */
  rareRate: number | null;
  rareCapMin: number;
  rareCapMax: number | null;

  structure: boolean;
  noUncoveredLines: boolean;
  anchorMinLength: Record<GridSize, number> | null;

  /** Override per fascia applicati DOPO la fascia naturale (solo se serve, §4.6). */
  byTier?: Record<Difficulty, {
    tokenFloor?: Partial<Record<'qu' | 'h' | 'z', number>>;
    presence?: { qu?: number; h?: number; z?: number };
    rareRange?: { min: number; max: number };
  }> | null;
}
```


### 4.9 Simulazione (20.000 griglie) e decisioni riviste

Per scegliere i numeri ho simulato il **livello token + struttura** (vocali senza
`qu`, cap rare, `gridStructureIssues`) su 20.000 griglie per combinazione. NON
include copertura/ancora, che filtrerebbero ancora: i valori di validità sono
quindi un **limite superiore**.

| scenario | Qu 4/5/6 | h 4/5/6 | validità 4/5/6 |
| --- | --- | --- | --- |
| base (`qu` non vocale, nessun floor) | 2,5 / 3,9 / 5,7% | 4,3 / 7,5 / 11,6% | 58 / 64 / 66% |
| `qu=h=1,5%`, cap 3 | 20 / 30 / 39% | 7 / 11 / 17% | 54 / 57 / 56% |
| **`qu=4%, h=0`, cap 3** | **44 / 60 / 72%** | 4,0 / 6,5 / 9,2% | 56 / 59 / 56% |
| `qu=4%, h=4%`, cap 3 | 44 / 58 / 68% | 16 / 25 / 33% | **40 / 35 / 26%** |
| `qu=4%, h=4%`, cap 5 | 44 / 59 / 73% | 16 / 26 / 37% | 41 / 37 / 33% |

**Lettura:**

1. **Togliere `qu` dalle vocali** non cambia quasi nulla da solo (base ≈ com'era),
   ma è il prerequisito perché il floor di `qu` non sfori la banda vocali.
2. **Il floor di `qu` è economico**: `qu=4%` porta `Qu` a 44–72% e la validità
   resta ~56–59%; il cap 3 non morde (rare medie 0,77–1,57). È la vittoria facile.
3. **Il floor di `h` globale è costoso**: passare `h` da 1,5% a 4% fa crollare la
   validità (6×6: 56% → 26%) e **alzare il cap 3→5 non recupera** (26% → 33%):
   il collo di bottiglia diventa `struttura` (le `h` isolate), non il cap. Quindi
   la `h` va **condizionata alla vicinanza di `c`/`g`** (§4.9.1).
4. **Il cap 3 va bene così**: con `qu`-floor (o `h` condizionata) non morde quasi
   mai. Il cap proporzionale di §4.3 diventa **inutile** in questo disegno: una
   variabile in meno. Resterebbe necessario solo se si insiste su `h` globale 4%.

#### 4.9.1 "Preservare le frequenze": che unità ha il floor?

Ci sono **tre unità** diverse nascoste in "4%", e vanno distinte:

- **(a) floor di estrazione su tutte le celle** — quello simulato. La marginale
  *accettata* è più bassa, perché le `h` isolate vengono scartate.
- **(b) probabilità condizionata a una cella adiacente a `c`/`g`** — ogni `h`
  prodotta è valida, ma la marginale realizzata è `q · P(adiacente)`.
- **(c) marginale obiettivo sulle griglie accettate** — "il 4% delle celle è `h`".
  È la più interpretabile.

La via pulita è **(c) implementata via (b)**: se si vuole marginale `m`, poiché
`h` può stare solo accanto a `c`/`g`,

```
q = m / P(cella adiacente a un c/g)
```

Con `m=1,5%` e `P_adj≈0,34` su 4×4: `q≈4,4%`. Con `m=4%`: `q≈11,8%`. Su 6×6
`P_adj` è più alta, quindi serve `q` più basso. Così **tutte le `h` sono valide** e
la reiezione per struttura sparisce.

**Cosa significa "preservare le frequenze".** Il **peso base** di ogni token
resta la frequenza di dizionario (`h` 0,93%, `qu` 0,18%); il floor subentra solo
quando il target `m` lo supera. Gli altri token non cambiano distribuzione (cambia
solo la normalizzazione). Non si può insieme "floor a 4%" e "restare a 0,18%":
sono alternativi; "preservare" vale per le lettere non targettate.

Per questo conviene esporre il parametro come **quota obiettivo** (`quShare`,
`hShare`), non come probabilità di estrazione: è l'unità che si vuole davvero, e
il codice la converte in `q`.

#### 4.9.2 Difficoltà: `byTier` non è applicabile al volo

Nel flusso a tre secchi la fascia **non è nota al momento della generazione** (è
un output di `D`). Quindi un `byTier.tokenFloor` non si può applicare direttamente.
Tre strade:

1. **Floor globali** (nessuna circolarità): es. `quShare=4%`, `hShare=1,5%`
   condizionata. Tutti i secchi prendono rare, i centri si ri-calibrano. **Da
   provare per primo.**
2. **Flussi per fascia-target**: per ogni fascia si genera con il floor di quella
   fascia e si accetta solo se `D` cade nella fascia. Controllo reale per fascia,
   ma reintroduce gli scarti "difficoltà fuori fascia" e complica la calibrazione.
3. **Gate post-hoc + calibrazione auto-consistente** (§4.6): massimo controllo,
   massima complessità. Solo se 1 e 2 non bastano.

**Raccomandazione finale (rivista dopo la simulazione):**

- **Tappa 0**: `qu` fuori dalle vocali.
- **Tappa 1**: `quShare` globale (≈4%) + `hShare` condizionato a `c`/`g` (≈1,5%,
  poi alzabile), **cap 3 invariato**.
- **Misura**: presenza `Qu`/`h`/`z` per fascia e dimensione, validità, word count.
- **Tappa 2 (solo se serve)**: floor per fascia con la strada 2.
- Il **cap proporzionale si scarta**, salvo che si torni a `h` globale alta.

---

## 5. Piano di implementazione a tappe

Ogni tappa: **cambio rail → test → ricalibrazione 5000 → report → misura**.

1. **Tappa 0 — `qu` fuori dalla banda vocali** (§4.2, §4.9)
   - `ALE_VOWEL_TOKENS = {a,e,i,o,u}`; test aggiornati; misura della deriva delle
     bande. È il prerequisito dei floor su `qu`.
2. **Tappa 1 — quote obiettivo globali** (§4.9.1)
   - `quShare ≈ 4%` (floor globale) e `hShare ≈ 1,5%` **condizionata a `c`/`g`**
     (conversione `q = m / P_adj`); `tokenFloor`/`hNearCG` come implementazione.
   - **Cap 3 invariato** (§4.9).
   - Verifica: presenza `Qu`/`h`/`z` e validità per dimensione.
3. **Tappa 2 — floor per fascia** (§4.9.2) — solo se i floor globali non danno la
   separazione voluta; strada 2 (flussi per fascia-target), non gate post-hoc.
4. **Tappa 3 — iniezione/presenza dura** (§4.1) — solo se i floor non bastano a
   garantire `Qu` su difficile.
5. **Tappa 4 — gate per fascia post-hoc** (§4.6) — ultima spiaggia, calibrazione a
   due passate.
6. **Chiusura**: `report:ale` aggiornato (presence per fascia, rare per fascia),
   docs (`docs/algoritmi/ale.md`, `report/ale.md`, questo piano), changelog, test.

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
