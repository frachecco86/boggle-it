# Lessico, griglia, solver, formato scheda (parti comuni)

<!-- Parte di docs/algoritmi — vedi README.md per l’indice -->

Valgono per **tutti** gli algoritmi: [standard](./standard.md), [full](./full.md), [ale](./ale.md).

---

## 0. Vocabolario

- **Scheda**: griglia **pre-generata e pre-risolta**, con l'elenco delle parole
  componibili. I giocatori non generano griglie al volo: pescano dal catalogo.
- **Griglia**: `N×N` (`4×4`, `5×5`, `6×6`). Una cella/faccia = una lettera;
  la faccia `q` vale **`qu`**.
- **`words`**: parole **attese** = quelle della **fascia di frequenza** della
  difficoltà, componibili sulla griglia. Sono quelle mostrate nel riepilogo
  ("parole che esistevano").
- **`allWords`**: parole **accettate** = **tutte** quelle del **dizionario
  intero** componibili. È l'insieme che il gioco accetta in partita.
- **`variant`**: insieme di criteri con cui la scheda è nata, `standard` o `full`.
- **Densità**: numero di parole **accettate** (`allWords`) sulla griglia.
- **Parole ancora**: almeno `count` parole di almeno `length` lettere.
- **Lunghezza media**: media delle lettere di `allWords`.
- **Struttura giocabile**: assenza di "zone morte" (consonanti isolate, righe o
  colonne senza vocali, `h` inutili).
- **Varianti disponibili**: `standard` (predefinita), `full`.

---

## Lessico, griglia, solver, formato scheda

Valgono per tutti e tre gli algoritmi: [standard](./standard.md), [full](./full.md),
[ale](./ale.md).

### A.1 Lessico: un dizionario intero + tre fasce

- Si costruiscono **quattro** trie:
  - `full` — **dizionario intero** giocabile → da qui `allWords`;
  - `bands.facile` — prime **5 000** parole italiane per frequenza d'uso;
  - `bands.normale` — prime **20 000**;
  - `bands.difficile` — prime **60 000**.
- Le fasce si ritagliano da una lista **ordinata per frequenza**
  (`frequency-it.txt`, generata da `build-frequency.mjs`): non sono liste curate.
- Una parola entra in una fascia **solo se è già giocabile** (sta in `full`):
  così `words ⊆ allWords`, sempre.
- Filtro di pulizia prima dei trie: le fonti contengono ~50k troncamenti
  (`andar`, `abbacchier`, `nauseer`). Una parola si tiene solo se:
  - termina in **vocale**, oppure
  - compare in `consonant-endings.txt` (prestiti/apocopi legittime), oppure
  - compare in `protectedWords` (whitelist curate).
- Le **abbreviazioni non sono ammesse** (vedi l'appendice in fondo a questo file): `abbreviations.txt` è
  stato rimosso. Conteneva abbreviazioni vere (`dott`) ma anche ~100 etichette di
  materia/grammatica (`idr`, `geogr`, `fis`, `sost`, `avv`), cioè troncamenti di
  classificazione che non sono parole italiane.
- La lista delle parole giocabili **coincide** con il dizionario: non esistono
  esclusioni extra di "parole funzionali".

### A.2 Griglia: costruzione (non campionamento)

- `generateGrid` **costruisce** la griglia invece di pescare 16 dadi:
  1. numero esatto di **vocali** nella fascia della difficoltà;
  2. numero limitato di **lettere rare** (z k w x y j);
  3. `h` e `q` in modo probabilistico (`hqChance`), senza consumare il budget rare
     (servono a *che/chi/qui/qua*);
  4. il resto **consonanti comuni**;
  5. **mescola** con Fisher-Yates.
- **Perché non si campiona dalle fasce**: misurato, le statistiche di lettera
  dell'italiano **non cambiano** con la frequenza (vocali 45,6% nel top 5k e
  45,0% nel 20k–60k; rare 1,14% vs 1,24%). Campionando dalla fascia, le tre
  difficoltà producevano **la stessa griglia**.
- `q` è una faccia speciale: `letterValue('q') === 'qu'`, `letterDisplay('q') === 'Qu'`.

### A.3 Solver

- `buildTrie` costruisce un trie compatto (`children: Map<char,node>`, `word`
  sul nodo terminale); `maxLength` limita la memoria (default 14).
- `solveGrid` fa una **DFS con potatura**: scende nel trie solo se il prefisso
  esiste; limite di parole (`limit`) e lunghezza minima 3.
- La griglia si risolve **due volte**: su `full` → `allWords`; sulla fascia
  della difficoltà → `words`.

### A.4 Formato della scheda

- Campi: `id`, `size`, `difficulty`, `grid` (righe separate da `\n`, `q` = Qu),
  `variant`, `words`, `allWords`, `longest`.
- `longest` = lunghezza della parola più lunga di `allWords` (insieme accettato).
- Punteggio parola: **`lunghezza − 2`** (3 lettere → 1 punto), minimo 3 lettere.
  Nel multiplayer una parola trovata da un solo giocatore vale **doppio**.

### A.5 Perché offline

- **Filtro di qualità**: non si può giudicare una griglia senza risolverla
  (quante parole, la più lunga, la media) → ciclo genera → risolve → giudica,
  troppo caro a runtime.
- **Determinismo**: soluzione pre-calcolata uguale per tutti.
- **Riproducibilità**: la stessa scheda si rigioca e si confronta.

---

## Appendice — Lettere rare e lettere non italiane

La separazione è ora nel codice: `RARE_ITALIAN = ['z']` e
`FOREIGN_LETTERS = ['k','w','x','y','j']` (`packages/shared/src/grid.ts`).

- **`z` è italiana e produttiva**: 35 602 voci nel dizionario (9,7% delle
  parole). È l'unica lettera rara usata, con tetti 3% / 12% / 12%.
- **`k w x y j` sono quasi tutte prestiti/derivati**: k 481, x 327, y 287, w 264,
  j 153 voci; nella fascia *facile* (prime 5 000) solo 33 parole in tutto
  (`taxi`, `weekend`, `show`, `killer`, `gay`…).
- **Scelta implementata**: `foreignMax: 0` in tutte le difficoltà — le lettere non
  italiane **non entrano mai in griglia**. Le parole straniere restano nel
  dizionario e sono accettate se componibili con altre lettere.
- Perché la separazione:
  - `z` = rarità giocabile; `k w x y j` = lettere straniere, in gran parte "celle
    morte" (non formano nessuna parola di 3+ lettere);
  - il vecchio `rareMin 1` poteva **obbligare** una lettera morta (`j`), perché non
    distingueva `z` da `j`; ora si applica solo a `z`;
  - `gridStructureIssues` segnala comunque come difetto ogni lettera non italiana
    presente in griglia (difesa in profondità se `foreignMax` tornasse > 0).
- **Catalogo rigenerato** con i nuovi criteri: 135 schede (10 standard + 5 full per
  ognuna delle 9 combinazioni), **0 celle non italiane**, 77 schede con almeno una
  `z`. `verify:schede` non trova violazioni.
- **Da rimisurare**: i numeri di densità sono tarati sul vecchio insieme di
  lettere. Il catalogo attuale è conforme, ma `measure:schede` mostra che per la
  variante `full` difficile la quota che soddisfa *tutti* i criteri in un colpo è
  bassa (~1–4%): il generatore usa il ripiego più spesso. È un effetto
  pre-esistente (la struttura era già il collo di bottiglia), non introdotto da
  questa modifica; si può allargare la banda in `FULL_SPEC` se si vuole ridurlo.

---

## Appendice — Abbreviazioni ed etichette di materia (rimosse)

`packages/dictionary/data/abbreviations.txt` è stato **eliminato** e non è più una
fonte del dizionario.

- Conteneva due categorie diverse:
  - **abbreviazioni vere** (`dott`, `prof`, `sig`, `ing`, `rag`, `egr`…), ~35;
  - **etichette di materia/grammatica** (`idr` = idraulica, `geogr`, `chim`,
    `fis`, `mat`, `sost`, `avv`, `verb`, `prep`…), ~97: troncamenti usati per
    classificare gli altri lemmi, **non parole italiane**.
- **Effetto osservato**: `idr` compariva tra le parole trovabili delle schede pur
  non essendo nel dizionario generato da Morph-it. Con l'etichetta "abbreviazione"
  sfuggiva al filtro dei troncamenti (che scarta le parole che finiscono in
  consonante) ed entrava nel lessico giocabile.
- **Rimozione**: eliminate tutte le voci del file. Dal dizionario sono sparite
  **113 voci** (368.213 → 368.100); 6 restano perché sono già parole piene o in
  `consonant-endings.txt` (`prof`, `societa`, `ecc`, `bot`, `con`, `dir`, `fin`,
  `sport`, `tip`).
- **Codice**: rimosso `abbreviations` da `createSchedaPool` e dagli script
  (`gen-schede`, `measure-schede`, `verify-schede`); `build-words.mjs` non la
  applica più. `frequency-it.txt` è stato filtrato sulle sole parole giocabili
  (la fascia difficile è 59.959 invece di 60.000: è tutte le parole disponibili).
- **Catalogo**: rigenerato. `verify:schede` non trova violazioni e **nessuna**
  delle 113 voci rimosse compare più in `allWords`/`words` (verificato: 0).
