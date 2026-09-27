# Algoritmo `ale`

<!-- Parte di docs/algoritmi — vedi README.md per l’indice -->

Terza variante: pipeline a sé (campionamento per frequenza dei token e calibrazione), non
usa `SPECS`. Lessico, griglia, solver e formato: [comune.md](./comune.md). Codice:
`packages/shared/src/schedaAle.ts`; rigenerazione:
`pnpm --filter @boggle/server gen:schede:ale`.

---

## L'algoritmo `ale`

Terza variante, dal documento *algoritmo schede "ale"*. È una pipeline **a sé**:
non usa `COMPOSITION`/`SPECS`, ma campionamento per frequenza e calibrazione.
Codice: `packages/shared/src/schedaAle.ts`; generazione:
`pnpm --filter @boggle/server gen:schede:ale`.

**Differenze sostanziali da `standard`/`full`:**

- **Lettere campionate per FREQUENZA dei token**, non composte a mano. La
  frequenza è la frazione di voci di `Dict'` che contengono il token.
- **`QU` è un TOKEN unico**: `quando` → `[QU, A, N, D, O]`, `acqua` →
  `[A, C, QU, A]`. L'alfabeto è di 26 simboli (nessuna `Q` isolata).
- **Difficoltà = quota di parole fuori da `Common`** (`Common` = NVdB ∩ `Dict'`),
  non la composizione della griglia.
- **Limiti calibrati**: da un campione di griglie si derivano l'intervallo di
  parole accettate (Tukey + `rho`) e le tre fasce di difficoltà (k-means k=3,
  con fallback ai tertili).

**Pre-processing (`Dict → Dict'`):** accenti piegati, solo `a-z`, lunghezza ≥ 3
lettere, `q` solo se seguita da `u` (`iraq`, `soqquadro` scartate).

**Radice/lemma (IMPORTANTE):** NVdB contiene i **lemmi** (`amare`), non tutte le
forme flesse. Una parola è quindi **comune** se lo è lei **oppure la sua radice**
(lemma da Morph-it, formato `forma<TAB>lemma<TAB>tag`):

| Forma | Lemma | `Common` ha la forma? | Esito |
| --- | --- | --- | --- |
| `amo` | `amare` | no | **comune** (radice) |
| `cani` | `cane` | no | **comune** (radice) |
| `cervi` | `cervo` | no | **comune** (radice) |
| `abbacchiamo` | `abbacchiare` | no | rara |

Senza la radice la difficoltà era gonfiata dalla morfologia (0,80/0,85/0,89);
con la radice scende a valori realistici (**0,51/0,57/0,64**).

**Guard rails (ATTIVI, scelta di progetto):** banda vocali 38–52%, al più una tra
`H`/`Z`/`QU`, nessuna riga o colonna di sole consonanti, nessuna lettera non
italiana. La spec li dà opzionali: qui sono fissi e **devono essere identici in
calibrazione e produzione** (cambiarli invalida `calibration.json`).

**Produzione**: ciclo di reiezione con seme (`seed + attempt`), 500 tentativi,
ripiego sul candidato più vicino. Le schede hanno `words === allWords` (nessuna
fascia di frequenza separata) e id che partono **dopo** standard/full nello
stesso file (`5-facile-016`…), per non collidere.

**Stato**: 45 schede, **solo 5×5** (15 per difficoltà). La calibrazione è per
dimensione: aggiungere altre dimensioni richiede una nuova calibrazione.

**Numeri** di calibrazione e generazione (campioni respinti dai guard rails, fasce di
difficoltà, verifica di riproduzione): [`report/ale.md`](./report/ale.md) — rigenerabili con
`pnpm --filter @boggle/server report:ale`.
