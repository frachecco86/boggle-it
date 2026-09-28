# Report — algoritmo `ale`

Numeri della **calibrazione** (2000 griglie per dimensione) e della **prima
generazione** con la metrica di difficoltà `0.5·R + 0.5·M` e **ρ = 0,35**, per
**tutte e tre le dimensioni** (4×4, 5×5, 6×6), 15 schede per fascia, seed 1.

Rigenerabile con:

```bash
pnpm --filter @boggle/server report:ale -- --all-sizes --n 15 --seed 1
```

Stesso comando, stessi numeri: la pipeline è deterministica (`mulberry32`,
tentativi `seed + attempt`). La misura usa **gli stessi ingressi della
produzione** (`src/ale.ts`, condiviso con `gen-schede-ale.ts` e con il pulsante
“Genera” del pannello admin), non una copia. La riproduzione è verificata in
fondo: le griglie prodotte coincidono **15/15 per fascia** con quelle del
catalogo in tutte le dimensioni.

- Data della misura: 28/09/2026
- Codice: `packages/shared/src/schedaAle.ts`
- Script: `apps/server/scripts/report-ale.ts`
- Calibrazione: `packages/dictionary/data/ale/calibration.json`

---

## 1. Cosa è cambiato in questa versione

Due revisioni, concordate con la committente:

1. **Nuova metrica di difficoltà**: `Difficoltà = 0.5·R + 0.5·M`
   - `R` = **rarità**: quota di parole fuori da `Common` (NVdB ∩ Dict’), con la
     radice/lemma come prima (una forma è comune se lo è lei o il suo lemma).
   - `M` = **ricchezza** della board: `M = 1 − numero_parole / punteggio_board`.
     Vale **0** se la board ha tutte parole da 1 punto (tutte da 3 lettere,
     perché `punteggio = lunghezza − 2`) e tende a **1** quanto più il punteggio
     medio per parola è alto (parole più lunghe valgono più punti).
   - `M` **sostituisce** la scarsità `S` della versione precedente (`0.25·R +
     0.75·S`): il numero di parole non entra più nella difficoltà come quantità
     assoluta dentro l'intervallo calibrato, ma solo attraverso il **valore
     medio** delle parole. `M` non ha bisogno di un intervallo calibrato:
     `punteggio ≥ parole` sempre (ogni parola vale almeno 1 punto), quindi
     `M ∈ [0, 1)` per costruzione.

2. **ρ: 0,6 → 0,35** e campione di calibrazione **500 → 2000** griglie.
   Con ρ=0,6 l'intervallo calibrato di parole era troppo largo (su 4×4 [22, 207]
   con 500 campioni, [14, 203] con 2000): schede della stessa fascia variavano
   troppo nel numero di parole. ρ restringe il Tukey verso la mediana; con 0,35
   la banda si dimezza circa e restano in-range ~67–70% dei campioni (gli scarti
   in più in produzione costano pochi tentativi di reiezione, vedi §4).

Il **resto della pipeline è invariato**: campionamento per frequenza dei token →
guard rails (vocali 30–60%, al più 3 token rari H/Z/QU in totale, nessuna
riga/colonna senza soluzioni) → intervallo calibrato di parole (Tukey + ρ) →
clustering k-means k=3 sulla difficoltà **composita** (con fallback ai tertili)
→ produzione con ciclo di reiezione e targeting per fascia.

**Pesi verificati.** Il controllo richiesto — “un numero sano di schede nelle
tre fasce” — è soddisfatto con i pesi **0.5 / 0.5**: k-means k=3 converge con
cluster ampi in tutte le dimensioni (25–30% facile, 39–43% normale, 29–33%
difficile, vedi §3), e la generazione produce **15/15 schede per fascia** in
ogni dimensione, tutte in banda e nella fascia richiesta. Non è stato quindi
necessario ritoccare i pesi.

### Scelta di ρ (misure sul campione di 2000 griglie, seed 1)

| ρ | 4×4 range (ampiezza) | in-range | 5×5 range | in-range | 6×6 range | in-range |
| --- | --- | --- | --- | --- | --- | --- |
| 0,60 (prima) | [14, 203] (189) | 91,2% | [65, 440] (375) | 90,8% | [142, 776] (634) | 89,7% |
| 0,50 | [29, 187] (158) | 86,3% | [96, 408] (312) | 84,5% | [193, 722] (529) | 83,8% |
| 0,45 | [36, 178] (142) | 81,2% | [111, 391] (280) | 80,0% | [219, 695] (476) | 79,2% |
| **0,35 (scelto)** | **[51, 162] (111)** | **70,0%** | **[141, 359] (218)** | **68,3%** | **[271, 641] (370)** | **66,8%** |
| 0,30 | [59, 154] (95) | 62,3% | [156, 343] (187) | 59,9% | [297, 614] (317) | 60,4% |

A ogni valore di ρ il k-means resta valido in tutte le dimensioni (cluster tutti
ampi). ρ=0,35 dimezza quasi l'ampiezza della banda rispetto a 0,6 (−41% su 4×4,
−42% su 5×5 e 6×6) fermandosi prima del ginocchio: sotto 0,35 l'accettazione
cala rapidamente (60% a 0,30) senza un guadagno proporzionato di restringimento.

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

## 3. Calibrazione (2000 griglie per dimensione)

Il campionamento e i guard rails non sono cambiati: con lo stesso seed il
campione **include** quello da 500 della versione precedente (semi 2–501) e lo
estende (semi 502–2001); cambiano la metrica di difficoltà e ρ.

| dimensione | campioni → valide | respinte | intervallo parole (Tukey+ρ) | dentro l’intervallo |
| --- | --- | --- | --- | --- |
| **4×4** | 2651 → **2000** | 651 (24,6%) | **[51, 162]** | 1400/2000 (70,0%) |
| **5×5** | 2410 → **2000** | 410 (17,0%) | **[141, 359]** | 1366/2000 (68,3%) |
| **6×6** | 2251 → **2000** | 251 (11,2%) | **[271, 641]** | 1337/2000 (66,8%) |

Parole per griglia (campione di 2000):

| dimensione | min | q1 | mediana | q3 | max | media |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 10 | 72 | 104 | 151 | 444 | 117 |
| 5×5 | 32 | 178 | 247 | 334 | 827 | 266 |
| 6×6 | 96 | 332 | 452 | 596 | 1505 | 485 |

Rarità `R`, ricchezza `M` e difficoltà composita `0.5·R + 0.5·M` (campione di
2000):

| dimensione | R (media ± sd) | M (media ± sd) | M [min, max] | composita (media ± sd) | composita [min, max] |
| --- | --- | --- | --- | --- | --- |
| 4×4 | 0,565 ± 0,074 | 0,597 ± 0,055 | [0,353, 0,728] | 0,581 ± 0,046 | [0,372, 0,743] |
| 5×5 | 0,580 ± 0,055 | 0,649 ± 0,045 | [0,407, 0,758] | 0,615 ± 0,037 | [0,429, 0,707] |
| 6×6 | 0,590 ± 0,043 | 0,680 ± 0,037 | [0,521, 0,770] | 0,635 ± 0,030 | [0,522, 0,711] |

`M` cresce con la dimensione (0,597 → 0,649 → 0,680): le griglie grandi hanno
parole mediamente più lunghe, quindi punteggio medio per parola più alto. Anche
`R` cresce leggermente (0,565 → 0,590): più parole pescate dal dizionario
intero portano più forme fuori dal vocabolario comune.

**Fasce di difficoltà** (k-means k=3 usato in tutte e tre le dimensioni):

| dimensione | facile (centro · intervallo) | normale | difficile | distribuzione f/n/d |
| --- | --- | --- | --- | --- |
| 4×4 | 0,526 · [0, 0,552] | 0,578 · [0,552, 0,603] | 0,628 · [0,603, 1] | 24,8% / 42,6% / 32,6% |
| 5×5 | 0,578 · [0, 0,598] | 0,617 · [0,598, 0,636] | 0,655 · [0,636, 1] | 30,0% / 41,3% / 28,6% |
| 6×6 | 0,605 · [0, 0,620] | 0,636 · [0,620, 0,651] | 0,667 · [0,651, 1] | 30,0% / 39,2% / 30,8% |

I cluster sono **sani e bilanciati in ogni dimensione** (il più piccolo copre il
24,8% del campione di 2000, ben oltre il minimo di validazione ≥ max(15, 10%)),
quindi il fallback ai tertili non serve mai. Con il campione da 2000 le fasce
sono anche più **stabili** e **più bilanciate** rispetto al campione da 500
(il facile su 4×4 è passato dal 18,0% al 24,8%). I confini crescono con la
dimensione (es. facile/normale: 0,552 → 0,598 → 0,620) perché sia `R` sia `M`
crescono: le fasce sono calibrate **per dimensione** e significano
“facile/normale/difficile **a parità di dimensione**”.

---

## 4. Prima generazione (15 schede per fascia e per dimensione)

**Perché sono stati respinti i campioni dei guard rail** (un campione può violare
più regole, quindi la somma può superare i campioni respinti):

| dimensione · fascia | vocali fuori banda | rari H/Z/QU > 3 | righe/colonne senza soluzioni |
| --- | --- | --- | --- |
| 4×4 · facile | 24 | 0 | 0 |
| 4×4 · normale | 22 | 0 | 0 |
| 4×4 · difficile | 38 | 0 | 1 colonna |
| 5×5 · facile | 18 | 0 | 0 |
| 5×5 · normale | 11 | 0 | 0 |
| 5×5 · difficile | 31 | 0 | 0 |
| 6×6 · facile | 11 | 1 | 0 |
| 6×6 · normale | 6 | 0 | 0 |
| 6×6 · difficile | 11 | 1 | 0 |

La banda vocali resta la regola che scarta di più; la copertura e il tetto dei
rari intervengono raramente.

**Reiezioni del ciclo di produzione** (griglie valide ma fuori target) e
**tentativi per scheda**:

| dimensione · fascia | fuori intervallo parole | difficoltà fuori fascia | tentativi (media · max) | accettate al 1° |
| --- | --- | --- | --- | --- |
| 4×4 · facile | 23 | 29 | 3,5 · 16 | 4/15 |
| 4×4 · normale | 24 | 23 | 3,1 · 10 | 5/15 |
| 4×4 · difficile | 35 | 57 | 6,1 · 23 | 4/15 |
| 5×5 · facile | 28 | 32 | 4,0 · 11 | 3/15 |
| 5×5 · normale | 13 | 13 | 1,7 · 6 | 4/15 |
| 5×5 · difficile | 33 | 56 | 5,9 · 15 | 1/15 |
| 6×6 · facile | 23 | 34 | 3,8 · 12 | 4/15 |
| 6×6 · normale | 11 | 22 | 2,2 · 8 | 2/15 |
| 6×6 · difficile | 19 | 35 | 3,6 · 17 | 2/15 |

Con ρ=0,35 gli scarti “fuori intervallo parole” sono cresciuti rispetto a ρ=0,6
(è il prezzo voluto della banda stretta: ~30% dei candidati validi è fuori
intervallo, contro ~10% prima), ma restano economici: media 1,7–6,1 tentativi
per scheda, max 23 su 500, **nessun ripiego** sul candidato più vicino.

**Schede prodotte** (parole · difficoltà composita), tutte in banda e nella
fascia richiesta, tutte **15/15 identiche al catalogo**:

| dimensione · fascia | parole | difficoltà (centro fascia) |
| --- | --- | --- |
| 4×4 · facile | 55–158 (media 92) | 0,485–0,551 (0,526) |
| 4×4 · normale | 51–154 (media 97) | 0,559–0,602 (0,578) |
| 4×4 · difficile | 74–162 (media 118) | 0,609–0,662 (0,628) |
| 5×5 · facile | 142–333 (media 212) | 0,530–0,597 (0,578) |
| 5×5 · normale | 153–347 (media 240) | 0,598–0,632 (0,617) |
| 5×5 · difficile | 176–355 (media 266) | 0,643–0,676 (0,655) |
| 6×6 · facile | 288–499 (media 386) | 0,578–0,619 (0,605) |
| 6×6 · normale | 303–561 (media 456) | 0,625–0,650 (0,636) |
| 6×6 · difficile | 280–617 (media 463) | 0,656–0,693 (0,667) |

Lo **spread di parole per fascia si è ridotto** rispetto alla calibrazione con
ρ=0,6: sul 4×4 la fascia difficile è passata da 32–202 (ampiezza 170) a 74–162
(ampiezza 88), e l'intera forbice possibile è quasi dimezzata ([22, 207] →
[51, 162]). La varianza residua dentro una fascia non viene dal numero di parole
in sé — che la banda tiene stretta — ma dal fatto che la difficoltà non dipende
più dalla quantità: due schede con 90 o 140 parole possono avere la stessa `D`
se parole e punteggi medi si compensano.

**Composizione delle schede prodotte** (medie per fascia, dal catalogo):

| dimensione · fascia | R (rarità) | M (ricchezza) | punti medi | punti/parola |
| --- | --- | --- | --- | --- |
| 4×4 · facile | 0,495 | 0,557 | 215 | 2,3 |
| 4×4 · normale | 0,556 | 0,596 | 247 | 2,5 |
| 4×4 · difficile | 0,635 | 0,628 | 321 | 2,7 |
| 5×5 · facile | 0,531 | 0,633 | 590 | 2,8 |
| 5×5 · normale | 0,584 | 0,649 | 696 | 2,9 |
| 5×5 · difficile | 0,634 | 0,673 | 823 | 3,1 |
| 6×6 · facile | 0,544 | 0,661 | 1154 | 3,0 |
| 6×6 · normale | 0,593 | 0,684 | 1454 | 3,2 |
| 6×6 · difficile | 0,633 | 0,698 | 1546 | 3,3 |

Entrambe le componenti **crescono da facile a difficile in ogni dimensione**:
le fasce separate da `D` separano sia `R` sia `M`, non una a scapito dell'altra.

---

## 5. Cosa dicono i numeri

- **“Facile” vuol dire “parole comuni e corte”, non “tante parole”.** Il numero
  di parole non conta più in sé nella difficoltà: una board è facile se le sue
  parole sono comuni (`R` basso) e valgono poco (`M` basso, cioè corte — su 4×4
  facile 2,3 punti/parola ≈ lunghezza media 4,3), difficile se sono rare e
  lunghe. L'intervallo calibrato di parole resta come guard rail di
  giocabilità, e con ρ=0,35 è stretto: una scheda è sempre né spopolata né
  sovraffollata rispetto alla mediana della sua dimensione.
- **La banda stretta si paga in scarti, non in qualità.** In produzione ~30%
  dei candidati conformi ai guard rails esce dall'intervallo di parole (era
  ~10% con ρ=0,6): il ciclo di reiezione li sostituisce in pochi tentativi
  (max 23 su 500) e tutte le 135 schede escono in banda e in fascia.
- **Le fasce sono ben separate e stabili.** La composita si concentra in
  ~[0,37, 0,74] (4×4) con sd ~0,03–0,05: `R` e `M` sono correlate (griglie
  ricche di parole pescano più forme rare) e sommandole a metà la coda si
  assottiglia. I confini di fascia sono stretti ma netti: in produzione le 15
  schede per fascia cadono tutte dentro il proprio intervallo senza ripieghi.
- **Il campione da 2000 stabilizza i quartili.** Con 500 campioni la mediana di
  parole su 4×4 era 112, con 2000 è 104: i quartili si muovono di qualche punto
  e i confini di fascia si stabilizzano (e i cluster si bilanciano: facile 4×4
  18,0% → 24,8%). La calibrazione va quindi considerata legata al numero di
  campioni: gli script offline usano 2000 di default; il fallback runtime di
  `ale.ts` ne usa 500 solo se manca `calibration.json` (caso d'emergenza: il
  file è versionato).
- **La difficoltà cresce con la dimensione della griglia.** I centri di fascia
  salgono da 4×4 (0,53/0,58/0,63) a 6×6 (0,61/0,64/0,67): griglie più grandi
  hanno più parole, più lunghe (M cresce) e più rare (R cresce). Le fasce sono
  calibrate per dimensione, quindi “difficile 4×4” e “difficile 6×6” non sono
  sullo stesso punto della scala: sono il terzo superiore **della propria
  dimensione**.
- **La distribuzione è sana e i pesi 0.5/0.5 non richiedono correzioni.**
  k-means converge ovunque con cluster da 495 a 852 griglie su 2000 (25–43%);
  nessun cluster sotto il minimo di validazione.

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
- I guard rail, i **pesi della difficoltà** e **ρ** devono essere **identici** in
  calibrazione e produzione: cambiarli invalida `calibration.json` (il file li
  registra in `guardRails`, `provenance.weights` e `provenance.rho`, e il
  runtime li verifica tutti prima di fidarsi della calibrazione committata).
  È quello che è successo il 28/09 con la nuova metrica `0.5·R + 0.5·M` e
  ρ=0,35: calibrazione rifatta su 2000 griglie per tutte e tre le dimensioni e
  135 schede ale rigenerate.
