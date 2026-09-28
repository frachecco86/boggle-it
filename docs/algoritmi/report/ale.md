# Report — algoritmo `ale`

Numeri della **calibrazione** (2000 griglie per dimensione) e della **prima
generazione a tre secchi**, con la metrica di difficoltà ad **anelli di
frequenza** (`rings-v1`): `R = (f1 + 2·f2)/2`, `D = 0.5·R + 0.5·M`, **ρ = 0,35**.
Per **tutte e tre le dimensioni** (4×4, 5×5, 6×6), 15 schede per fascia, seed 1.

Rigenerabile con:

```bash
pnpm --filter @boggle/server report:ale -- --all-sizes --n 15 --seed 1 --samples 2000
```

Stesso comando, stessi numeri: la pipeline è deterministica (`mulberry32`,
tentativi `seed + attempt`). La misura usa **gli stessi ingressi della
produzione** (`src/ale.ts`, condiviso con `gen-schede-ale.ts` e con il pulsante
“Genera” del pannello admin), non una copia. La riproduzione è verificata in
fondo: le griglie prodotte coincidono **15/15 per fascia** con quelle del
catalogo in tutte le dimensioni.

- Data della misura: 29/09/2026
- Codice: `packages/shared/src/schedaAle.ts`
- Script: `apps/server/scripts/report-ale.ts`
- Calibrazione: `packages/dictionary/data/ale/calibration.json`

---

## 1. Cosa è cambiato in questa versione

Rispetto al report precedente (metrica `Common` = NVdB ∩ Dict' con ponte sui
lemmi):

1. **Nuova rarità `R` — anelli di frequenza** (`rings-v1`). Al posto della quota
   binaria di parole fuori dal vocabolario comune si usano tre anelli da
   `frequency-it.txt`: 0 = top-5000, 1 = 5001–20000, 2 = oltre. Con `f0/f1/f2` le
   quote nei tre anelli, `R = (f1 + 2·f2)/2 ∈ [0, 1]`. L'anello raro pesa
   doppio: la metrica è **graduata**, non binaria. NVdB, `lemmas.br` e Morph-it
   **non servono più** alla pipeline ale.
2. **Nuovi guard rails**: `structure` (`gridStructureIssues`) e
   `anchorMinLength` (almeno una parola di 6/7/8 lettere su 4×4/5×5/6×6).
3. **Bande di parole per fascia**: dopo il k-means, ogni fascia riceve la propria
   banda con lo stesso Tukey+ρ, tagliata al range globale. In produzione un
   candidato deve stare nel range globale **e** nella banda della sua fascia.
4. **Generazione a tre secchi**: un solo flusso di candidati; ognuno entra nel
   secchio della fascia in cui cade naturalmente. Gli scarti “difficoltà fuori
   fascia” spariscono per costruzione.

Il **resto della pipeline è invariato**: campionamento per frequenza dei token →
guard rails → intervallo globale di parole (Tukey + ρ) → k-means k=3 sulla
difficoltà composita → produzione deterministica.

---

## 2. Ingressi (comuni alle tre dimensioni)

| voce | valore |
| --- | --- |
| `Dict` → `Dict'` | 368.101 → **368.098** voci |
| anelli `easy` / `medium` | **5.000 / 20.000** (da `frequency-it.txt`, voci valide dopo pulizia) |
| alfabeto | **26 token**, `QU` unico: `a b c d e f g h i j k l m n o p r s t u v w x y z qu` |
| token più frequenti | `i` 78,2% · `a` 76,3% · `e` 66,7% · `r` 63,3% · `o` 63,0% · `t` 54,2% · `s` 51,9% · `n` 48,6% · `c` 37,7% · `m` 35,0% |
| guard rails | vocali **30–60%** · **al più 3** token rari H/Z/QU · **struttura giocabile** · **nessuna riga/colonna senza soluzioni** · **ancora ≥ 6/7/8 lettere** (4/5/6) |

La **frequenza** di un token è la frazione di voci di `Dict'` che lo contengono
almeno una volta: è ciò che guida il campionamento delle celle.

---

## 3. Calibrazione (2000 griglie valide per dimensione)

| dimensione | campioni → valide | respinte | intervallo globale di parole | dentro l’intervallo | k-means |
| --- | --- | --- | --- | --- | --- |
| **4×4** | 3517 → **2000** | 1517 (43,1%) | **[60, 171]** | 1392/2000 (69,6%) | sì |
| **5×5** | 3115 → **2000** | 1115 (35,8%) | **[155, 376]** | 1377/2000 (68,8%) | sì |
| **6×6** | 3005 → **2000** | 1005 (33,4%) | **[300, 650]** | 1323/2000 (66,1%) | sì |

`perTierFallback` è **no** in tutte e tre le dimensioni (nessuna fascia sotto i 30
membri); il fallback ai tertili non serve mai.

**Parole per griglia** (campione di 2000):

| dimensione | min | q1 | mediana | q3 | max | media |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 16 | 80 | 113 | 159 | 444 | 126 |
| 5×5 | 43 | 192 | 262 | 350 | 827 | 280 |
| 6×6 | 96 | 357 | 471,5 | 607 | 1439 | 504 |

**Quote medie per anello, rarità `R`, ricchezza `M` e difficoltà `D`**:

| dimensione | f0 | f1 | f2 | R (media ± sd) | M (media ± sd) | D (media ± sd) | D [min, max] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 0,209 | 0,221 | 0,570 | 0,680 ± 0,056 | 0,604 ± 0,050 | 0,642 ± 0,045 | [0,476, 0,756] |
| 5×5 | 0,183 | 0,204 | 0,613 | 0,715 ± 0,045 | 0,653 ± 0,043 | 0,684 ± 0,039 | [0,516, 0,786] |
| 6×6 | 0,166 | 0,192 | 0,642 | 0,738 ± 0,037 | 0,683 ± 0,035 | 0,711 ± 0,033 | [0,586, 0,796] |

Le quote per anello mostrano che la quota di parole fuori dai top-20000 (`f2`)
**cresce con la dimensione** (0,570 → 0,642): griglie più grandi pescano più
forme rare dal dizionario intero. Anche `R` (0,680 → 0,738) e `M` (0,604 → 0,683)
crescono, come atteso.

**Fasce di difficoltà e bande di parole** (k-means k=3 usato in tutte e tre le
dimensioni):

| dimensione | fascia | centro `D` | intervallo `D` | banda parole | griglie del campione |
| --- | --- | --- | --- | --- | --- |
| 4×4 | facile | 0,583 | [0,000, 0,608] | [62, 102] | 428 (21,4%) |
| 4×4 | normale | 0,632 | [0,608, 0,656] | [74, 136] | 747 (37,4%) |
| 4×4 | difficile | 0,679 | [0,656, 1,000] | [95, 161] | 825 (41,3%) |
| 5×5 | facile | 0,643 | [0,000, 0,662] | [163, 237] | 516 (25,8%) |
| 5×5 | normale | 0,681 | [0,662, 0,699] | [193, 319] | 718 (35,9%) |
| 5×5 | difficile | 0,716 | [0,699, 1,000] | [234, 356] | 766 (38,3%) |
| 6×6 | facile | 0,677 | [0,000, 0,692] | [302, 440] | 552 (27,6%) |
| 6×6 | normale | 0,707 | [0,692, 0,722] | [371, 543] | 655 (32,8%) |
| 6×6 | difficile | 0,737 | [0,722, 1,000] | [444, 615] | 793 (39,6%) |

I cluster sono **sani e bilanciati** (il più piccolo copre il 21,4% del campione,
ben oltre il minimo di validazione ≥ max(15, 10%)). Le bande di fascia sono più
strette del range globale e si sovrappongono tra fasce adiacenti: la difficoltà
resta “parole rare e lunghe”, non “poche parole”.

---

## 4. Prima generazione a tre secchi (15 schede per fascia e dimensione)

**Scarti dei guard rails** (un campione può violare più regole, quindi la somma
può superare i campioni respinti):

| dimensione | vocali | struttura | ancora | copertura | rari | campioni respinti |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 52 (24,2%) | 46 (21,4%) | 0 | 0 | 0 | 95 (44,2%) |
| 5×5 | 32 (17,4%) | 40 (21,7%) | 0 | 0 | 0 | 70 (38,0%) |
| 6×6 | 22 (10,9%) | 64 (31,8%) | 0 | 0 | 0 | 77 (38,1%) |

“Struttura” raggruppa `h` senza `c`/`g`, righe/colonne senza vocali, consonanti
lontane da una vocale e lettere non italiane. La banda vocali e la struttura sono
le regole che scartano di più; copertura, rari e ancora intervengono raramente.

**Flusso e reiezioni esterne** (griglie valide ma fuori target):

| dimensione | tentativi del flusso | fuori range globale | fuori banda fascia | ripieghi |
| --- | --- | --- | --- | --- |
| 4×4 | 120 | 43 | 23 | 0 |
| 5×5 | 114 | 28 | 26 | 0 |
| 6×6 | 125 | 42 | 25 | 0 |

**Schede prodotte** (parole · difficoltà · rarità media), tutte in banda globale
**e** di fascia, **nessun ripiego**, **15/15 identiche al catalogo**:

| dimensione · fascia | parole | difficoltà (centro) | R media | in banda |
| --- | --- | --- | --- | --- |
| 4×4 · facile | 64–102 (media 83) | 0,541–0,605 (0,583) | 0,619 | 15/15 |
| 4×4 · normale | 81–135 (media 114) | 0,615–0,654 (0,632) | 0,670 | 15/15 |
| 4×4 · difficile | 98–152 (media 120) | 0,656–0,749 (0,679) | 0,729 | 15/15 |
| 5×5 · facile | 166–226 (media 198) | 0,610–0,659 (0,643) | 0,657 | 15/15 |
| 5×5 · normale | 205–302 (media 246) | 0,664–0,698 (0,681) | 0,716 | 15/15 |
| 5×5 · difficile | 238–355 (media 309) | 0,706–0,737 (0,716) | 0,753 | 15/15 |
| 6×6 · facile | 313–435 (media 367) | 0,640–0,691 (0,677) | 0,697 | 15/15 |
| 6×6 · normale | 408–529 (media 464) | 0,695–0,721 (0,707) | 0,734 | 15/15 |
| 6×6 · difficile | 456–613 (media 551) | 0,722–0,782 (0,737) | 0,769 | 15/15 |

La rarità media è **ordinata per fascia** in ogni dimensione
(facile < normale < difficile): le fasce separate da `D` separano davvero `R`, e
la generazione a secchi non richiede ripieghi.

---

## 5. Cosa dicono i numeri

- **La metrica ad anelli è graduata e stabile.** `R` media cresce con la
  dimensione (0,680 / 0,715 / 0,738) e con `f2` (0,570 / 0,613 / 0,642): più
  parole pescate dal dizionario intero portano più forme rare. L'anello raro che
  pesa doppio alza il livello medio di `R` rispetto alla vecchia metrica binaria,
  ma le fasce si ri-centrano da sole in calibrazione.
- **I nuovi rail non rendono la generazione impraticabile.** L'ancora non
  respinge praticamente mai (0–1 violazioni per dimensione in calibrazione,
  0 in produzione): le griglie ale hanno già quasi sempre una parola lunga. La
  struttura invece è la seconda regola per numero di scarti (fino al ~32% dei
  campioni su 6×6), ma è un costo sostenibile: il flusso completa i 45 secchi in
  114–125 tentativi.
- **Le bande di fascia sono più strette del range globale e non ordinate.** Es.
  4×4: globale [60, 171], bande [62, 102] / [74, 136] / [95, 161]. Si
  sovrappongono (non si impone “facile = tante parole”): la difficoltà è parole
  rare e lunghe, non la quantità.
- **La generazione a tre secchi azzera le reiezioni di fascia per costruzione.**
  Non esiste più il contatore `difficultyOut`: restano `wordCountOut` (fuori range
  globale), `tierBandOut` (fuori banda di fascia) e i guard rails. Nessun ripiego
  in nessuna dimensione.
- **Ogni scheda ha ≥ 1 parola ancora e zero problemi di struttura**, ed è in
  banda globale + fascia: i criteri di accettazione sono soddisfatti in tutte e
  tre le dimensioni.

---

## 6. Note di riproducibilità

- La pipeline ale **non richiede più** `lemmas.br`, `nvdb.words.txt` né Morph-it:
  bastano `words.txt` (dizionario) e `frequency-it.txt` (anelli). Gli strumenti
  legacy restano nel repo solo come storico (`packages/dictionary/scripts/build-ale-lemmas.mjs`).
- La calibrazione dipende dalla **dimensione** della griglia: `calibration.json`
  contiene tutte e tre le voci (`bySize`). Il runtime la usa solo se
  `guardRails`, `weights`, `rho`, `metric` (`rings-v1`) e `rings` coincidono con
  quelli correnti; altrimenti ricalcola al volo.
- Lo script `gen:schede:ale` non accetta più `--difficolta`: la generazione è
  sempre per tutte e tre le fasce insieme (usa `--n` per il numero per fascia).
- Dopo la rigenerazione va copiato il bundle web:
  `node apps/web/scripts/copy-schede.mjs`.
