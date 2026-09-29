# Report — algoritmo `ale`

Numeri della **calibrazione** (5000 griglie per dimensione) e della **generazione
a tre secchi**, con la metrica di difficoltà ad **anelli di frequenza**
(`rings-v1`): `R = (f1 + 2·f2)/2`, `D = 0.5·R + 0.5·M`, **ρ = 0,35**. Per **tutte
e tre le dimensioni** (4×4, 5×5, 6×6), 15 schede per fascia, seed 1.

Rigenerabile con:

```bash
pnpm --filter @boggle/server report:ale -- --all-sizes --n 15 --seed 1 --samples 5000
```

Stesso comando, stessi numeri: la pipeline è deterministica (`mulberry32`,
tentativi `seed + attempt`). La misura usa **gli stessi ingressi della
produzione** (`src/ale.ts`, condiviso con `gen-schede-ale.ts` e con il pulsante
“Genera” del pannello admin), non una copia. La riproduzione è verificata in
fondo: le griglie prodotte coincidono **15/15 per fascia** con quelle del catalogo
in tutte le dimensioni.

- Data della misura: 29/09/2026
- Codice: `packages/shared/src/schedaAle.ts`
- Script: `apps/server/scripts/report-ale.ts`
- Calibrazione: `packages/dictionary/data/ale/calibration.json`

---

## 1. Cosa è cambiato in questa versione

Questa revisione introduce la **presenza controllata delle lettere rare** (H, Z,
Qu) per fascia, mantenendo la pipeline a campionamento per frequenza:

1. **`qu` non è più una vocale.** `ALE_VOWEL_TOKENS = {a,e,i,o,u}`, come nel full.
   La banda vocali (30–60%) non limita più la presenza di `Qu` e la regola di
   struttura è coerente con `VOWELS`.
2. **`tokenFloor` di campionamento per `qu`** (`{ qu: 0.003 }`), in **quota di
   cella**: circa una cella su 333 è `QU` (contro lo 0,18% naturale). Il peso si
   converte con `w = p·(Σf−f_t)/(1−p)`. È un floor **molto leggero**: alza `Qu`
   da “quasi assente” a “presente in una minoranza di schede”, senza dominare la
   griglia.
3. **`rareByTier`**: gate di *accettazione* applicato **dopo** la fascia naturale
   (`facile: {max:1}`, `normale: {}`, `difficile: {min:1}`). È un filtro, non
   cambia `D` né i confini k-means: la calibrazione resta a **una passata**.
4. **`h` posizionale calibrata** (`hNearCG`, `hBoost = 1`): la `h` è piazzata solo
   su celle adiacenti a `c`/`g`, con probabilità derivata dalla sua marginale
   naturale di cella (`m_h = f_h/Σf ≈ 0,93%`). La frequenza aggregata di `h`
   resta quella naturale, ma la struttura non la scarta più: le reiezioni
   “h senza c/g” scendono a **zero**. Con il floor di `qu` così basso, la `h`
   diventa la rara più frequente.
5. **`rareCap` resta fisso a 3**, come rete di sicurezza (non viene mai raggiunto
   nei flussi di produzione).

Il resto della pipeline è invariato: campionamento per frequenza dei token →
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
| guard rails | vocali **30–60%** (`qu` escluso) · **al più 3** token rari H/Z/QU · **struttura giocabile** · **nessuna riga/colonna senza soluzioni** · **ancora ≥ 6/7/8 lettere** (4/5/6) |
| presenza rare | `tokenFloor {qu: 0.003}` · `rareByTier` facile `{max:1}`, normale `{}`, difficile `{min:1}` · `h` posizionale (`hBoost 1`) |

La **frequenza** di un token è la frazione di voci di `Dict'` che lo contengono
almeno una volta: è ciò che guida il campionamento delle celle.

---

## 3. Calibrazione (5000 griglie valide per dimensione)

| dimensione | campioni → valide | respinte | intervallo globale di parole | dentro l’intervallo | k-means |
| --- | --- | --- | --- | --- | --- |
| **4×4** | 7803 → **5000** | 2803 (35,9%) | **[61, 167]** | 3391/5000 (67,8%) | sì |
| **5×5** | 6694 → **5000** | 1694 (25,3%) | **[152, 366]** | 3360/5000 (67,2%) | sì |
| **6×6** | 6218 → **5000** | 1218 (19,6%) | **[295, 641]** | 3311/5000 (66,2%) | sì |

`perTierFallback` è **no** in tutte e tre le dimensioni; il fallback ai tertili
non serve mai.

**Parole per griglia** (campione di 5000):

| dimensione | min | q1 | mediana | q3 | max | media |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 10 | 79 | 112 | 155 | 492 | 123 |
| 5×5 | 33 | 187 | 256 | 340 | 1086 | 275 |
| 6×6 | 83 | 353 | 463 | 600 | 1804 | 494 |

**Quote medie per anello, rarità `R`, ricchezza `M` e difficoltà `D`**:

| dimensione | f0 | f1 | f2 | R (media ± sd) | M (media ± sd) | D (media ± sd) | D [min, max] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 0,211 | 0,220 | 0,569 | 0,679 ± 0,059 | 0,602 ± 0,052 | 0,641 ± 0,048 | [0,413, 0,769] |
| 5×5 | 0,183 | 0,204 | 0,613 | 0,715 ± 0,044 | 0,652 ± 0,042 | 0,684 ± 0,038 | [0,498, 0,797] |
| 6×6 | 0,167 | 0,193 | 0,640 | 0,736 ± 0,038 | 0,682 ± 0,036 | 0,709 ± 0,034 | [0,569, 0,803] |

Le quote per anello mostrano che la quota di parole fuori dai top-20000 (`f2`)
**cresce con la dimensione** (0,569 → 0,640): griglie più grandi pescano più
forme rare dal dizionario intero. Anche `R` (0,679 → 0,736) e `M` (0,602 → 0,682)
crescono, come atteso.

**Fasce di difficoltà e bande di parole** (k-means k=3 usato in tutte e tre le
dimensioni):

| dimensione | fascia | centro `D` | intervallo `D` | banda parole | griglie del campione |
| --- | --- | --- | --- | --- | --- |
| 4×4 | facile | 0,583 | [0,000, 0,608] | [64, 103] | 1149 (23,0%) |
| 4×4 | normale | 0,633 | [0,608, 0,656] | [78, 136] | 1850 (37,0%) |
| 4×4 | difficile | 0,679 | [0,656, 1,000] | [95, 156] | 2001 (40,0%) |
| 5×5 | facile | 0,641 | [0,000, 0,660] | [157, 233] | 1275 (25,5%) |
| 5×5 | normale | 0,680 | [0,660, 0,697] | [191, 303] | 1763 (35,3%) |
| 5×5 | difficile | 0,714 | [0,697, 1,000] | [232, 347] | 1962 (39,2%) |
| 6×6 | facile | 0,676 | [0,000, 0,692] | [310, 442] | 1461 (29,2%) |
| 6×6 | normale | 0,707 | [0,692, 0,722] | [360, 546] | 1656 (33,1%) |
| 6×6 | difficile | 0,737 | [0,722, 1,000] | [432, 616] | 1883 (37,7%) |

I cluster sono **sani e bilanciati** (il più piccolo copre il 23,0% del campione,
ben oltre il minimo di validazione ≥ max(15, 10%)). Le bande di fascia sono più
strette del range globale e si sovrappongono tra fasce adiacenti: la difficoltà
resta “parole rare e lunghe”, non “poche parole”.

---

## 4. Generazione a tre secchi (15 schede per fascia e dimensione)

**Scarti dei guard rails** (un campione può violare più regole). Le righe
“struttura (h)” e “rari > 3” sono **praticamente assenti**: il piazzamento
posizionale elimina le `h` isolate e il floor non raggiunge mai il cap.

| dimensione | vocali | struttura (righe/col.) | respinti |
| --- | --- | --- | --- |
| 4×4 | 197 (23,8%) | 100 (12,1%) | 301 (36,3%) |
| 5×5 | 77 (19,8%) | 32 (8,2%) | 108 (27,8%) |
| 6×6 | 50 (14,7%) | 20 (5,9%) | 64 (18,8%) |

**Flusso e reiezioni esterne** (griglie valide ma fuori target):

| dimensione | tentativi del flusso | fuori range globale | fuori banda fascia | gate rari fascia | ripieghi |
| --- | --- | --- | --- | --- | --- |
| 4×4 | 528 | 171 | 116 | 78 | 0 |
| 5×5 | 280 | 93 | 64 | 25 | 0 |
| 6×6 | 277 | 88 | 57 | 28 | 0 |

**Presenza delle lettere rare per fascia** (`q` = token `QU`; “almeno una” = H, Z
o Qu):

| dimensione · fascia | `Qu` | `h` | `z` | almeno una | rare medie |
| --- | --- | --- | --- | --- | --- |
| 4×4 · facile | 0,0% | 20,0% | 13,3% | 33,3% | 0,33 |
| 4×4 · normale | 20,0% | 26,7% | 6,7% | 46,7% | 0,53 |
| 4×4 · difficile | 6,7% | 60,0% | 66,7% | **100,0%** | 1,33 |
| 5×5 · facile | 0,0% | 26,7% | 33,3% | 60,0% | 0,60 |
| 5×5 · normale | 0,0% | 6,7% | 13,3% | 20,0% | 0,20 |
| 5×5 · difficile | 26,7% | 40,0% | 40,0% | **100,0%** | 1,13 |
| 6×6 · facile | 13,3% | 13,3% | 13,3% | 40,0% | 0,40 |
| 6×6 · normale | 0,0% | 33,3% | 46,7% | 66,7% | 1,00 |
| 6×6 · difficile | 26,7% | 20,0% | 86,7% | **100,0%** | 1,33 |

Ogni scheda difficile ha **almeno una** lettera rara (100% in tutte le
dimensioni). Con il floor allo 0,3%, `Qu` è presente nello 0–27% delle schede
(era lo 0% prima del floor) mentre `h` e `z` sono le rare più visibili su
difficile (fino a 60% e 87%).

**Schede prodotte** (parole · difficoltà · rarità media), tutte in banda globale
**e** di fascia, **nessun ripiego**, **15/15 identiche al catalogo**:

| dimensione · fascia | parole | difficoltà (centro) | in banda |
| --- | --- | --- | --- |
| 4×4 · facile | 64–100 (media 81) | 0,555–0,607 (0,583) | 15/15 |
| 4×4 · normale | 79–136 (media 109) | 0,613–0,655 (0,633) | 15/15 |
| 4×4 · difficile | 95–148 (media 117) | 0,657–0,711 (0,679) | 15/15 |
| 5×5 · facile | 158–223 (media 190) | 0,619–0,659 (0,641) | 15/15 |
| 5×5 · normale | 193–300 (media 247) | 0,661–0,696 (0,680) | 15/15 |
| 5×5 · difficile | 236–345 (media 301) | 0,698–0,752 (0,714) | 15/15 |
| 6×6 · facile | 318–435 (media 366) | 0,653–0,691 (0,676) | 15/15 |
| 6×6 · normale | 369–544 (media 457) | 0,693–0,721 (0,707) | 15/15 |
| 6×6 · difficile | 436–614 (media 536) | 0,722–0,780 (0,737) | 15/15 |

---

## 5. Cosa dicono i numeri

- **Il floor di `qu` è molto leggero.** Porta `Qu` dallo ~0% allo 0–27% delle
  schede, con un costo di validità quasi nullo; il gate per fascia lo concentra
  su difficile (7–27%). Non domina la griglia.
- **La `h` posizionale azzera gli scarti di struttura.** “h senza c/g” non
  compare più tra i motivi di scarto; con il floor basso la `h` è la rara più
  presente (6,7–60%), alla sua frequenza naturale.
- **Il cap 3 non è mai raggiunto in produzione**: le rare medie restano basse e il
  tetto fa da semplice rete di sicurezza.
- **Ogni scheda difficile ha almeno una rara** (gate): su difficile dominano `z`
  e `h`.
- **La generazione a tre secchi resta senza ripieghi**, ma con il floor più basso
  il gate rari scarta una frazione maggiore di candidati (fino a 78 su 4×4): i
  secchi si riempiono comunque in 277–528 tentativi.

---

## 6. Note di riproducibilità

- La pipeline ale **non richiede** `lemmas.br`, `nvdb.words.txt` né Morph-it:
  bastano `words.txt` (dizionario) e `frequency-it.txt` (anelli). Gli strumenti
  legacy restano nel repo solo come storico (`packages/dictionary/scripts/build-ale-lemmas.mjs`).
- La calibrazione dipende dalla **dimensione** della griglia: `calibration.json`
  contiene tutte e tre le voci (`bySize`). Il runtime la usa solo se
  `guardRails` (inclusi `tokenFloor`, `rareByTier`, `hNearCG`, `hBoost`),
  `weights`, `rho`, `metric` (`rings-v1`) e `rings` coincidono con quelli
  correnti; altrimenti ricalcola al volo.
- Cambiare `DEFAULT_ALE_GUARD_RAILS` invalida da solo la calibrazione committata
  (confronto deep-equal in `apps/server/src/ale.ts`).
- Le schede ale generate dall’admin a runtime vivono in `DATA_DIR/schede-ale/` e
  vanno cancellate/rigenerate quando cambia la calibrazione (svuotare la
  cartella: il server le ricarica all’avvio).
- Dopo la rigenerazione va copiato il bundle web:
  `node apps/web/scripts/copy-schede.mjs`.
