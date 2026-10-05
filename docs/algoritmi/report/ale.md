# Report — algoritmo `ale`

Numeri della **calibrazione** (5000 griglie valide per dimensione) e della **prima
generazione a tre secchi**, con:

- metrica di difficoltà ad **anelli di frequenza** (`rings-v1`): `R = (f1 + 2·f2)/2`,
  `D = 0.5·R + 0.5·M`, **ρ = 0,35**;
- **presenza controllata delle lettere rare** (H, Z, Qu) per fascia;
- **scala lineare** (3 → 1, 4 → 2, 5 → 3, … +1 per lettera, senza tetto).

Per **tutte e tre le dimensioni** (4×4, 5×5, 6×6), 15 schede per fascia, seed 1.

Rigenerabile con:

```bash
pnpm --filter @boggle/server report:ale -- --all-sizes --n 15 --seed 1 --samples 5000
```

Stesso comando, stessi numeri: la pipeline è deterministica (`mulberry32`,
tentativi `seed + attempt`). La misura usa **gli stessi ingressi della
produzione** (`src/ale.ts`, condiviso con `gen-schede-ale.ts` e con il pulsante
“Genera” del pannello admin), non una copia. La riproduzione è verificata in
fondo: le griglie prodotte coincidono **15/15 per fascia** con quelle del
catalogo in tutte le dimensioni.

- Data della misura: 29/09/2026 (`calibration.json`: `2026-09-29T10:21:58.280Z`, seed 1, `Dict'` 368.210)
- Codice: `packages/shared/src/schedaAle.ts`, `packages/shared/src/scoring.ts`
- Script: `apps/server/scripts/report-ale.ts`
- Calibrazione: `packages/dictionary/data/ale/calibration.json`

---

## 1. Cosa è cambiato in questa versione

Si sovrappongono **tre** revisioni, tutte dentro la stessa calibrazione:

1. **Rarità ad anelli di frequenza (`rings-v1`).** La componente di rarità non è
   più “dentro o fuori dal vocabolario comune”: le parole trovate si dividono in
   top-5000 (`f0`), 5001–20000 (`f1`) e oltre (`f2`) e `R = (f1 + 2·f2)/2`. La
   pipeline ale **non dipende più** da NVdB, `lemmas.br` né Morph-it.
2. **Presenza controllata delle lettere rare (H, Z, Qu) per fascia.**
   - **`qu` non è più una vocale.** `ALE_VOWEL_TOKENS = {a,e,i,o,u}`: la banda
     vocali (30–60%) non limita più la presenza di `Qu`.
   - **`tokenFloor` di campionamento per `qu`** (`{ qu: 0.006 }`), in **quota di
     cella**: circa una cella su 167 è `QU` (contro lo 0,18% naturale). Il peso si
     converte con `w = p·(Σf−f_t)/(1−p)`.
   - **`rareByTier`**: gate di *accettazione* applicato **dopo** la fascia
     naturale (`facile: {max:1}`, `normale: {}`, `difficile: {min:1}`). È un
     filtro: non cambia `D` né i confini k-means, la calibrazione resta a **una
     passata**.
   - **`h` posizionale** (`hNearCG`, `hBoost = 1`): la `h` è piazzata solo su
     celle adiacenti a `c`/`g`, con probabilità derivata dalla sua marginale
     naturale di cella (`m_h = f_h/Σf ≈ 0,93%`). Le reiezioni “h senza c/g”
     scendono a **zero**.
   - **`rareCap` resta fisso a 3**, come rete di sicurezza.
3. **Scala dei punteggi** — *storicamente* qui era passata alla Boggle classica,
   poi una modifica successiva l'ha riportata alla lineare `lunghezza − 2`. La
   tabella sotto è quella classica, tenuta come riferimento:
   

   | lettere | 3 | 4 | 5 | 6 | 7 | 8+ |
   |---|---|---|---|---|---|---|
   | punti | 1 | 1 | 2 | 3 | 5 | 11 |

   La difficoltà ale usa il punteggio nella **ricchezza**
   `M = 1 − parole / punteggio`, quindi la scala cambia `M`, `D` e i confini
   delle fasce: la calibrazione va rifatta (è quello che documenta questo
   report). Il tetto a 11 per le parole da 8+ **abbassa la ricchezza media**
   delle griglie (le parole corte perdono punti: 4 lettere 2 → 1, 5 → 3 → 2,
   6 → 4 → 3, mentre solo le 8+ guadagnano).
4. **Campione di calibrazione portato a 5000 griglie** per dimensione (era 2000)
   e nuovi guard rail (`structure`, `anchorMinLength`), bande di parole per
   fascia e generazione a tre secchi.

---

## 2. Ingressi (comuni alle tre dimensioni)

| voce | valore |
| --- | --- |
| `Dict` → `Dict'` | 368.214 → **368.210** voci |
| anelli `easy` / `medium` | **5.000 / 20.000** (da `frequency-it.txt`, voci valide dopo pulizia) |
| alfabeto | **26 token**, `QU` unico: `a b c d e f g h i j k l m n o p r s t u v w x y z qu` |
| token più frequenti | `i` 78,1% · `a` 76,3% · `e` 66,7% · `r` 63,3% · `o` 63,0% · `t` 54,2% · `s` 51,9% · `n` 48,6% · `c` 37,7% · `m` 35,0% |
| guard rails | vocali **30–60%** (`qu` escluso) · **al più 3** token rari H/Z/QU · **struttura giocabile** · **nessuna riga/colonna senza soluzioni** · **ancora ≥ 6/7/8 lettere** (4/5/6) |
| presenza rare | `tokenFloor {qu: 0.006}` · `rareByTier` facile `{max:1}`, normale `{}`, difficile `{min:1}` · `h` posizionale (`hBoost 1`) |
| scala punti | **lineare**: 3 → 1, 4 → 2, 5 → 3, … +1 per lettera, senza tetto |

---

## 3. Calibrazione (5000 griglie valide per dimensione)

| dimensione | campioni → valide | respinte | intervallo globale di parole | dentro l’intervallo | k-means |
| --- | --- | --- | --- | --- | --- |
| **4×4** | 7908 → **5000** | 2908 (36,8%) | **[63, 169]** | 3358/5000 (67,2%) | sì |
| **5×5** | 6731 → **5000** | 1731 (25,7%) | **[152, 372]** | 3397/5000 (67,9%) | sì |
| **6×6** | 6290 → **5000** | 1290 (20,5%) | **[294, 647]** | 3337/5000 (66,7%) | sì |

`perTierFallback` è **no** in tutte e tre le dimensioni; il fallback ai tertili
non serve mai.

**Parole per griglia** (campione di 5000):

| dimensione | min | q1 | mediana | q3 | max | media |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 16 | 81 | 114 | 157 | 498 | 125 |
| 5×5 | 32 | 190 | 259 | 347 | 1117 | 278 |
| 6×6 | 91 | 355 | 465 | 607 | 1961 | 498 |

**Quote medie per anello, rarità `R`, ricchezza `M` e difficoltà `D`**:

| dimensione | f0 | f1 | f2 | R (media ± sd) | M (media ± sd) | D (media ± sd) | D [min, max] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 0,206 | 0,214 | 0,580 | 0,687 ± 0,057 | 0,455 ± 0,109 | 0,571 ± 0,072 | [0,313, 0,754] |
| 5×5 | 0,180 | 0,200 | 0,620 | 0,720 ± 0,043 | 0,567 ± 0,091 | 0,644 ± 0,061 | [0,360, 0,799] |
| 6×6 | 0,165 | 0,190 | 0,646 | 0,741 ± 0,037 | 0,631 ± 0,076 | 0,686 ± 0,052 | [0,470, 0,819] |

Rispetto al report con la scala lineare, `R` è quasi invariata (dipende dagli
anelli, non dal punteggio: le rare aggiunte la spostano di pochi millesimi),
mentre `M` e `D` sono **più basse** perché la nuova scala toglie punti alle
parole corte (che sono la grande maggioranza: ~44% delle parole ha 3–4 lettere) e
li aggiunge solo alle 8+ (che sono il ~5%). Es. su 4×4: `M` media 0,455 contro
0,604, `D` media 0,571 contro 0,642. Le fasce si ri-centrano da sole.

**Fasce di difficoltà e bande di parole** (k-means k=3 usato in tutte e tre le
dimensioni):

| dimensione | fascia | centro `D` | intervallo `D` | banda parole | griglie del campione |
| --- | --- | --- | --- | --- | --- |
| 4×4 | facile | 0,487 | [0,000, 0,525] | [65, 107] | 1267 (25,3%) |
| 4×4 | normale | 0,562 | [0,525, 0,597] | [80, 139] | 1827 (36,5%) |
| 4×4 | difficile | 0,633 | [0,597, 1,000] | [100, 157] | 1906 (38,1%) |
| 5×5 | facile | 0,576 | [0,000, 0,606] | [159, 234] | 1281 (25,6%) |
| 5×5 | normale | 0,637 | [0,606, 0,664] | [190, 309] | 1711 (34,2%) |
| 5×5 | difficile | 0,692 | [0,664, 1,000] | [236, 352] | 2008 (40,2%) |
| 6×6 | facile | 0,630 | [0,000, 0,655] | [308, 431] | 1318 (26,4%) |
| 6×6 | normale | 0,680 | [0,655, 0,703] | [352, 541] | 1659 (33,2%) |
| 6×6 | difficile | 0,726 | [0,703, 1,000] | [430, 617] | 2023 (40,5%) |

I cluster restano sani e bilanciati (il più piccolo è il 25,3% del campione,
sopra il minimo di validazione ≥ max(15, 10%)).

---

## 4. Prima generazione a tre secchi (15 schede per fascia e dimensione)

**Scarti dei guard rails in generazione** (un campione può violare più regole;
“struttura” raggruppa `h` senza `c`/`g`, righe/colonne senza vocali, consonanti
lontane da una vocale e lettere non italiane):

| dimensione | vocali | struttura | ancora | rari | campioni respinti |
| --- | --- | --- | --- | --- | --- |
| 4×4 | 105 (24,9%) | 47 (11,1%) | 2 (0,5%) | 0 | 154 (36,5%) |
| 5×5 | 55 (17,5%) | 28 (8,9%) | 1 (0,3%) | 1 (0,3%) | 85 (27,0%) |
| 6×6 | 26 (8,6%) | 30 (9,9%) | 2 (0,7%) | 9 (3,0%) | 65 (21,5%) |

**Flusso e reiezioni esterne** (griglie valide ma fuori target):

| dimensione | tentativi del flusso | fuori range globale | fuori banda fascia | gate rari fascia | ripieghi |
| --- | --- | --- | --- | --- | --- |
| 4×4 | 268 | 86 | 50 | 34 | 0 |
| 5×5 | 230 | 81 | 41 | 15 | 0 |
| 6×6 | 238 | 92 | 41 | 23 | 0 |

**Schede prodotte** (parole · difficoltà · rarità media · presenza rare), tutte in
banda globale **e** di fascia, **nessun ripiego**, **15/15 identiche al catalogo**:

| dimensione · fascia | parole | difficoltà (centro) | R media | Qu / h / z / ≥1 | in banda |
| --- | --- | --- | --- | --- | --- |
| 4×4 · facile | 65–107 (media 79) | 0,361–0,525 (0,487) | 0,644 | 0% / 20,0% / 13,3% / 33,3% | 15/15 |
| 4×4 · normale | 88–134 (media 112) | 0,527–0,596 (0,562) | 0,695 | 6,7% / 20,0% / 20,0% / 33,3% | 15/15 |
| 4×4 · difficile | 101–152 (media 124) | 0,600–0,647 (0,633) | 0,720 | 20,0% / 46,7% / 60,0% / **100%** | 15/15 |
| 5×5 · facile | 159–233 (media 190) | 0,525–0,595 (0,576) | 0,663 | 13,3% / 26,7% / 13,3% / 53,3% | 15/15 |
| 5×5 · normale | 205–300 (media 245) | 0,607–0,653 (0,637) | 0,708 | 6,7% / 6,7% / 6,7% / 20,0% | 15/15 |
| 5×5 · difficile | 246–342 (media 300) | 0,665–0,709 (0,692) | 0,747 | 26,7% / 33,3% / 46,7% / **100%** | 15/15 |
| 6×6 · facile | 314–410 (media 353) | 0,607–0,654 (0,630) | 0,712 | 0% / 13,3% / 26,7% / 40,0% | 15/15 |
| 6×6 · normale | 376–538 (media 468) | 0,656–0,700 (0,680) | 0,740 | 20,0% / 13,3% / 26,7% / 53,3% | 15/15 |
| 6×6 · difficile | 441–609 (media 533) | 0,704–0,807 (0,726) | 0,774 | 46,7% / 33,3% / 60,0% / **100%** | 15/15 |

La rarità media è **ordinata per fascia** in ogni dimensione
(facile < normale < difficile) e la presenza di rare rispetta i gate
(`rareByTier`): le schede **difficili hanno almeno una rara nel 100% dei casi**,
le facili ne hanno al più una (media 0,33–0,53).

---

## 5. Cosa dicono i numeri

- **La nuova scala abbassa `M` (e quindi `D`) ma non `R`.** `R` dipende dagli
  anelli di frequenza, non dal punteggio: resta ~0,69/0,72/0,74. `M` scende
  perché la maggior parte delle parole è corta e vale meno di prima; i confini
  delle fasce si abbassano in proporzione (4×4 facile/normale 0,525, contro 0,608
  della scala lineare).
- **Il campione da 5000 stabilizza ulteriormente i quartili**, ma i numeri sono
  in linea con quelli da 2000 dello stesso metodo: le bande per fascia restano
  strette e **non ordinate** (facile non significa “poche parole”).
- **I rail delle rare restano sostenibili.** Il gate di fascia costa 15–34
  griglie per dimensione sul totale delle reiezioni esterne, e le reiezioni “h
  senza c/g” sono a **zero** (la `h` è posizionale). Il flusso completa i 45
  secchi di una dimensione (3 fasce × 15) in **230–268 tentativi**.
- **Zero ripieghi e riproduzione 15/15**: i criteri di accettazione sono
  soddisfatti in tutte e tre le dimensioni e il catalogo su disco è
  **bit-per-bit** quello di questa run.
- **Effetto sui punteggi di partita:** con la scala **lineare** in vigore la
  ricchezza `M` è più alta di quella che dava la scala classica (~+0,135 in
  media): le fasce sono state ricalibrate di conseguenza, quindi i confini di
  difficoltà in `calibration.json` non sono quelli del periodo classico.

---

## 6. Note di riproducibilità

- La pipeline ale non richiede `lemmas.br`, `nvdb.words.txt` né Morph-it: bastano
  `words.txt` e `frequency-it.txt`. `Dict'` dipende dal `words.txt` costruito in
  locale (file non versionato): fra una build e l’altra può variare di qualche
  unità (qui 368.210), senza spostare in modo percepibile la calibrazione.
- La calibrazione dipende dalla **dimensione** della griglia, dalla **scala dei
  punteggi** e dai **guard rail** (compresi i rail delle rare): cambiando uno di
  questi, `calibration.json` non vale più e va rifatta (è il motivo di questo
  report).
- La scala è centralizzata in `scoreForWord` (`packages/shared/src/scoring.ts`) e
  riusata da `stats.ts` (`schedaWordPoints`) e da `schedaAle.ts`, così gioco,
  statistiche e calibrazione restano allineati.
- Dopo la rigenerazione va copiato il bundle web:
  `node apps/web/scripts/copy-schede.mjs`.
- Verifica del catalogo: `pnpm --filter @boggle/server verify:schede` (270 schede,
  0 violazioni).
