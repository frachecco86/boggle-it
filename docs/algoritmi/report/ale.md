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
Qu) per fascia, mantenendo la pipeline a campionamento per frequenza e lo **score
lineare di `ale-full`** (`lunghezza − 2`):

1. **`qu` non è più una vocale.** `ALE_VOWEL_TOKENS = {a,e,i,o,u}`.
   La banda vocali (30–60%) non limita più la presenza di `Qu`.
2. **`tokenFloor` di campionamento per `qu`** (`{ qu: 0.006 }`), in **quota di
   cella**: circa una cella su 167 è `QU` (contro lo 0,18% naturale). Il peso si
   converte con `w = p·(Σf−f_t)/(1−p)`. È un floor **leggero**: alza `Qu` da
   “quasi assente” a “presente in una minoranza di schede”.
3. **`rareByTier`**: gate di *accettazione* applicato **dopo** la fascia naturale
   (`facile: {max:1}`, `normale: {}`, `difficile: {min:1}`). È un filtro, non
   cambia `D` né i confini k-means: la calibrazione resta a **una passata**.
4. **`h` posizionale calibrata** (`hNearCG`, `hBoost = 1`): la `h` è piazzata solo
   su celle adiacenti a `c`/`g`, con probabilità derivata dalla sua marginale
   naturale di cella (`m_h = f_h/Σf ≈ 0,93%`). Le reiezioni “h senza c/g”
   scendono a **zero**.
5. **`rareCap` resta fisso a 3**, come rete di sicurezza.

---

## 2. Ingressi (comuni alle tre dimensioni)

| voce | valore |
| --- | --- |
| `Dict` → `Dict'` | 368.101 → **368.098** voci |
| anelli `easy` / `medium` | **5.000 / 20.000** (da `frequency-it.txt`, voci valide dopo pulizia) |
| alfabeto | **26 token**, `QU` unico: `a b c d e f g h i j k l m n o p r s t u v w x y z qu` |
| token più frequenti | `i` 78,2% · `a` 76,3% · `e` 66,7% · `r` 63,3% · `o` 63,0% · `t` 54,2% · `s` 51,9% · `n` 48,6% · `c` 37,7% · `m` 35,0% |
| score | **lineare** (`lunghezza − 2`, come `ale-full`) |
| guard rails | vocali **30–60%** (`qu` escluso) · **al più 3** token rari H/Z/QU · **struttura giocabile** · **nessuna riga/colonna senza soluzioni** · **ancora ≥ 6/7/8 lettere** (4/5/6) |
| presenza rare | `tokenFloor {qu: 0.006}` · `rareByTier` facile `{max:1}`, normale `{}`, difficile `{min:1}` · `h` posizionale (`hBoost 1`) |

---

## 3. Calibrazione (5000 griglie valide per dimensione)

| dimensione | campioni → valide | respinte | intervallo globale di parole | dentro l’intervallo | k-means |
| --- | --- | --- | --- | --- | --- |
| **4×4** | 7908 → **5000** | 2908 (36,8%) | **[60, 166]** | 3394/5000 (67,9%) | sì |
| **5×5** | 6731 → **5000** | 1731 (25,7%) | **[148, 365]** | 3385/5000 (67,7%) | sì |
| **6×6** | 6291 → **5000** | 1291 (20,5%) | **[287, 637]** | 3349/5000 (67,0%) | sì |

`perTierFallback` è **no** in tutte e tre le dimensioni; il fallback ai tertili
non serve mai.

**Parole per griglia** (campione di 5000):

| dimensione | min | q1 | mediana | q3 | max | media |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 16 | 78 | 111 | 154 | 492 | 122 |
| 5×5 | 28 | 185 | 254 | 340 | 1100 | 273 |
| 6×6 | 87 | 347 | 456 | 597 | 1947 | 490 |

**Quote medie per anello, rarità `R`, ricchezza `M` e difficoltà `D`**:

| dimensione | f0 | f1 | f2 | R (media ± sd) | M (media ± sd) | D (media ± sd) | D [min, max] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 0,212 | 0,220 | 0,568 | 0,678 ± 0,060 | 0,601 ± 0,052 | 0,640 ± 0,048 | [0,416, 0,756] |
| 5×5 | 0,184 | 0,205 | 0,612 | 0,714 ± 0,044 | 0,652 ± 0,042 | 0,683 ± 0,039 | [0,439, 0,787] |
| 6×6 | 0,168 | 0,193 | 0,639 | 0,736 ± 0,038 | 0,681 ± 0,036 | 0,708 ± 0,034 | [0,562, 0,803] |

**Fasce di difficoltà e bande di parole** (k-means k=3 usato in tutte e tre le
dimensioni):

| dimensione | fascia | centro `D` | intervallo `D` | banda parole | griglie del campione |
| --- | --- | --- | --- | --- | --- |
| 4×4 | facile | 0,579 | [0,000, 0,605] | [62, 100] | 1069 (21,4%) |
| 4×4 | normale | 0,631 | [0,605, 0,655] | [77, 135] | 1922 (38,4%) |
| 4×4 | difficile | 0,679 | [0,655, 1,000] | [93, 155] | 2009 (40,2%) |
| 5×5 | facile | 0,639 | [0,000, 0,659] | [154, 229] | 1253 (25,1%) |
| 5×5 | normale | 0,679 | [0,659, 0,696] | [186, 305] | 1786 (35,7%) |
| 5×5 | difficile | 0,714 | [0,696, 1,000] | [230, 343] | 1961 (39,2%) |
| 6×6 | facile | 0,673 | [0,000, 0,689] | [300, 425] | 1354 (27,1%) |
| 6×6 | normale | 0,705 | [0,689, 0,720] | [349, 535] | 1666 (33,3%) |
| 6×6 | difficile | 0,735 | [0,720, 1,000] | [421, 608] | 1980 (39,6%) |

I cluster sono **sani e bilanciati** (il più piccolo copre il 21,4% del campione,
ben oltre il minimo di validazione ≥ max(15, 10%)).

---

## 4. Generazione a tre secchi (15 schede per fascia e dimensione)

**Scarti dei guard rails** (un campione può violare più regole). Le righe
“struttura (h)” e “rari > 3” sono **praticamente assenti**: il piazzamento
posizionale elimina le `h` isolate e il floor leggero non raggiunge il cap.

| dimensione | vocali | struttura (righe/col.) | respinti |
| --- | --- | --- | --- |
| 4×4 | 105 (24,9%) | 44 (10,4%) | 154 (36,5%) |
| 5×5 | 56 (16,6%) | 26 (7,7%) | 88 (26,1%) |
| 6×6 | 40 (16,1%) | 15 (6,0%) | 54 (21,8%) |

**Flusso e reiezioni esterne** (griglie valide ma fuori target):

| dimensione | tentativi del flusso | fuori range globale | fuori banda fascia | gate rari fascia | ripieghi |
| --- | --- | --- | --- | --- | --- |
| 4×4 | 268 | 86 | 52 | 42 | 0 |
| 5×5 | 249 | 85 | 45 | 17 | 0 |
| 6×6 | 194 | 72 | 33 | 22 | 0 |

**Presenza delle lettere rare per fascia** (`q` = token `QU`; “almeno una” = H, Z
o Qu):

| dimensione · fascia | `Qu` | `h` | `z` | almeno una | rare medie |
| --- | --- | --- | --- | --- | --- |
| 4×4 · facile | 0,0% | 13,3% | 6,7% | 20,0% | 0,20 |
| 4×4 · normale | 6,7% | 26,7% | 20,0% | 40,0% | 0,53 |
| 4×4 · difficile | 13,3% | 40,0% | 66,7% | **100,0%** | 1,20 |
| 5×5 · facile | 13,3% | 26,7% | 13,3% | 53,3% | 0,53 |
| 5×5 · normale | 6,7% | 6,7% | 6,7% | 20,0% | 0,20 |
| 5×5 · difficile | 26,7% | 46,7% | 26,7% | **100,0%** | 1,00 |
| 6×6 · facile | 0,0% | 20,0% | 20,0% | 40,0% | 0,40 |
| 6×6 · normale | 20,0% | 13,3% | 33,3% | 60,0% | 0,73 |
| 6×6 · difficile | 33,3% | 40,0% | 73,3% | **100,0%** | 1,53 |

Ogni scheda difficile ha **almeno una** lettera rara (100% in tutte le
dimensioni). `Qu` è presente nello 0–33% delle schede; `h` (prima quasi assente)
compare nel 6,7–46,7% senza alterarne la frequenza aggregata.

**Schede prodotte** (parole · difficoltà · rarità media), tutte in banda globale
**e** di fascia, **nessun ripiego**, **15/15 identiche al catalogo**:

| dimensione · fascia | parole | difficoltà (centro) | R media | in banda |
| --- | --- | --- | --- | --- |
| 4×4 · facile | 63–97 (media 78) | 0,505–0,603 (0,579) | 0,614 | 15/15 |
| 4×4 · normale | 79–133 (media 106) | 0,613–0,653 (0,631) | 0,676 | 15/15 |
| 4×4 · difficile | 93–148 (media 115) | 0,662–0,690 (0,679) | 0,728 | 15/15 |
| 5×5 · facile | 156–227 (media 185) | 0,610–0,650 (0,639) | 0,653 | 15/15 |
| 5×5 · normale | 199–294 (media 238) | 0,659–0,694 (0,679) | 0,703 | 15/15 |
| 5×5 · difficile | 236–342 (media 291) | 0,696–0,783 (0,714) | 0,752 | 15/15 |
| 6×6 · facile | 307–397 (media 343) | 0,657–0,688 (0,673) | 0,707 | 15/15 |
| 6×6 · normale | 370–523 (media 463) | 0,693–0,718 (0,705) | 0,735 | 15/15 |
| 6×6 · difficile | 431–601 (media 513) | 0,722–0,795 (0,735) | 0,771 | 15/15 |

---

## 5. Cosa dicono i numeri

- **Score lineare invariato**: `pointsFor = lunghezza − 2`, `ALE_DIFFICULTY_WEIGHTS
  = {0.5, 0.5}`, `scoring.ts` non toccato. Le modifiche rare non alterano il
  metodo di calcolo del punteggio.
- **Il floor di `qu` è leggero.** Porta `Qu` dallo ~0% allo 0–33% delle schede,
  con un costo di validità quasi nullo; il gate per fascia lo concentra su
  difficile (13–33%).
- **La `h` posizionale azzera gli scarti di struttura.** “h senza c/g” non
  compare più tra i motivi di scarto.
- **Il cap 3 non è mai raggiunto in produzione** con il floor allo 0,6%.
- **Ogni scheda difficile ha almeno una rara** (gate).
- **La generazione a tre secchi resta senza ripieghi** (194–268 tentativi).

---

## 6. Note di riproducibilità

- La pipeline ale richiede `words.txt` (dizionario) e `frequency-it.txt` (anelli).
- La calibrazione dipende dalla **dimensione**: `calibration.json` contiene
  `bySize`. Il runtime la usa solo se `guardRails` (inclusi `tokenFloor`,
  `rareByTier`, `hNearCG`, `hBoost`), `weights`, `rho`, `metric` (`rings-v1`) e
  `rings` coincidono con quelli correnti; altrimenti ricalcola al volo.
- Cambiare `DEFAULT_ALE_GUARD_RAILS` invalida la calibrazione committata.
- Le schede ale generate dall’admin a runtime vivono in `DATA_DIR/schede-ale/` e
  vanno svuotate/rigenerate quando cambia la calibrazione.
- Dopo la rigenerazione va copiato il bundle web:
  `node apps/web/scripts/copy-schede.mjs`.
