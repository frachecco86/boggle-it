# Report — algoritmo `ale`

Numeri della **calibrazione** (5000 griglie per dimensione) e della **prima
generazione a tre secchi**, con la metrica di difficoltà ad **anelli di
frequenza** (`rings-v1`): `R = (f1 + 2·f2)/2`, `D = 0.5·R + 0.5·M`, **ρ = 0,35**,
e la **scala Boggle classica** (3–4 → 1, 5 → 2, 6 → 3, 7 → 5, 8+ → 11).

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

- Data della misura: 29/09/2026
- Codice: `packages/shared/src/schedaAle.ts`, `packages/shared/src/scoring.ts`
- Script: `apps/server/scripts/report-ale.ts`
- Calibrazione: `packages/dictionary/data/ale/calibration.json`

---

## 1. Cosa è cambiato rispetto al report precedente

1. **Scala dei punteggi Boggle classica** al posto della lineare `lunghezza − 2`:

   | lettere | 3 | 4 | 5 | 6 | 7 | 8+ |
   |---|---|---|---|---|---|---|
   | punti | 1 | 1 | 2 | 3 | 5 | 11 |

   La difficoltà Ale usa il punteggio nella **ricchezza**
   `M = 1 − parole / punteggio`, quindi la scala cambia `M`, `D` e i confini
   delle fasce: la calibrazione va rifatta (è quello che documenta questo
   report). Il tetto a 11 per le parole da 8+ **abbassa la ricchezza media**
   delle griglie (le parole corte perdono punti: 4 lettere 2 → 1, 5 → 3 → 2,
   6 → 4 → 3, mentre solo le 8+ guadagnano).
2. **Campione di calibrazione portato a 5000 griglie** per dimensione (era 2000).
3. Nuovi guard rail (`structure`, `anchorMinLength`), bande di parole per fascia
   e generazione a tre secchi (da `rings-v1`), invariati in questo passaggio.

---

## 2. Ingressi (comuni alle tre dimensioni)

| voce | valore |
| --- | --- |
| `Dict` → `Dict'` | 368.101 → **368.098** voci |
| anelli `easy` / `medium` | **5.000 / 20.000** (da `frequency-it.txt`, voci valide dopo pulizia) |
| alfabeto | **26 token**, `QU` unico |
| token più frequenti | `i` 78,2% · `a` 76,3% · `e` 66,7% · `r` 63,3% · `o` 63,0% · `t` 54,2% · `s` 51,9% · `n` 48,6% · `c` 37,7% · `m` 35,0% |
| guard rails | vocali **30–60%** · **al più 3** token rari H/Z/QU · **struttura giocabile** · **nessuna riga/colonna senza soluzioni** · **ancora ≥ 6/7/8 lettere** (4/5/6) |
| scala punti | **Boggle classica**: 3–4 → 1, 5 → 2, 6 → 3, 7 → 5, 8+ → 11 |

---

## 3. Calibrazione (5000 griglie valide per dimensione)

| dimensione | campioni → valide | respinte | intervallo globale di parole | dentro l’intervallo | k-means |
| --- | --- | --- | --- | --- | --- |
| **4×4** | 8743 → **5000** | 3743 (42,8%) | **[61, 171]** | 3467/5000 (69,3%) | sì |
| **5×5** | 7831 → **5000** | 2831 (36,2%) | **[154, 377]** | 3421/5000 (68,4%) | sì |
| **6×6** | 7573 → **5000** | 2573 (34,0%) | **[302, 651]** | 3323/5000 (66,5%) | sì |

`perTierFallback` è **no** in tutte e tre le dimensioni; il fallback ai tertili
non serve mai.

**Parole per griglia** (campione di 5000):

| dimensione | min | q1 | mediana | q3 | max | media |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 11 | 80 | 114 | 159 | 459 | 125 |
| 5×5 | 33 | 193 | 262 | 352 | 970 | 282 |
| 6×6 | 96 | 358 | 473 | 607 | 1824 | 501 |

**Quote medie per anello, rarità `R`, ricchezza `M` e difficoltà `D`**:

| dimensione | f0 | f1 | f2 | R (media ± sd) | M (media ± sd) | D (media ± sd) | D [min, max] |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 0,210 | 0,221 | 0,569 | 0,680 ± 0,057 | 0,468 ± 0,106 | 0,574 ± 0,071 | [0,275, 0,759] |
| 5×5 | 0,182 | 0,204 | 0,614 | 0,716 ± 0,044 | 0,577 ± 0,090 | 0,646 ± 0,061 | [0,403, 0,809] |
| 6×6 | 0,166 | 0,193 | 0,641 | 0,737 ± 0,037 | 0,639 ± 0,073 | 0,688 ± 0,051 | [0,489, 0,809] |

Rispetto al report con la scala lineare, `R` è **invariata** (dipende dagli
anelli, non dal punteggio) mentre `M` e `D` sono **più basse** perché la nuova
scala toglie punti alle parole corte (che sono la grande maggioranza: ~44% delle
parole ha 3–4 lettere) e li aggiunge solo alle 8+ (che sono il ~5%). Es. su 4×4:
`M` media 0,468 contro 0,604, `D` media 0,574 contro 0,642. Le fasce si
ri-centrano da sole.

**Fasce di difficoltà e bande di parole** (k-means k=3 usato in tutte e tre le
dimensioni):

| dimensione | fascia | centro `D` | intervallo `D` | banda parole | griglie del campione |
| --- | --- | --- | --- | --- | --- |
| 4×4 | facile | 0,488 | [0,000, 0,526] | [64, 105] | 1233 (24,7%) |
| 4×4 | normale | 0,563 | [0,526, 0,599] | [80, 141] | 1832 (36,6%) |
| 4×4 | difficile | 0,635 | [0,599, 1,000] | [97, 162] | 1935 (38,7%) |
| 5×5 | facile | 0,579 | [0,000, 0,609] | [163, 238] | 1278 (25,6%) |
| 5×5 | normale | 0,639 | [0,609, 0,667] | [193, 312] | 1726 (34,5%) |
| 5×5 | difficile | 0,695 | [0,667, 1,000] | [235, 357] | 1996 (39,9%) |
| 6×6 | facile | 0,635 | [0,000, 0,659] | [311, 438] | 1337 (26,7%) |
| 6×6 | normale | 0,683 | [0,659, 0,706] | [363, 542] | 1631 (32,6%) |
| 6×6 | difficile | 0,728 | [0,706, 1,000] | [448, 615] | 2032 (40,6%) |

I cluster restano sani e bilanciati (il più piccolo è il 24,7% del campione,
sopra il minimo di validazione ≥ max(15, 10%)).

---

## 4. Prima generazione a tre secchi (15 schede per fascia e dimensione)

**Scarti dei guard rails** (un campione può violare più regole):

| dimensione | vocali | struttura | ancora | copertura | rari | campioni respinti |
| --- | --- | --- | --- | --- | --- | --- |
| 4×4 | 44 (23,2%) | 42 (22,1%) | 0 | 0 | 0 | 84 (44,2%) |
| 5×5 | 37 (18,2%) | 43 (21,2%) | 0 | 0 | 0 | 78 (38,4%) |
| 6×6 | 29 (11,7%) | 72 (29,1%) | 0 | 0 | 2 (0,8%) | 93 (37,7%) |

“Struttura” raggruppa `h` senza `c`/`g`, righe/colonne senza vocali, consonanti
lontane da una vocale e lettere non italiane.

**Flusso e reiezioni esterne** (griglie valide ma fuori target):

| dimensione | tentativi del flusso | fuori range globale | fuori banda fascia | ripieghi |
| --- | --- | --- | --- | --- |
| 4×4 | 106 | 40 | 17 | 0 |
| 5×5 | 125 | 33 | 27 | 0 |
| 6×6 | 154 | 53 | 27 | 0 |

**Schede prodotte** (parole · difficoltà · rarità media), tutte in banda globale
**e** di fascia, **nessun ripiego**, **15/15 identiche al catalogo**:

| dimensione · fascia | parole | difficoltà (centro) | R media | in banda |
| --- | --- | --- | --- | --- |
| 4×4 · facile | 64–102 (media 85) | 0,541–0,645 (0,488) | 0,628 | 15/15 |
| 4×4 · normale | 81–140 (media 116) | 0,620–0,663 (0,563) | 0,680 | 15/15 |
| 4×4 · difficile | 98–152 (media 122) | 0,648–0,749 (0,635) | 0,720 | 15/15 |
| 5×5 · facile | 166–234 (media 199) | 0,570–0,675 (0,579) | 0,663 | 15/15 |
| 5×5 · normale | 199–302 (media 235) | 0,643–0,696 (0,639) | 0,699 | 15/15 |
| 5×5 · difficile | 238–355 (media 299) | 0,695–0,737 (0,695) | 0,747 | 15/15 |
| 6×6 · facile | 321–435 (media 362) | 0,640–0,688 (0,635) | 0,695 | 15/15 |
| 6×6 · normale | 367–529 (media 446) | 0,689–0,724 (0,683) | 0,734 | 15/15 |
| 6×6 · difficile | 468–613 (media 557) | 0,721–0,782 (0,728) | 0,766 | 15/15 |

La rarità media è **ordinata per fascia** in ogni dimensione
(facile < normale < difficile).

---

## 5. Cosa dicono i numeri

- **La nuova scala abbassa `M` (e quindi `D`) ma non `R`.** `R` dipende dagli
  anelli di frequenza, non dal punteggio: resta ~0,68/0,72/0,74. `M` scende
  perché la maggior parte delle parole è corta e vale meno di prima; i confini
  delle fasce si abbassano in proporzione (4×4 facile/normale 0,526, contro
  0,608 della scala lineare).
- **Il campione da 5000 stabilizza ulteriormente i quartili**, ma i numeri sono
  in linea con quelli da 2000 dello stesso metodo: le bande per fascia restano
  strette e non ordinate (facile non significa “poche parole”).
- **I nuovi rail restano sostenibili.** Il flusso completa i 45 secchi in
  106–154 tentativi; la struttura è la regola che scarta di più (fino al 29% dei
  campioni su 6×6) e l'ancora quasi mai.
- **Zero ripieghi e riproduzione 15/15**: i criteri di accettazione sono
  soddisfatti in tutte e tre le dimensioni.
- **Effetto sui punteggi di partita:** la scala classica **riduce il punteggio
  totale** di una partita (~25–30% secondo la misura sul catalogo in
  `docs/SCALA-PUNTEGGI-ALTERNATIVE.md`), perché il calo delle parole corte pesa
  più della crescita delle 8+.

---

## 6. Note di riproducibilità

- La pipeline ale non richiede `lemmas.br`, `nvdb.words.txt` né Morph-it: bastano
  `words.txt` e `frequency-it.txt`.
- La calibrazione dipende dalla **dimensione** della griglia e dalla **scala dei
  punteggi**: cambiando la scala, `calibration.json` non vale più e va rifatta
  (è il motivo di questo report).
- La scala è centralizzata in `scoreForWord` (`packages/shared/src/scoring.ts`) e
  riusata da `stats.ts` (`schedaWordPoints`) e da `schedaAle.ts`, così gioco,
  statistiche e calibrazione restano allineati.
- Dopo la rigenerazione va copiato il bundle web:
  `node apps/web/scripts/copy-schede.mjs`.
