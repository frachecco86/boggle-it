# Algoritmo `ale`

<!-- Parte di docs/algoritmi — vedi README.md per l’indice -->

Terza variante: pipeline a sé (campionamento per frequenza dei token, calibrazione e
generazione a tre secchi), non usa `SPECS`. Lessico, griglia, solver e formato:
[comune.md](./comune.md). Codice: `packages/shared/src/schedaAle.ts`; rigenerazione:
`pnpm --filter @boggle/server gen:schede:ale` (oppure dal **pannello admin**, tab
Schede → Genera → tipo `Ale`: stessa pipeline, eseguita dal server).

---

## L'algoritmo `ale`

Terza variante, dal documento *algoritmo schede "ale"*. È una pipeline **a sé**:
non usa `COMPOSITION`/`SPECS`, ma campionamento per frequenza e calibrazione.
Codice: `packages/shared/src/schedaAle.ts`; generazione:
`pnpm --filter @boggle/server gen:schede:ale` **oppure** dal pannello admin.

**Differenze sostanziali da `standard`/`full`:**

- **Lettere campionate per FREQUENZA dei token**, non composte a mano. La
  frequenza è la frazione di voci di `Dict'` che contengono il token.
- **`QU` è un TOKEN unico**: `quando` → `[QU, A, N, D, O]`, `acqua` →
  `[A, C, QU, A]`. L'alfabeto è di 26 simboli (nessuna `Q` isolata).
- **Difficoltà = `0.5·R + 0.5·M`** (composita), non la sola composizione della
  griglia:
  - `R` = **rarità ad anelli di frequenza** (vedi sotto), non più la quota
    binaria fuori da un vocabolario comune;
  - `M` = **ricchezza** della griglia, `1 − numero_parole / punteggio_board`: vale
    **0** se tutte le parole valgono 1 punto (tutte da 3 lettere) e cresce verso
    **1** quanto più il punteggio medio per parola è alto. Così una griglia di
    parole corte e frequenti è facile, e una con parole lunghe e rare è difficile.
- **Limiti calibrati**: da un campione di 2000 griglie si derivano l'intervallo
  globale di parole accettate (Tukey ristretto verso la mediana con `rho = 0,35`),
  le tre fasce di difficoltà (k-means k=3 sulla difficoltà COMPOSITA, con fallback
  ai tertili) e — novità — una **banda di parole per fascia**.
- **Generazione a tre secchi** (non più targeting per fascia): un solo flusso di
  candidati, ognuno classificato nella sua fascia naturale, finché i tre secchi
  non sono pieni.

**Pre-processing (`Dict → Dict'`):** accenti piegati, solo `a-z`, lunghezza ≥ 3
lettere, `q` solo se seguita da `u` (`iraq`, `soqquadro` scartate).

### Rarità `R`: anelli di frequenza (nuova metrica, `rings-v1`)

Fonte: `packages/dictionary/data/frequency-it.txt` (OpenSubtitles 2018), parole
giocabili ordinate per frequenza d'uso. Le righe si normalizzano con
`cleanAleWord` e **le posizioni contano solo per le voci valide**: le prime 5000
formano `ringEasy`, le prime 20000 (include `ringEasy`) formano `ringMedium`.
Detti `f0`, `f1`, `f2` le quote di parole trovate nei tre anelli (0 = top-5000,
1 = 5001–20000, 2 = oltre; `f0+f1+f2 = 1`):

```
R = (0·f0 + 1·f1 + 2·f2) / 2 = (f1 + 2·f2) / 2      ∈ [0, 1]
```

L'anello "raro" pesa doppio, quindi `R` è **graduata** invece che binaria. La
rarità media misurata è ~0,68 (4×4), ~0,72 (5×5), ~0,74 (6×6): più alta della
vecchia misura binaria, perché l'anello raro conta doppio. Le fasce si
ri-centrano da sole in calibrazione, quindi non servono ritocchi ai pesi.

**NVdB, `lemmas.br` e Morph-it non servono più alla pipeline ale.** Restano fonti
del dizionario principale (vedi `comune.md`), ma non entrano più in `R`.

### Radice/lemma (LEGACY)

> LEGACY: la definizione di "parola comune" basata su NVdB + radici/lemmi è stata
> **sostituita** dalla metrica ad anelli (`rings-v1`,
> [implementazione](./report/ale-full-implementazione.md) §1.2).
> `build-ale-lemmas.mjs`, `data/ale/lemmas.br` e `data/ale/nvdb.words.txt` sono
> conservati solo come storico e non sono più usati da `ale`.

La sezione che segue descrive la vecchia metrica, tenuta per riferimento.

NVdB conteneva i **lemmi** (`amare`), non tutte le forme flesse. Una parola era
quindi **comune** se lo era lei **oppure la sua radice** (lemma per forma,
formato `forma<TAB>lemma`). Le radici erano precalcolate in
`packages/dictionary/data/ale/lemmas.br`, che teneva solo le forme il cui lemma
era in `Common`. Senza la radice la rarità `R` era gonfiata dalla morfologia
(0,80/0,85/0,89); con la radice scendeva a ~0,56/0,58/0,59.

**Guard rails (ATTIVI, scelta di progetto):** banda vocali **30–60%** (`qu` NON
conta come vocale, come nel full), **al più 3 token rari H/Z/QU in totale**,
**struttura giocabile** (`gridStructureIssues`: consonanti non troppo lontane da
una vocale, al più una riga/colonna senza vocali, nessuna `h` senza `c`/`g`
accanto), **nessuna riga o colonna senza soluzioni** e almeno una **parola ancora**
(≥ 6/7/8 lettere su 4×4/5×5/6×6). Devono essere identici in calibrazione e
produzione: cambiarli invalida `calibration.json`.

Due rail aggiuntivi governano la **presenza delle lettere rare**:

- **`tokenFloor`** — floor di *campionamento* per token, in **quota di cella** (non
  di dizionario). Oggi `{ qu: 0.006 }`: circa una cella su 167 è `QU`, contro lo
  0,18% naturale del campionamento per frequenza. Il peso si converte con
  `w = p·(Σf−f_t)/(1−p)`, così la quota realizzata è esattamente `p`.
- **`rareByTier`** — gate di *accettazione* applicato in `nextAleCandidate` **dopo**
  che la fascia naturale è stata assegnata: `facile: { max: 1 }`, `normale: {}`,
  `difficile: { min: 1 }`. È un filtro, non cambia `D` né i confini k-means, quindi
  la calibrazione resta a una passata.
- **`hNearCG` / `hBoost`** — `h` posizionale. La `h` è esclusa dalla fase 1 del
  campionamento, poi è “promossa” solo su celle sacrificabili (consonanti comuni,
  non `c`/`g`, non rare) adiacenti a una `c`/`g`, con probabilità
  `q = hBoost · m_h / P` (`m_h = f_h/Σf ≈ 0,93%` è la marginale naturale di cella,
  `P` la frazione di celle sacrificabili). Così `E[#h] = N·m_h·hBoost`: la
  frequenza aggregata di `h` resta quella naturale, ma ogni `h` è in posizione
  valida e le reiezioni “h senza c/g” spariscono. Default `hBoost = 1`.

I due rail che richiedono il dizionario (copertura e ancora) condividono **una sola**
`solveGridCoverage`: l'ancora usa le `words` già restituite per la copertura, quindi
non costa risoluzioni aggiuntive. La struttura è invece una proprietà dei token, ma
richiede la griglia per l'adiacenza: si valuta prima della risoluzione.

Il guard rail di copertura è diverso dagli altri: non è una proprietà dei token ma
richiede di **risolvere** la griglia e verificare che ogni riga e ogni colonna sia
attraversata da almeno una parola (vedi `coverageIssues` / `solveGridCoverage`). Per
questo è più costoso e viene valutato **dopo** gli altri rail.

**Lettere non italiane (`j k w x y`):** fanno parte dei **26 token** dell'alfabeto,
da cui la spec dice di campionare, e in `Dict'` hanno frequenza piccola ma non
nulla. La regola di struttura le segnala se presenti (difesa in profondità), ma il
campionamento raramente le porta in griglia. Numeri e dettagli:
[`report/ale.md`](./report/ale.md).

### Bande di parole per fascia

Dopo il k-means, per ogni fascia si calcola il proprio intervallo di parole con lo
stesso Tukey+ρ (sui soli membri della fascia), poi lo si **taglia al range globale**:
`lo_t = max(lo_t, lo)`, `hi_t = min(hi_t, hi)`. Se una fascia ha meno di 30 membri
nel campione, la banda è il range globale (`perTierFallback: true` in provenance).
In produzione un candidato è accettato se cade nel range globale **e** nella banda
della sua fascia. Le bande si sovrappongono ma sono più strette del range globale.

**Generazione a tre secchi**: un solo flusso deterministico (semi `seed + attempt`).
Ogni griglia che supera guard rails, range globale e banda della **fascia in cui
cade naturalmente** finisce nel secchio di quella fascia, se non è già pieno. Stop
quando i tre secchi sono pieni (o al tetto di tentativi). Gli scarti "difficoltà
fuori fascia" della vecchia generazione a targeting **spariscono per costruzione**:
restano solo guard rails, range globale e banda di fascia. Gli id si assegnano per
secchio in ordine di riempimento (contigui per fascia, dopo standard/full).

**Stato**: 135 schede, **15 per ognuna delle 9 combinazioni dimensione × difficoltà**
(4×4, 5×5 e 6×6). La calibrazione è per dimensione: `calibration.json` contiene tutte
e tre le voci.

**Numeri** di calibrazione e generazione (campioni respinti dai guard rails, fasce di
difficoltà, bande per fascia, verifica di riproduzione): [`report/ale.md`](./report/ale.md)
— rigenerabili con `pnpm --filter @boggle/server report:ale -- --all-sizes`.
