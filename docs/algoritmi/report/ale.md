# Report — algoritmo `ale`

Numeri della **calibrazione** e della **prima generazione** (5×5, seed 1).

Rigenerabile con:

```bash
pnpm --filter @boggle/server report:ale -- --size 5 --samples 500 --n 15 --seed 1
```

Stesso comando, stessi numeri: la pipeline è deterministica (`mulberry32`, tentativi
`seed + attempt`). La misura usa **gli stessi ingressi della produzione**
(`scripts/ale-inputs.ts`, condiviso con `gen-schede-ale.ts`), non una copia.

- Data della misura: 27/09/2026
- Codice: `packages/shared/src/schedaAle.ts`
- Script: `apps/server/scripts/report-ale.ts`

---

## 1. Ingressi

| voce | valore |
| --- | --- |
| `Dict` → `Dict'` | 368.214 → **368.210** voci |
| `Common` (NVdB ∩ `Dict'`) | **7.042** (1,9% di `Dict'`; NVdB: 7.181 voci) |
| radici forma → lemma (Morph-it) | 366.846 coppie |
| alfabeto | **26 token**, `QU` unico |
| token più frequenti | `i` 78,1% · `a` 76,3% · `e` 66,7% · `r` 63,3% · `o` 63,0% · `t` 54,2% · `s` 51,9% · `n` 48,6% · `c` 37,7% · `m` 35,0% |
| guard rails | vocali **38–52%** · tetto 1 per `h`/`z`/`qu` · nessuna riga/colonna di sole consonanti · nessuna lettera non italiana |

La **frequenza** di un token è la frazione di voci di `Dict'` che lo contengono almeno una
volta: è ciò che guida il campionamento delle celle.

---

## 2. Calibrazione (500 griglie)

| voce | valore |
| --- | --- |
| campioni | **1.590** → **500** griglie valide |
| respinti dai guard rails | **1.090 (68,6%)** |
| senza griglia dopo 200 tentativi | 0 |
| parole per griglia | min **90** · q1 **211** · mediana **276** · q3 **369** · max **758** (media 305) |
| intervallo calibrato (Tukey + ρ=0,6) | **[95, 474]** |
| griglie dentro l'intervallo | 442/500 (**88,4%**) |
| difficoltà (quota di parole fuori da `Common`) | min **0,398** · mediana **0,590** · max **0,728** (media **0,591 ± 0,050**) |
| k-means k=3 | **sì** (cluster ampi abbastanza: regola `≥ max(15, 10%)`) |

Fasce di difficoltà (dal k-means sul campione):

| fascia | centro | intervallo | griglie del campione |
| --- | --- | --- | --- |
| facile | 0,520 | 0,000 – 0,553 | 102 (20,4%) |
| normale | 0,586 | 0,553 – 0,618 | 247 (49,4%) |
| difficile | 0,649 | 0,618 – 1,000 | 151 (30,2%) |

**Deriva rispetto alla calibrazione committata** (`packages/dictionary/data/ale/calibration.json`,
del 26/09, seed 1, `Dict'` **368.098**):

| voce | committata | ricalcolata oggi |
| --- | --- | --- |
| `Dict'` | 368.098 | 368.210 |
| intervallo parole | [89, 469] | [95, 474] |
| confini delle fasce | 0,540 / 0,608 | 0,553 / 0,618 |

Il dizionario è cambiato di **112 voci** fra le due misure (rigenerazione del lessico): i
numeri si spostano di poco, i confini di fascia di ~0,013. La calibrazione **non** è stata
rifatta: la produzione usa quella committata.

---

## 3. Prima generazione (15 schede per fascia)

Misurata con la **calibrazione committata** (quella che la prima generazione ha davvero usato).

| fascia | tentativi (media · max) | accettate al 1° tentativo | fuori intervallo parole | difficoltà fuori fascia | nessuna griglia | campioni guard rails | respinti |
| --- | --- | --- | --- | --- | --- | --- | --- |
| facile | 7,5 · 30 | 2/15 | 16 | 96 | 0 | 441 | 314 (**71,2%**) |
| normale | 1,1 · 5 | 4/15 | 5 | 12 | 0 | 89 | 57 (**64,0%**) |
| difficile | 2,1 · 7 | 5/15 | 6 | 25 | 0 | 141 | 95 (**67,4%**) |

**Perché sono stati respinti i campioni dei guard rails** (un campione può violare più regole,
quindi la somma supera i campioni respinti):

| regola | facile | normale | difficile |
| --- | --- | --- | --- |
| righe/colonne di sole consonanti | 226 (51,2%) | 41 (46,1%) | 67 (47,5%) |
| vocali fuori banda 38–52% | 222 (50,3%) | 40 (44,9%) | 73 (51,8%) |
| token raro ripetuto (`h`/`z`/`qu`, max 1) | 33 (7,5%) | 3 (3,4%) | 8 (5,7%) |
| lettere non italiane | 8 (1,8%) | 1 (1,1%) | 2 (1,4%) |
| **violazioni totali** | **489** | **85** | **150** |

**Schede prodotte** (e confronto con quelle effettivamente nel catalogo):

| fascia | parole prodotte | difficoltà prodotte (centro fascia) | catalogo | griglie identiche alla run |
| --- | --- | --- | --- | --- |
| facile | 146–452 (media 287) | 0,453–0,539 (0,506) | 15 schede, 126–447 (media 284) | **9/15** |
| normale | 145–416 (media 293) | 0,541–0,598 (0,575) | 15 schede, 141–461 (media 292) | **11/15** |
| difficile | 93–416 (media 259) | 0,609–0,674 (0,641) | 15 schede, 89–411 (media 254) | **13/15** |

Le griglie non identiche sono dovute al **cambio di dizionario** (368.098 → 368.210 voci):
cambia il numero di parole di una stessa griglia, quindi cambia quali candidati entrano in
fascia. Le schede nel catalogo restano quelle generate allora, come previsto.

---

## 4. Cosa dicono i numeri

- **I guard rails sono il filtro dominante**: circa **2 campioni su 3** vengono respinti
  (68,6% in calibrazione, 69,4% in produzione). Le due regole che mordono sono
  *righe/colonne di sole consonanti* (46–51% dei campioni) e *vocali fuori banda* (45–52%);
  il tetto sui token rari incide poco (3–8%) e le lettere non italiane quasi mai (1–2%).
- Nessun campione è rimasto **senza griglia** (0 su 671) e nessuna scheda ha richiesto il
  **ripiego**: il massimo osservato è 30 tentativi su 500 disponibili.
- La fascia **facile** costa più tentativi (media 7,5) delle altre: deve centrare una coda
  stretta (circa il 20% dei campioni ha difficoltà ≤ 0,553) **e** restare nell'intervallo di
  parole. `normale` è la più facile da centrare (media 1,1) perché è la fascia più affollata
  (49,4% dei campioni).
- Le schede prodotte stanno **dentro la fascia** richiesta. Nota: la fascia `difficile` ha il
  confine superiore **aperto** (1,000), quindi può accettare griglie molto più difficili del
  centro — nel campione di calibrazione la difficoltà arrivava a 0,728 contro un centro di
  0,649. È la causa principale della disparità residua fra schede "difficile".
- **Difficoltà = quota di parole fuori dal comune**, non composizione della griglia: senza la
  radice (lemma da Morph-it) questa quota risultava gonfiata di ~0,3 (0,80/0,85/0,89); con la
  radice scende a 0,51/0,59/0,65 ed è quella che i numeri qui sopra mostrano.

---

## 5. Note di riproducibilità

- Serve `packages/dictionary/data/morph-it_048.txt` (radici): **non** è nel repository né
  nell'immagine Docker (è gitignored per dimensione). Si scarica con
  `pnpm --filter @boggle/dictionary fetch`.
- La calibrazione dipende dalla **dimensione** della griglia: il `calibration.json` committato
  contiene solo `5×5`. Aggiungere un'altra dimensione richiede una nuova calibrazione
  (`gen:schede:ale -- --size N`), e il report va rigirato con `--size N`.
- I guard rails sono **fissi** e devono essere identici in calibrazione e produzione: cambiarli
  invalida `calibration.json` (il file li registra in `guardRails`).
