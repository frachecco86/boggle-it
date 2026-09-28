# PLAN — evoluzione algoritmo `ale` (branch `ale-full`)

> Stato: **piano approvato, da implementare**. Basato sullo studio del
> 28/09/2026 (campioni misurati: 2000 griglie/dimensione per la calibrazione,
> 300/dimensione per le analisi; numeri in `docs/algoritmi/report/ale.md` e
> nell'appendice in fondo).
>
> Contesto: l'algoritmo `ale` oggi campiona le lettere per frequenza dei token,
> applica guard rails (vocali 30–60%, ≤3 token rari H/Z/QU, copertura
> righe/colonne), calibra l'intervallo di parole (Tukey + ρ=0,35 su 2000
> griglie) e assegna la difficoltà con k-means su `D = 0.5·R + 0.5·M`
> (R = rarità vs NVdB, M = ricchezza = 1 − parole/punteggio).
> Questo piano estende l'algoritmo con quattro interventi studiati e misurati.
> **La definizione di "parola comune" (componente R) NON è in questo piano**:
> la decisione è sospesa e il confronto dettagliato è in [Appendice A](#appendice-a).

---

## Step 1 — Nuovi guard rails: ancore e struttura

### 1a. Parole ancora (obbligatorie)

Ogni scheda ale deve contenere **almeno una parola lunga**: ≥ 6 lettere su
4×4, ≥ 7 su 5×5, ≥ 8 su 6×6 (soglie di `MIN_LONGEST` dell'algoritmo standard).

- **Misura**: oggi il 98,7% / 99,7% / 99,0% delle griglie (4×4/5×5/6×6) ha già
  spontaneamente l'ancora → il rail costa ~1% di scarti extra, praticamente
  gratis, e elimina l'1% di schede "piatte" (tutte parole corte).
- **Implementazione**: valutata dopo il solve (che facciamo già per la
  copertura: costo zero). Va dentro `generateAleGrid` o subito dopo
  `scoreAleBoard` nel ciclo di produzione; anche in **calibrazione** (i rails
  devono essere identici nei due momenti, pena invalidare la calibrazione).

### 1b. Struttura giocabile (da "full")

Portare in ale le tre regole di `gridStructureIssues` (packages/shared/src/grid.ts):

1. nessuna consonante a distanza (Chebyshev) > 2 da ogni vocale;
2. al più una riga/colonna senza vocali;
3. nessuna `h` senza `c`/`g` adiacente (in italiano la `h` vale solo nei
   digrammi ch/gh: una `h` isolata è una casella morta).

- **Misura**: il ~25% delle griglie che oggi superano i guard rail ale viola
  almeno una di queste regole → non è estetica, è giocabilità reale.
- **Costo**: +25% di scarti sui candidati conformi; con i tentativi attuali
  (media 2–6, max 23 su 500) è sostenibile. La regola è sui token (nessun
  solve): va valutata **prima** della copertura, è economica.

> ⚠️ **Entrambi i rails cambiano la provenance della calibrazione** →
> `calibration.json` va rifatto e il catalogo rigenerato (vedi Step 4).

---

## Step 2 — Bande di parole per fascia

Oggi l'intervallo calibrato di parole (Tukey+ρ) è **unico per tutte le fasce**:
serve solo a scartare griglie spopolate/sovrappopolate. Lo spread dentro una
fascia resta ampio (es. 4×4 difficile: 74–162 parole).

**Costruzione scelta (metodo standard/full, bande intra-fascia):**

1. In calibrazione, dopo il k-means, ogni griglia del campione ha una fascia.
2. Per ciascuna fascia si calcola il **proprio** intervallo di parole con lo
   stesso Tukey+ρ sui soli membri della fascia.
3. In produzione un candidato è accettato se è nel range globale **e** nel
   range della sua fascia target.

Riferimento misurato (campione 300/dim, terzili di D):

| | terzile facile | terzile medio | terzile difficile |
|---|---|---|---|
| 4×4 parole (mediana) | 85 | 116 | 149 |
| 5×5 parole (mediana) | 188 | 276 | 334 |
| 6×6 parole (mediana) | 353 | 467 | 587 |

- **Effetto atteso**: spread per fascia molto più stretto (le bande per fascia
  si sovrappongono ma sono più strette del range globale).
- **Decisione documentata — NON si ripristina "facile = tante parole"**:
  imporre bande ordinate fra fasce andrebbe contro la correlazione naturale
  corr(parole, D) ≈ 0,5 (griglie dense accumulano parole rare/lunghe → D
  sale): solo il 19–24% delle griglie del terzile facile sta sopra la mediana
  globale, quindi i tentativi di reiezione del facile moltiplicherebbero ~4–5×.
  La difficoltà resta "parole rare e lunghe", non "poche parole".

---

## Step 3 — Generazione "a tre secchi"

**Perché non la via campionamento-per-fascia (idea E originaria)**: misurato e
scartata. Le distribuzioni di lettere dei tre anelli di frequenza sono molto
diverse (distanza TV fino a 0,97; `h` 3,6%→7,1%, `z` 5,8%→9,8%), ma un pilot
(200 griglie × 3 distribuzioni × 3 dimensioni) mostra che **la difficoltà non
si separa**: mediane di D 0,574–0,585 (4×4), 0,613–0,617 (5×5), 0,631–0,640
(6×6). I guard rails appiattiscono le differenze. Anche la variante "guard
rails per fascia" non funzionerebbe: corr(vocali, D) ≈ 0,00–0,07 e
corr(#rare, D) ≈ −0,11…−0,18 — a parità di rails la composizione delle lettere
non muove D. La difficoltà emerge da *quali parole risultano componibili*, non
dalle statistiche delle lettere.

**La soluzione è cambiare l'assegnazione, non il campionamento:**

- Un solo flusso di candidati (semi `seed + attempt`, come oggi).
- Ogni griglia che supera guard rails, range globale e banda **della fascia in
  cui cade naturalmente** viene etichettata con la sua D e finisce nel secchio
  di quella fascia.
- Stop quando i tre secchi sono pieni (15 schede ciascuno).

**Effetto**: gli scarti "difficoltà fuori fascia" (oggi i più numerosi: 13–71
per fascia) spariscono per costruzione; restano solo guard rails + range
parole. L'id delle schede si assegna per secchio in ordine di riempimento
(deterministico dato il seed).

---

## Step 4 — Ricalibrazione, rigenerazione, report

1. Ricalibrare con **2000 griglie × 3 dimensioni**, ρ=0,35, rails nuovi
   (provenance aggiornata: `guardRails`, `weights`, `rho`, e ora anche le
   bande per fascia dello Step 2).
2. Rigenerare il catalogo ale con la generazione a tre secchi.
3. Verifiche: `report:ale -- --all-sizes` (distribuzione fasce, scarti,
   tentativi), `verify:schede`, test `pnpm test`, `pnpm typecheck`.
4. Aggiornare `docs/algoritmi/report/ale.md` e `docs/algoritmi/ale.md`.
5. Copiare il bundle web (`node apps/web/scripts/copy-schede.mjs`).

### Criteri di accettazione

- k-means k=3 converge in tutte le dimensioni (nessun fallback ai tertili);
  cluster tutti ≥ 10% del campione.
- 15/15 schede per fascia e dimensione, tutte in banda (globale + fascia),
  nessun ripiego.
- Tentativi medi per scheda non peggiori di ~2× rispetto ad oggi
  (oggi: media 1,7–6,1, max 23 su 500).
- Ogni scheda ha ≥ 1 parola ancora e zero problemi di struttura.

---

## Appendice A — punto sospeso: definizione di "parola comune" (componente R)

Non fa parte del piano: richiede una **decisione di prodotto**. Qui il
confronto dettagliato fra le tre candidate, misurato sui dati reali.

### Le candidate

| | V1 — NVdB (status quo) | V2 — frequenza | V3 — ibrido |
|---|---|---|---|
| definizione | (NVdB ∩ Dict') ∪ forme con lemma comune | top-20.000 di `frequency-it.txt` (OpenSubtitles) | V1 ∪ top-5.000 |
| forme coperte | 93.584 | 20.000 | 94.019 |
| tipo | vocabolario **curato** ("ciò che un italiano dovrebbe conoscere") | **uso reale** (sottotitoli) | curato + rattoppi d'uso |
| dipendenze | `nvdb.words.txt` + `lemmas.br` (Morph-it) | solo `frequency-it.txt` | entrambe |

Nota: le fasce di frequenza sono **annidate** (F5 ⊂ F20 ⊂ F60), non disgiunte;
eventuali accumulatori vanno costruiti sugli anelli (0–5k, 5–20k, >20k).

### Copertura incrociata

| lista | coperta da V1 | da V2 | da V3 |
|---|---|---|---|
| F5 (le 5k più usate) | 91,3% | 100% | 100% |
| F20 | 74,3% | 100% | 76,4% |
| F60 | 54,8% | 33,4% | 55,5% |

**Cosa manca a V1** (l'8,7% di F5 che NVdB+lemma non copre): nomi propri
(`africa`, `andrea` — esclusi dal NVdB per scelta), articoli e preposizioni
contratte (`alla`, `agli`, `alcuni`, `nei`, `sui` — lemmatizzati sotto la
preposizione base), prestiti recenti (`girl`), forme accentate normalizzate
(`alcool`). Per un giocatore, `alla` è banalmente comune: è il difetto pratico
principale di V1.

**Cosa V1 considera comune e i sottotitoli non vedono mai** (64,9% di
Common-effettivo fuori da F60): le flessioni "alte" dei lemmi comuni —
soprattutto **passato remoto e congiuntivi** (`abbaiavamo`, `meritai`,
`riunisti`, `munsi`) e superlativi (`abbagliantissima`). Sono forme che un
parlante riconosce ma che il parlato filmico quasi non usa: bias sistematico
del corpus OpenSubtitles.

**Cosa V2 aggiunge di discutibile**: nomi propri, interiezioni e inglesismi da
sottotitoli (`girl`, `sin`) contati come "comuni".

### Sulle griglie (campione di 300 griglie ale per dimensione)

R media per variante e accordo fra le classifiche di difficoltà:

| dimensione | R V1 | R V2 | R V3 | Spearman V1↔V2 | Spearman V1↔V3 | accordo terzili V1↔V2 | V1↔V3 |
|---|---|---|---|---|---|---|---|
| 4×4 | 0,564 | 0,568 | 0,535 | 0,43 | 0,95 | 64,0% | 90,7% |
| 5×5 | 0,579 | 0,612 | 0,554 | 0,44 | 0,97 | 62,0% | 91,3% |
| 6×6 | 0,594 | 0,640 | 0,571 | 0,36 | 0,97 | 62,7% | 92,0% |

- **V1 ↔ V2: stesso livello medio, ordine diverso.** La R media quasi non si
  muove su 4×4 (0,564 → 0,568), ma la correlazione di rango è solo ~0,4 e
  l'accordo dei terzili ~63% (casuale: 33%): **cambierebbe davvero quali
  griglie sono facili e quali difficili**, non solo le etichette. Delta mediano
  |R1−R2| ≈ 0,046 per griglia.
- **V1 ↔ V3: quasi identiche.** L'ibrido aggiunge solo 435 parole (i buchi del
  top-5k): Spearman 0,95–0,97, accordo terzili 91–92%. Migliora la qualità
  senza cambiare la scala: **rattoppo a basso rischio**.

### Esempi su griglie reali (4×4, flusso seed 42)

**Griglia 1** — `R C C U | E I U O | N O P C | N H E S` — 140 parole,
R(V1) 0,507 vs R(V2) 0,657:
- nel top-5k ma "rare" per V1: `ione`, `nei`
- comuni per V1 ma mai nei sottotitoli: `scoccino`, `scoccio`, `copino`,
  `cuocio`, `cucce`, `ricce`, `spino`

**Griglia 2** — `P A I L | N T T R | S M E I | F P P I` — 138 parole,
R(V1) 0,514 vs R(V2) 0,616:
- nel top-5k ma "rare" per V1: `rita`
- comuni per V1 ma fuori da F60: `meritanti`, `meritai`, `spettai`, `ritta`,
  `ritte`, `ritti`, `erti`

**Griglia 3** — `I G L R | O T I M | S M N U | R I S F` — 131 parole,
R(V1) 0,595 vs R(V2) 0,687:
- nel top-5k ma "rare" per V1: `girl`, `sin`, `sui`
- comuni per V1 ma fuori da F60: `riunisti`, `unisti`, `munsi`, `munti`,
  `limi`, `tosi`, `unir`

Lettura: V1 premia la morfologia colta (passato remoto comune per lemma) e
punisce contrazioni e prestiti d'uso; V2 fa l'opposto. Nessuna delle due è
"sbagliata": misurano due idee diverse di "parola che il giocatore conosce".

### Opzioni sul tavolo

1. **Tenere V1 (NVdB+lemma)**: nessun lavoro, nessuna ricalibrazione extra.
   Difetti noti: `alla/agli/nei` contate come rare.
2. **V3 (ibrido V1 ∪ F5)**: rattoppo mirato dei buchi peggiori, classifiche
   quasi invariate (accordo 91%). Mantiene `lemmas.br`. **Rapporto
   valore/rischio migliore.**
3. **V2 (frequenza pura)**: pipeline più semplice (addio `lemmas.br` e
   Morph-it), rarità potenzialmente graduata (anelli invece di binario); ma la
   classifica delle griglie cambia davvero (Spearman ~0,4), il corpus è
   rumoroso (nomi propri, inglesismi) e perde la copertura delle flessioni
   colte. Richiede ricalibrazione completa e re-taratura delle fasce.
4. Variante estesa di V2: metrica ad anelli pesati `(0·f5 + 1·f5–20k +
   2·>20k)/2` al posto della binaria fuori/dentro — più liscia, stessa
   dipendenza dal corpus.

### Raccomandazione

**Adottare V3 ora** (una riga: `commonEff ∪ F5` in fase di costruzione di
`Common`), tenere V2 come evoluzione futura solo se si vuole semplificare la
pipeline eliminando Morph-it. Se si adotta V3 o V2: la R cambia → ricalibrare
insieme allo Step 4 (i pesi/rails/ρ restano, cambia l'input di Common).
