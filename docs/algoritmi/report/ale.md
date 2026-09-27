# Report — algoritmo `ale`

Numeri della **calibrazione** e della **prima generazione** per **tutte e tre le
dimensioni** (4×4, 5×5, 6×6), 500 campioni, 15 schede per fascia, seed 1.

Rigenerabile con:

```bash
pnpm --filter @boggle/server report:ale -- --all-sizes --samples 500 --n 15 --seed 1
```

Stesso comando, stessi numeri: la pipeline è deterministica (`mulberry32`,
tentativi `seed + attempt`). La misura usa **gli stessi ingressi della
produzione** (`src/ale.ts`, condiviso con `gen-schede-ale.ts` e con il pulsante
“Genera” del pannello admin), non una copia. La riproduzione è verificata in
fondo: le griglie prodotte coincidono **15/15 per fascia** con quelle del
catalogo in tutte le dimensioni.

- Data della misura: 27/09/2026
- Codice: `packages/shared/src/schedaAle.ts`
- Script: `apps/server/scripts/report-ale.ts`
- Calibrazione: `packages/dictionary/data/ale/calibration.json`

---

## 1. Cosa è cambiato in questa versione

Due revisioni dell'algoritmo, concordate con la committente:

1. **Guard rail nuovi**
   - banda vocali **30–60%** (prima 38–52%);
   - **al più 3 token rari H/Z/QU IN TOTALE** nella griglia (prima: al più uno
     per ciascun token);
   - **nessuna riga o colonna senza soluzioni**: ogni linea della griglia deve
     essere attraversata da almeno una parola trovabile. Non è più una regola
     “di sole consonanti”, ma una verifica di **copertura** che richiede di
     *risolvere* la griglia (una riga di consonanti può comunque essere
     attraversata da parole, e viceversa una riga con vocali può restare morta).
     Il guard rail “righe/colonne di sole consonanti” e quello sulle lettere
     non italiane sono stati **rimossi**.

2. **Nuova metrica di difficoltà**: `Difficoltà = 0.25·R + 0.75·S`
   - `R` = **rarità**: quota di parole fuori da `Common` (NVdB ∩ Dict’). È la
     difficoltà “vecchia”.
   - `S` = **scarsità**: `S = 1 − (parole − A) / (B − A)` per l’intervallo
     calibrato `[A, B]`. Vale **0** al massimo dell’intervallo e **1** al minimo.
   - La calibrazione resta quella di prima come flusso — 500 schede → guard rail
     → intervallo calibrato (Tukey + ρ) → clustering k-means a 3 fasce — ma il
     clustering ora lavora sulla **difficoltà composita** e non più sulla sola
     rarità.

La banda vocali è stata allargata e il tetto dei rari è diventato complessivo
proprio per compensare il guard rail di copertura, che è molto più selettivo:
con le vecchie regole la copertura avrebbe scartato troppi campioni.

**Pesi verificati.** Il controllo richiesto — “un numero sano di schede nelle tre
fasce” — è soddisfatto: la distribuzione è **~33% per fascia** in tutte le
dimensioni (vedi §3). Non è stato quindi necessario ritoccare i pesi 0.25/0.75.

---

## 2. Ingressi (comuni alle tre dimensioni)

| voce | valore |
| --- | --- |
| `Dict` → `Dict'` | 368.101 → **368.098** voci |
| `Common` (NVdB ∩ `Dict'`) | **7.042** (1,9% di `Dict'`) |
| radici forma → lemma (lemma in `Common`) | **87.403** coppie |
| alfabeto | **26 token**, `QU` unico: `a b c d e f g h i j k l m n o p r s t u v w x y z qu` |
| token più frequenti | `i` 78,2% · `a` 76,3% · `e` 66,7% · `r` 63,3% · `o` 63,0% · `t` 54,2% · `s` 51,9% · `n` 48,6% · `c` 37,7% · `m` 35,0% |
| guard rails | vocali **30–60%** · **al più 3** token rari H/Z/QU in totale · **nessuna riga/colonna senza soluzioni** · lettere non italiane ammesse (alfabeto di 26 token) |

La **frequenza** di un token è la frazione di voci di `Dict'` che lo contengono
almeno una volta: è ciò che guida il campionamento delle celle.

---

## 3. Calibrazione (500 griglie per dimensione)

Il peso della copertura si vede subito: è il guard rail che scarta di più, dopo
la banda vocali.

| dimensione | campioni → valide | respinte | intervallo parole (Tukey+ρ) | dentro l’intervallo |
| --- | --- | --- | --- | --- |
| **4×4** | 658 → **500** | 158 (24,0%) | **[22, 207]** | 455/500 (91,0%) |
| **5×5** | 607 → **500** | 107 (17,6%) | **[73, 445]** | 450/500 (90,0%) |
| **6×6** | 571 → **500** | 71 (12,4%) | **[160, 770]** | 441/500 (88,2%) |

Parole per griglia (campione di 500):

| dimensione | min | q1 | mediana | q3 | max | media |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 10 | 77 | 112 | 154 | 425 | 121 |
| 5×5 | 44 | 185 | 254 | 340 | 770 | 272 |
| 6×6 | 125 | 341 | 460 | 596 | 1318 | 492 |

Rarità `R` e difficoltà composita `0.25·R + 0.75·S` (campione di 500):

| dimensione | R (media ± sd) | composita (media ± sd) | composita [min, max] |
| --- | --- | --- | --- |
| 4×4 | 0,562 ± 0,075 | 0,504 ± 0,204 | [0,116, 0,917] |
| 5×5 | 0,578 ± 0,055 | 0,509 ± 0,205 | [0,129, 0,924] |
| 6×6 | 0,590 ± 0,044 | 0,508 ± 0,210 | [0,132, 0,912] |

Il `min` della composita non è 0 perché una griglia molto fitta (S = 0) conserva
comunque la componente di rarità (`0.25·R > 0`); il `max` non è 1 perché una
griglia molto rada (S = 1) ha rarità non massima.

**Fasce di difficoltà** (k-means k=3 usato in tutte e tre le dimensioni):

| dimensione | facile (centro · intervallo) | normale | difficile | distribuzione |
| --- | --- | --- | --- | --- |
| 4×4 | 0,307 · [0, 0,422] | 0,538 · [0,422, 0,634] | 0,731 · [0,634, 1] | 34,2% / 35,6% / 30,2% |
| 5×5 | 0,317 · [0, 0,426] | 0,534 · [0,426, 0,635] | 0,736 · [0,635, 1] | 33,6% / 35,4% / 31,0% |
| 6×6 | 0,313 · [0, 0,423] | 0,532 · [0,423, 0,632] | 0,733 · [0,632, 1] | 33,2% / 33,8% / 33,0% |

Le tre fasce sono **bilanciate in ogni dimensione** (nessuna sotto il 30%): i
pesi 0.25/0.75 non richiedono correzioni. I confini sono quasi identici fra le
dimensioni (0,42 e 0,63), segno che la metrica è stabile.

---

## 4. Prima generazione (15 schede per fascia e per dimensione)

**Perché sono stati respinti i campioni dei guard rail** (un campione può violare
più regole, quindi la somma può superare i campioni respinti):

| dimensione · fascia | vocali fuori banda | rari H/Z/QU > 3 | righe/colonne senza soluzioni |
| --- | --- | --- | --- |
| 4×4 · facile | 32 | 0 | 0 |
| 4×4 · normale | 18 | 0 | 0 |
| 4×4 · difficile | 18 | 0 | 1 colonna |
| 5×5 · facile | 25 | 0 | 0 |
| 5×5 · normale | 8 | 0 | 0 |
| 5×5 · difficile | 10 | 0 | 0 |
| 6×6 · facile | 7 | 0 | 0 |
| 6×6 · normale | 8 | 0 | 0 |
| 6×6 · difficile | 6 | 1 | 0 |

La banda vocali è la regola che scarta di più; la copertura interviene raramente
perché una griglia di 4×4/5×5/6×6 con la banda vocali 30–60% ha quasi sempre
almeno una parola per riga e colonna. Il numero basso di reiezioni di copertura
**non** significa che il guard rail sia inutile: senza, le griglie con una linea
morta (che il campionamento produce) finirebbero nel catalogo.

**Tentativi per scheda** (media · max) e accettazioni al primo tentativo utile:

| dimensione · fascia | tentativi | accettate al 1° |
| --- | --- | --- |
| 4×4 · facile | 3,9 · 7 | 2/15 |
| 4×4 · normale | 1,8 · 5 | 6/15 |
| 4×4 · difficile | 1,1 · 6 | 1/15 |
| 5×5 · facile | 4,1 · 17 | 2/15 |
| 5×5 · normale | 1,9 · 6 | 6/15 |
| 5×5 · difficile | 1,9 · 8 | 2/15 |
| 6×6 · facile | 2,7 · 12 | 3/15 |
| 6×6 · normale | 2,1 · 11 | 3/15 |
| 6×6 · difficile | 1,8 · 8 | 2/15 |

**Schede prodotte** (parole · difficoltà composita), tutte in banda e nella
fascia richiesta, tutte **15/15 identiche al catalogo**:

| dimensione · fascia | parole | difficoltà (centro fascia) |
| --- | --- | --- |
| 4×4 · facile | 138–202 (media 164) | 0,171–0,420 (0,307) |
| 4×4 · normale | 83–137 (media 112) | 0,443–0,629 (0,538) |
| 4×4 · difficile | 23–78 (media 44) | 0,667–0,913 (0,731) |
| 5×5 · facile | 312–419 (media 361) | 0,184–0,424 (0,317) |
| 5×5 · normale | 205–298 (media 263) | 0,457–0,617 (0,534) |
| 5×5 · difficile | 97–210 (media 155) | 0,639–0,830 (0,736) |
| 6×6 · facile | 542–740 (media 646) | 0,181–0,418 (0,313) |
| 6×6 · normale | 385–550 (media 465) | 0,425–0,624 (0,532) |
| 6×6 · difficile | 164–379 (media 303) | 0,632–0,910 (0,733) |

---

## 5. Cosa dicono i numeri

- **La scarsità domina.** Con pesi 0.25/0.75, una griglia **rada** (S = 1) con
  parole comuni (R = 0) ha difficoltà 0,75, mentre una griglia **fitta** (S = 0)
  di parole rare (R = 1) ne ha 0,25. È la conseguenza voluta: contano prima
  quante parole ci sono, poi quanto sono rare.
- **Convergenza fra dimensioni.** I confini di fascia sono ~0,42 e ~0,63 su 4×4,
  5×5 e 6×6: la metrica si comporta allo stesso modo a ogni dimensione, quindi
  le tre “difficoltà” significano la stessa cosa su griglie diverse.
- **Distribuzione sana.** k-means produce tre cluster ampi e bilanciati
  (~33% ciascuno). La regola di validazione (≥ max(15, 10%)) passa sempre, quindi
  il fallback ai tertili non serve.
- **Copertura rara ma decisiva.** Il guard rail di copertura scarta pochi
  campioni (0–1 per fascia), ma proprio perché il campionamento per frequenza
  produce quasi sempre griglie attraversabili: le rare linee morte verrebbero
  accettate senza di esso. Il costo è una risoluzione per candidato che passa i
  rail sui token, mitigato risolvendo **solo** i candidati già conformi.

---

## 6. Note di riproducibilità

- Serve `packages/dictionary/data/ale/lemmas.br` (radici forma → lemma): **è
  versionato** (~169 KB) e tiene solo le forme il cui lemma è in `Common`. Si
  rigenera con `pnpm --filter @boggle/dictionary build:ale-lemmas`, che richiede
  `packages/dictionary/data/morph-it_048.txt` (gitignored, scaricabile con
  `pnpm --filter @boggle/dictionary fetch`). Da quando esiste `lemmas.br`,
  Morph-it non serve né in locale né nell’immagine Docker per GENERARE: la
  pipeline ale gira anche dal pulsante “Genera” del pannello admin.
- La calibrazione dipende dalla **dimensione** della griglia: `calibration.json`
  contiene una voce per 4×4, 5×5 e 6×6. Aggiungere una dimensione richiede una
  nuova calibrazione (`gen:schede:ale -- --size N`) e il report va rigirato.
- I guard rail, i **pesi della difficoltà** e la formula della scarsità devono
  essere **identici** in calibrazione e produzione: cambiarli invalida
  `calibration.json` (il file li registra in `guardRails` e `provenance.weights`).
  È quello che è successo il 27/09 con i guard rail nuovi e la metrica composita:
  calibrazione rifatta per tutte e tre le dimensioni e 135 schede ale rigenerate.
