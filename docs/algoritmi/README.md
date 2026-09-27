# Algoritmi di generazione delle schede

Questo documento descrive **tre insiemi di criteri indipendenti** con cui il progetto
genera e valida una scheda. Prima stavano in un unico file (`docs/SCHEDE-ALGORITMO.md`);
ora c’è un file per algoritmo, più le parti comuni e questo indice.

| Algoritmo | Etichetta in gioco | File | Codice |
| --- | --- | --- | --- |
| LEGACY | `Standard` | [standard.md](./standard.md) | `schedaGen.ts` (`STANDARD_SPEC`) |
| FULL | `Full criteria` | [full.md](./full.md) | `schedaGen.ts` (`FULL_SPEC`) |
| ALE | `Ale` | [ale.md](./ale.md) | `schedaAle.ts` |

Le parti **comuni** a tutti (lessico, griglia, solver, formato della scheda, lettere rare)
stanno in [comune.md](./comune.md): i file dei tre algoritmi le richiamano invece di
ripeterle.

## Come si sceglie

La variante è una scelta del giocatore, non della partita:

- **Home → Impostazioni partita** (riga "Schede"): vale sia per il single player sia per la
  stanza che si crea;
- **Lobby**: l’host può cambiarla (gli altri la vedono nella riga riassuntiva);
- **Sfoglia le schede**: filtro "Criteri" ed etichetta accanto al titolo (`FULL` per i
  "full criteria", `Ale` per le schede ale).

Ogni scheda porta la variante nel campo `variant` (`standard` | `full` | `ale`); le schede
di formato ≤ 2, senza il campo, valgono `standard`.

## Indice dei file

- [comune.md](./comune.md) — vocabolario, lessico, griglia, solver, formato scheda, lettere rare;
- [standard.md](./standard.md) — l’algoritmo storico;
- [full.md](./full.md) — i criteri completi;
- [ale.md](./ale.md) — l’algoritmo ale (campionamento per frequenza e calibrazione).

In questo file: la **modalità apprendimento** (che usa le schede ale), la **taratura e
verifica** degli algoritmi e la **verifica di fedeltà dei sorgenti**.

---

## Modalità apprendimento

Modalità del single player per **imparare le parole** invece di gareggiare.
Si attiva dalle impostazioni partita (Sì/No) e cambia tre cose:

- **Tempo infinito**: il round non scade, si esce solo a mano. L'effect del conto
  alla rovescia non parte quando la modalità è attiva.
- **Tasto suggerimento (💡)**: scegle una parola **non ancora trovata** e ne
  **anima il percorso** sulla griglia, accendendo le celle in sequenza. Preferisce
  le parole più lunghe (più difficili da vedere). Il percorso lo calcola
  `findWordPath` in `grid.ts` (DFS, 8 direzioni, `q` = "qu"): la stessa parola si
  può comporre in più modi, quindi serve il tracciato, non solo il testo.
- **Definizione**: il pulsante "?" accanto alla parola appena trovata (o
  suggerita) apre le definizioni. Fonte: dump di Wikizionario (kaikki.org /
  wiktextract), estratto in `definitions.br` da
  `pnpm --filter @boggle/dictionary build:definitions`.

**Perché le definizioni sono "filtrate"**: le voci `form-of` (es. `amo` →
"prima persona di amare") sono **escluse**. Non spiegano il significato, dicono
solo da quale lemma deriva; il significato sta nel lemma. Per una forma flessa
il pannello mostra quindi il link alla voce online, non un testo vuoto.

**Dove**: `useSoloGame.ts` (suggerimento, tempo infinito), `GridBoard`
(`hintPath` → celle `.tile--hint` animate), `CurrentWord` + `WordDefinition`
(pannello), rotta `GET /words/:word/definition`.

---

## Taratura e verifica

- `measure:schede [--variant standard|full] [--n N] [--size S]` misura, per ogni
  dimensione × difficoltà: percentili di parole accettate, quota dentro banda,
  quota con struttura valida, lunghezza media, correlazione parole↔punti,
  composizione media. Da qui si aggiustano i numeri negli `*_SPEC`. Se la quota
  "entrambe" è < 10%, la banda è troppo stretta.
- `verify:schede [--measure N] [--verbose] [--size S] [--difficolta D]` controlla
  ogni scheda (su disco o generata fresca) contro i criteri e **esce con codice 1**
  se trova violazioni (usabile in CI). Verifica:
  - densità nella banda della variante;
  - parole ancora (`length` × `count`);
  - lunghezza media (solo full);
  - struttura giocabile (solo full);
  - coerenza di `longest` con `allWords`;
  - `words ⊆ allWords`;
  - presenza nel dizionario (schede stale).
- Con le bande chiuse su entrambi i lati la disparità del catalogo `full` scende
  da 1,7–2,8× a **1,1–1,6×** su parole e punti.

---

## Verifica di fedeltà dei sorgenti

- `COMPOSITION`, `FULL_COMPOSITION`, `DENSITY`, `MIN_LONGEST`, `STANDARD_SPEC`,
  `FULL_SPEC`, `BAND_SIZES`, i limiti di solve: **copiati alla lettera** da
  `packages/shared/src/schedaGen.ts` e `grid.ts`.
- Ordine dei controlli: standard → densità → ancore; full → struttura → densità →
  ancore → lunghezza media (identico all'originale).
- Non reimplementati nei due blocchi: `solveGrid` e `buildTrie` (in `solver.ts`,
  qui `declare`) e l'I/O degli script.
