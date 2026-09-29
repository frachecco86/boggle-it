# Scala dei punteggi — alternative a confronto

> **STATO: adottata la scala del task** (Boggle classico, 8+ = 11).
> Implementata sul ramo `nonlinear-score`; le schede Ale sono state ricalibrate
> (5000 griglie per dimensione) perché la difficoltà usa il punteggio.

Documento di lavoro per la modifica *"cambia la scala dei punteggi. Non lineare"*
(Todoist `6hf9pCch3GxgCx8v`), che chiede esplicitamente **di proporre alternative**
prima di sceglierne una.

## A. La scala di oggi

`scoreForWord(word) = max(0, lunghezza − 2)` — lineare, un punto per lettera
oltre la terza.

| lettere | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 13 |
|---|---|---|---|---|---|---|---|---|---|
| punti   | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 11 |

## B. La proposta nel task

| lettere | 3 | 4 | 5 | 6 | 7 | 8+ |
|---|---|---|---|---|---|---|
| punti   | 1 | 1 | 2 | 3 | 5 | 11 |

È la scala **classica del Boggle** (con le parole da 8+ a 11 punti). Rispetto a
quella attuale:

- le parole corte valgono **meno** (4 lettere: 2 → 1);
- le parole lunghe valgono **molto di più** (8 lettere: 6 → 11, quasi il doppio);
- non c'è più la crescita continua oltre l'8: 9, 10, 13 lettere valgono tutte 11.

## C. Effetto misurato sul catalogo reale

Distribuzione delle parole trovabili (tutto il catalogo, ~93.000 parole uniche
per scheda):

| lunghezza | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11+ |
|---|---|---|---|---|---|---|---|---|---|
| quota parole | 16,4% | 28,0% | 24,9% | 15,9% | 9,4% | 3,8% | 1,3% | 0,4% | 0,1% |

Quota del **punteggio totale** che va alle parole lunghe:

| scala | 3–4 lettere | 5–7 | 8+ |
|---|---|---|---|
| **attuale** (`len−2`) | 24,7% | 63,1% | 12,2% |
| **task** (8+ = 11) | 17,8% | 57,7% | **24,5%** |
| morbida (`len−2`, ma 8+ = 10) | 22,5% | 60,3% | 17,2% |
| ripida (8 = 8, 9 = 9, 10+ = 10) | 18,9% | 61,2% | 19,9% |

Punti per parola (media sul catalogo):

| scala | 4×4 | 5×5 | 6×6 |
|---|---|---|---|
| attuale | 2,0–2,5 | 2,4–3,0 | 2,7–3,1 |
| task | 1,4–1,9 | 1,8–2,6 | 2,1–2,8 |
| morbida | ~2,0–2,4 | ~2,4–2,9 | ~2,6–3,1 |

## D. Le tre alternative

### 1. Scala del task (Boggle classico, 8+ = 11)
**Pro:** è quella riconoscibile — chi ha giocato a Boggle la conosce già; rende
davvero speciale la parola lunga (24,5% del punteggio contro 12,2%).
**Contro:** le parole da 9+ **non crescono più** (una parola da 13 lettere vale
come una da 8: 11 punti). Sul catalogo attuale le parole da 9+ sono l'1,8% e su
5×5/6×6 non sono rare: appiattirle toglie incentivo a cercare l'eccezionale.
**Effetto sui totali:** il punteggio di una partita **cala** (~25-30%), perché il
calo delle parole corte pesa più della crescita di quelle lunghe.

### 2. Morbida — `len−2` con 8+ = 10 (tetto più alto, crescita continua)
| 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11+ |
|---|---|---|---|---|---|---|---|---|
| 1 | 2 | 3 | 4 | 6 | 8 | 9 | 10 | 10 |
**Pro:** nessun salto brusco, le parole corte restano leggibili, le lunghe
crescono ma senza appiattirsi; la quota 8+ sale a 17,2% (via di mezzo).
**Contro:** meno "memorabile" della scala classica. I 4 punti per una parola da 6
lettere sono più di quanto ci si aspetti dal Boggle.

### 3. Ripida a soglie fino a 9, tetto a 10
| 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 2 | 3 | 5 | 7 | 9 | 10 |
**Pro:** mantiene la crescita fino a 9 (dove il Boggle si ferma a 8), tetto
gestibile; parole corte basse come nel task.
**Contro:** non è una scala "standard", va spiegata nel pannello Regole.

## E. Cosa cambierebbe nel codice

La scala è usata in **quattro punti** che devono restare allineati:

1. `packages/shared/src/scoring.ts` → `scoreForWord` (il gioco: single, multi, unicità ×2);
2. `packages/shared/src/stats.ts` → `schedaWordPoints` (**statistiche schede e record**);
3. `apps/web/src/components/RulesPanel.tsx` (tabella "Regole e punteggi": è già
   derivata da `scoreForWord`, quindi si aggiorna da sola);
4. `packages/shared/src/schedaAle.ts` → `pointsFor` (**difficoltà dell'algoritmo ale**:
   usa il punteggio per la metrica di ricchezza della griglia).

Il punto 4 è quello che sfugge: cambiare la scala **cambia le difficoltà calibrate
delle schede ale** (`calibration.json`), quindi va ricalibrato. Il punto 2 cambia
i **record storici** delle schede: vanno azzerati o lasciati come "record di una
versione precedente".

## F. Raccomandazione

La **scala del task** (alternativa 1) è la più difendibile perché è quella del
Boggle, che è il gioco da cui questo deriva: chi la conosce non deve imparare
nulla, e il "11 punti" per la parola lunga è un momento memorabile. È anche
quella scritta nel task.

L'unico difetto vero è l'appiattimento da 9 lettere in su. Se si vuole tenere il
"11" ma **non** perdere la crescita, la variante più fedele è la 3: soglie del
Boggle fino a 8, e poi 9 e 10 (che il Boggle non distingue perché con 4×4 non
esistono, ma qui su 6×6 sì).
