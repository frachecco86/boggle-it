# Algoritmo `ale`

<!-- Parte di docs/algoritmi — vedi README.md per l’indice -->

Terza variante: pipeline a sé (campionamento per frequenza dei token e calibrazione), non
usa `SPECS`. Lessico, griglia, solver e formato: [comune.md](./comune.md). Codice:
`packages/shared/src/schedaAle.ts`; rigenerazione:
`pnpm --filter @boggle/server gen:schede:ale` (oppure dal **pannello admin**, tab
Schede → Genera → tipo `Ale`: stessa pipeline, eseguita dal server).

---

## L'algoritmo `ale`

Terza variante, dal documento *algoritmo schede "ale"*. È una pipeline **a sé**:
non usa `COMPOSITION`/`SPECS`, ma campionamento per frequenza e calibrazione.
Codice: `packages/shared/src/schedaAle.ts`; generazione:
`pnpm --filter @boggle/server gen:schede:ale` **oppure** dal pannello admin.

**Differenze sostanziali da `standard`/`full`:**

- **Lettere campionate per FREQUENZA dei token**, non composte a mano. La
  frequenza è la frazione di voci di `Dict'` che contengono il token.
- **`QU` è un TOKEN unico**: `quando` → `[QU, A, N, D, O]`, `acqua` →
  `[A, C, QU, A]`. L'alfabeto è di 26 simboli (nessuna `Q` isolata).
- **Difficoltà = `0.25·R + 0.75·S`** (composita), non la sola composizione della
  griglia:
  - `R` = **rarità**, la quota di parole fuori da `Common` (`Common` = NVdB ∩ `Dict'`);
  - `S` = **scarsità**, `1 − (parole − A) / (B − A)` per l'intervallo calibrato
    `[A, B]`: 0 al massimo dell'intervallo, 1 al minimo. Così una griglia con poche
    parole è difficile anche se le parole sono comuni, e una griglia fitta di
    parole rare resta relativamente abbordabile.
- **Limiti calibrati**: da un campione di griglie si derivano l'intervallo di
  parole accettate (Tukey + `rho`) e le tre fasce di difficoltà (k-means k=3
  sulla difficoltà COMPOSITA, con fallback ai tertili).

**Pre-processing (`Dict → Dict'`):** accenti piegati, solo `a-z`, lunghezza ≥ 3
lettere, `q` solo se seguita da `u` (`iraq`, `soqquadro` scartate).

**Radice/lemma (IMPORTANTE):** NVdB contiene i **lemmi** (`amare`), non tutte le
forme flesse. Una parola è quindi **comune** se lo è lei **oppure la sua radice**
(lemma per forma, formato `forma<TAB>lemma`). Le radici non si leggono da Morph-it
a runtime: sono precalcolate in `packages/dictionary/data/ale/lemmas.br`, che tiene
solo le forme il cui lemma è in `Common` (vedi sotto).

| Forma | Lemma | `Common` ha la forma? | Esito |
| --- | --- | --- | --- |
| `amo` | `amare` | no | **comune** (radice) |
| `cani` | `cane` | no | **comune** (radice) |
| `cervi` | `cervo` | no | **comune** (radice) |
| `abbacchiamo` | `abbacchiare` | no | rara |

Senza la radice la **rarità** `R` era gonfiata dalla morfologia (0,80/0,85/0,89);
con la radice scende a valori realistici (**~0,56/0,58/0,59**). La difficoltà finale è
però composita (rarità + scarsità): vedi sopra.

**Guard rails (ATTIVI, scelta di progetto):** banda vocali **30–60%**, **al più 3 token
rari H/Z/QU in totale**, **nessuna riga o colonna senza soluzioni**. La spec li dà
opzionali: qui sono fissi e **devono essere identici in calibrazione e produzione**
(cambiarli invalida `calibration.json`).

Il guard rail di copertura è diverso dagli altri: non è una proprietà dei token ma
richiede di **risolvere** la griglia e verificare che ogni riga e ogni colonna sia
attraversata da almeno una parola (vedi `coverageIssues` / `solveGridCoverage`). Per
questo è più costoso e viene valutato **dopo** i rail sui token, sui soli candidati già
conformi. Ha sostituito sia la regola “righe/colonne di sole consonanti” sia l'eventuale
esclusione delle lettere non italiane, entrambe **rimosse**.

**Lettere non italiane (`j k w x y`):** NON escluse. Fanno parte dei **26 token**
dell'alfabeto, da cui la spec dice di campionare, e in `Dict'` hanno frequenza piccola ma non
nulla (0,04–0,13% delle voci: `jazz`, `bowling`, `browser`, `taxi`, `yogurt`…). Dal
27/09/2026 non esiste più alcun guard rail che le scarti. Numeri e dettagli:
[`report/ale.md`](./report/ale.md).

**Produzione**: ciclo di reiezione con seme (`seed + attempt`), 500 tentativi,
ripiego sul candidato più vicino. Le schede hanno `words === allWords` (nessuna
fascia di frequenza separata) e id che partono **dopo** standard/full nello
stesso file (`5-facile-016`…), per non collidere.

**Stato**: 135 schede, **15 per ognuna delle 9 combinazioni dimensione × difficoltà**
(4×4, 5×5 e 6×6). La calibrazione è per dimensione: `calibration.json` contiene tutte
e tre le voci.

**Numeri** di calibrazione e generazione (campioni respinti dai guard rails, fasce di
difficoltà, verifica di riproduzione): [`report/ale.md`](./report/ale.md) — rigenerabili con
`pnpm --filter @boggle/server report:ale -- --all-sizes`.
