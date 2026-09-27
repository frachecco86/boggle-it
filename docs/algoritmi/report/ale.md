# Report — algoritmo `ale`

Numeri della **calibrazione** e della **prima generazione** (5×5, seed 1).

Rigenerabile con:

```bash
pnpm --filter @boggle/server report:ale -- --size 5 --samples 500 --n 15 --seed 1
```

Stesso comando, stessi numeri: la pipeline è deterministica (`mulberry32`, tentativi
`seed + attempt`). La misura usa **gli stessi ingressi della produzione**
(`scripts/ale-inputs.ts`, condiviso con `gen-schede-ale.ts`), non una copia. La
riproduzione è verificata in fondo: le griglie prodotte coincidono con quelle del catalogo.

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
| alfabeto | **26 token**, `QU` unico: `a b c d e f g h i j k l m n o p r s t u v w x y z qu` |
| token più frequenti | `i` 78,1% · `a` 76,3% · `e` 66,7% · `r` 63,3% · `o` 63,0% · `t` 54,2% · `s` 51,9% · `n` 48,6% · `c` 37,7% · `m` 35,0% |
| guard rails | vocali **38–52%** · tetto 1 per `h`/`z`/`qu` · nessuna riga/colonna di sole consonanti · **lettere non italiane ammesse** (si campiona dai 26 token) |

La **frequenza** di un token è la frazione di voci di `Dict'` che lo contengono almeno una
volta: è ciò che guida il campionamento delle celle.

### Le lettere "non italiane" (`j k w x y`)

Non sono un errore e non vengono escluse: **fanno parte dei 26 token**, e hanno frequenza
piccola ma non nulla perché `Dict'` contiene i prestiti e i nomi stranieri del dizionario.

| token | frequenza in `Dict'` | voci che lo contengono | esempi |
| --- | --- | --- | --- |
| `j` | 0,042% | 153 | `jazz`, `ajaccio`, `antijuventina` |
| `k` | 0,131% | 481 | `killer`, `ackhinxana` |
| `w` | 0,072% | 264 | `bowling`, `browser`, `weekend` |
| `x` | 0,089% | 327 | `taxi`, `xilofono` |
| `y` | 0,078% | 287 | `ayatollah`, `yogurt`, `yuppie` |

Con questi valori la probabilità che una cella sia `j/k/w/x/y` è ≈ **0,075%**, quindi circa
l'**1,9%** delle griglie 5×5 ne contiene almeno una. Fino al 27/09 un guard rail del progetto
(`noForeign: true`) scartava quei campioni: era una scelta **non prevista dalla spec**, che
dice di campionare dall'alfabeto di 26 token. Ora la regola è spenta (resta disponibile come
opzione) e quelle griglie vengono accettate come tutte le altre.

Effetto pratico sul catalogo: **nessuna** delle 45 schede ale contiene oggi `j/k/w/x/y` — la
probabilità che sia proprio la griglia *accettata* a contenerne una è ~1,9%, quindi su 45
schede ne attendeva meno di una.

---

## 2. Calibrazione (500 griglie)

| voce | valore |
| --- | --- |
| campioni | **1.578** → **500** griglie valide |
| respinti dai guard rails | **1.078 (68,3%)** |
| senza griglia dopo 200 tentativi | 0 |
| parole per griglia | min **90** · q1 **211** · mediana **276** · q3 **369** · max **758** (media 305) |
| intervallo calibrato (Tukey + ρ=0,6) | **[95, 474]** |
| griglie dentro l'intervallo | 443/500 (**88,6%**) |
| difficoltà (quota di parole fuori da `Common`) | min **0,398** · mediana **0,590** · max **0,728** (media **0,591 ± 0,050**) |
| k-means k=3 | **sì** (cluster ampi abbastanza: regola `≥ max(15, 10%)`) |

Fasce di difficoltà (dal k-means sul campione):

| fascia | centro | intervallo | griglie del campione |
| --- | --- | --- | --- |
| facile | 0,520 | 0,000 – 0,553 | 105 (21,0%) |
| normale | 0,586 | 0,553 – 0,618 | 247 (49,4%) |
| difficile | 0,650 | 0,618 – 1,000 | 148 (29,6%) |

**Deriva rispetto alla calibrazione precedente** (quella del 26/09, con `noForeign: true`,
`Dict'` 368.098): intervallo parole [89, 469] → [95, 474], confini di fascia
0,540/0,608 → 0,553/0,618. Il dizionario è cambiato di **112 voci** fra le due misure e i
guard rails di uno: i numeri si spostano di poco, i confini di ~0,013. La
`calibration.json` è stata **rifatta** con questa modifica (i guard rails devono essere
identici in calibrazione e produzione).

---

## 3. Prima generazione (15 schede per fascia)

| fascia | tentativi (media · max) | accettate al 1° tentativo | fuori intervallo parole | difficoltà fuori fascia | nessuna griglia | campioni guard rails | respinti |
| --- | --- | --- | --- | --- | --- | --- | --- |
| facile | 3,3 · 14 | 2/15 | 8 | 41 | 0 | 193 | 129 (**66,8%**) |
| normale | 1,1 · 4 | 3/15 | 3 | 13 | 0 | 100 | 69 (**69,0%**) |
| difficile | 4,1 · 13 | 3/15 | 9 | 53 | 0 | 232 | 155 (**66,8%**) |

**Perché sono stati respinti i campioni dei guard rails** (un campione può violare più regole,
quindi la somma supera i campioni respinti):

| regola | facile | normale | difficile |
| --- | --- | --- | --- |
| righe/colonne di sole consonanti | 91 (47,2%) | 49 (49,0%) | 114 (49,1%) |
| vocali fuori banda 38–52% | 91 (47,2%) | 50 (50,0%) | 120 (51,7%) |
| token raro ripetuto (`h`/`z`/`qu`, max 1) | 12 (6,2%) | 5 (5,0%) | 15 (6,5%) |
| **violazioni totali** | **194** | **104** | **249** |

**Schede prodotte** (e verifica di riproduzione contro il catalogo):

| fascia | parole prodotte | difficoltà prodotte (centro fascia) | griglie identiche al catalogo |
| --- | --- | --- | --- |
| facile | 146–452 (media 309) | 0,492–0,552 (0,520) | **15/15** |
| normale | 145–470 (media 297) | 0,553–0,609 (0,586) | **15/15** |
| difficile | 135–416 (media 272) | 0,621–0,779 (0,650) | **15/15** |

---

## 4. Cosa dicono i numeri

- **I guard rails sono il filtro dominante**: circa **2 campioni su 3** vengono respinti
  (68,3% in calibrazione, ~67% in produzione). Le due regole che mordono sono
  *righe/colonne di sole consonanti* (47–49%) e *vocali fuori banda* (47–52%); il tetto sui
  token rari incide poco (5–7%). Le lettere non italiane non compaiono più fra i motivi:
  la regola è spenta.
- Nessun campione è rimasto **senza griglia** (0 su 525) e nessuna scheda ha richiesto il
  **ripiego**: il massimo osservato è 14 tentativi su 500 disponibili.
- La fascia **difficile** costa più tentativi (media 4,1): deve centrare una coda
  (29,6% dei campioni) **e** restare nell'intervallo di parole. `normale` è la più facile da
  centrare (media 1,1) perché è la fascia più affollata (49,4%).
- Le schede prodotte stanno **dentro la fascia** richiesta. Nota: la fascia `difficile` ha il
  confine superiore **aperto** (1,000), quindi può accettare griglie più difficili del centro —
  qui fino a 0,779 contro un centro di 0,650. È la causa principale della disparità residua
  fra schede "difficile".
- **Difficoltà = quota di parole fuori dal comune**, non composizione della griglia: senza la
  radice (lemma da Morph-it) questa quota risultava gonfiata di ~0,3 (0,80/0,85/0,89); con la
  radice scende a 0,51/0,59/0,65 ed è quella che i numeri qui sopra mostrano.
- **Verifica di riproduzione**: 15/15 griglie identiche al catalogo in ogni fascia, con la
  calibrazione committata. È la prova che il report misura la stessa pipeline che genera.

---

## 5. Note di riproducibilità

- Serve `packages/dictionary/data/morph-it_048.txt` (radici): **non** è nel repository né
  nell'immagine Docker (è gitignored per dimensione). Si scarica con
  `pnpm --filter @boggle/dictionary fetch`.
- La calibrazione dipende dalla **dimensione** della griglia: il `calibration.json` committato
  contiene solo `5×5`. Aggiungere un'altra dimensione richiede una nuova calibrazione
  (`gen:schede:ale -- --size N`), e il report va rigirato con `--size N`.
- I guard rails sono **fissi** e devono essere identici in calibrazione e produzione: cambiarli
  invalida `calibration.json` (il file li registra in `guardRails`). È quello che è successo il
  27/09 spegnendo `noForeign`: calibrazione rifatta e 45 schede rigenerate.
