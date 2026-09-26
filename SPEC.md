# Sbooble — Specifica v0.1

> Gioco web stile Boggle in italiano. Single player + multiplayer con codice stanza.
> Le parole si compongono **scorrendo il dito sulle lettere** del quadrato (swipe/drag).

---

## 1. Obiettivo della v0.1

Un gioco completo e giocabile end-to-end (single player e multiplayer), con animazioni
semplici ma curate, dizionario italiano ampio e tre formati di griglia. Nessun account,
nessuna persistenza su database, nessuna PWA.

**Definizione di "fatto" (v0.1):**
- Apro il sito → posso giocare subito in single player (3 round).
- Posso creare una stanza, ricevere un codice a 6 caratteri, e un amico può entrarci.
- Entrambi vediamo la **stessa griglia** e lo **stesso timer**, e vediamo la classifica live.
- Compongo parole con swipe, valide solo se presenti nella scheda e non già trovate.
- A fine partita vedo punteggio e riepilogo delle parole mancate.

---

## 2. Decisioni tecniche bloccate

| Ambito | Scelta |
|---|---|
| Frontend | **React 18 + Vite + TypeScript** |
| Animazioni | **CSS + Web Animations API** (nessuna libreria) |
| Multiplayer | **Node + Socket.IO**, stanza con codice 6 caratteri |
| Dizionario | **Schede pre-calcolate** (client) + **validazione server** in multiplayer; ~368k forme, tutte giocabili |
| Struttura | **Monorepo pnpm workspaces** |
| Sorgente dizionario | **Morph-it! (UniBO) + Wikizionario** (headword e categorie; nessuna abbreviazione) |
| Griglie | **4×4, 5×5, 6×6** selezionabili, da un **catalogo di 180 schede** |
| Punteggio | **lunghezza − 2**; in multiplayer **raddoppio** se trovata da un solo giocatore |

---

## 3. Regole di gioco

### 3.1 Scheda (griglia pre-generata)
- N×N (`N ∈ {4,5,6}`) con **composizione controllata** per difficoltà:
  un numero esatto di vocali, un limite di lettere rare **italiane** (solo `z`), il resto
  consonanti comuni. Le lettere **non italiane** (`k w x y j`) non entrano mai in griglia.
- La faccia `q` rappresenta il digramma **"Qu"** (Q+U inseparabili, come nel Boggle ufficiale).
- La difficoltà agisce sulla composizione, non sulla dimensione (scelta separata).
- Modello derivato empiricamente: le lettere rare sono il fattore dominante sul numero di
  parole trovabili (r ≈ -0.6), le vocali contano molto meno (r ≈ 0.2). Controllare solo le
  vocali lasciava i livelli indistinguibili (mediane 64/62/61 su 4×4); controllando entrambe
  le mediane diventano 86 / 74 / 52 / 49.

**Le griglie non sono più generate a runtime per giocare**: si pescano da un **catalogo di
schede pre-calcolate** (`packages/shared/schede/`). Ogni scheda contiene la griglia e **tutte**
le parole trovabili. Vantaggi: partite riproducibili, soluzioni verificate, nessun solver a
runtime, e la possibilità di **filtrare la qualità** delle schede (parole lunghe, parole comuni).

**Algoritmo di generazione** (`packages/shared/src/schedaGen.ts`): tre trie per fascia di
**frequenza d'uso** (5.000 / 20.000 / 60.000 parole più frequenti, da `frequency-it.txt`) e
griglia con la **composizione controllata** della difficoltà (vocali e lettere rare, misurate).
Perché entrambe le cose: le statistiche di lettera dell'italiano NON cambiano con la frequenza
(vocali 45,6% nel top 5k e 45,0% nel 20k–60k), quindi campionare le lettere dalla fascia
produrrebbe la stessa griglia per tutti i livelli; la composizione è invece la leva che si sente.

Ogni scheda porta **due elenchi di parole**:
- `words` — le parole della fascia (le più frequenti componibili): sono le "attese", mostrate
  nel riepilogo ("parole che esistevano");
- `allWords` — TUTTE le parole del dizionario componibili sulla griglia: è l'insieme **accettato**
  in partita (una parola rara fuori fascia vale lo stesso, stessi punti).

Requisiti di qualità (imposti in generazione, con rigenerazione finché non è soddisfatto):
- **densità di parole accettate** nella banda della difficoltà: su 4×4 circa 85 / 49 / 26,
  su 5×5 187 / 156 / 71, su 6×6 336 / 226 / 156 (Facile / Normale / Difficile);
- almeno **una parola lunga** (≥ 6 su 4×4, ≥ 7 su 5×5, ≥ 8 su 6×6);
- tutte le griglie risolvono contro il **dizionario completo**: ogni voce del dizionario è
  giocabile e viceversa (una sola lista di parole valide).

**Due insiemi di criteri, selezionabili in partita** (`Scheda.variant`):

| | `standard` | `full` ("full criteria") |
|---|---|---|
| Composizione | modello storico: vocali 40–52% / 27–38% / 16–27%, `z` ≤3% / ≤12% / ≤12%, mai lettere non italiane | rapporto vocali/consonanti per livello: **40–45% / 30–35% / <30%**, almeno una `z` obbligatoria nel difficile, mai lettere non italiane |
| Frequenza delle lettere | consonanti comuni | pool di consonanti per livello (alta frequenza → consonanti medie → lettere rare) |
| Lettere non italiane | mai in griglia | mai in griglia |
| Numero di parole | bande misurate (46–200 / 25–120 / 10–60 su 4×4) | dai criteri **+ il lato mancante misurato**: >120 e tetto 170 (4×4 facile), <45 e minimo 25 (4×4 difficile), ecc. |
| Parole ancora | almeno 1 parola lunga | più parole lunghe: 2–4 da 6+ (4×4 facile), multiple da 7+ (5×5 facile), 8+ (6×6 facile) |
| Lunghezza media | — | bande misurate (4,4 / 4,1 / 3,8 su 4×4) |
| Struttura | — | nessuna consonante a più di 2 celle da una vocale, al massimo una riga/colonna senza vocali, nessuna `h` senza `c`/`g` |

La scelta si fa in home (foglio impostazioni) e vale sia per il single player sia per la stanza
creata; in lobby l'host può cambiarla. Le schede `full` portano l'etichetta **FULL** nella pagina
"Sfoglia le schede", dove si possono anche filtrare.

**La banda sul numero di parole è la leva della disparità.** Misurato: `r(parole, punti) = 0,99`
(il 98% della varianza dei punti è spiegata dal numero di parole; i punti per parola variano solo
±10-15%). Per questo NON c'è una banda sul punteggio: stringere le parole stringe i punti. Con le
bande chiuse su entrambi i lati, la disparità del catalogo `full` scende da 1,7–2,8× a **1,1–1,6×**
su parole e punti.

Non implementati dei criteri "full" (non misurabili nel generatore): **morfologia/desinenze**
(servirebbe un'analisi morfologica delle parole: in parte la fa la fascia di frequenza) e
**geometria dei percorsi** (servirebbe il tracciato di ogni parola trovata). La lunghezza media
dei criteri (3–5 facile, 7+ difficile) è realizzata con bande misurate: su griglie reali la
direzione è invertita (facile 4,4 · difficile 3,8 su 4×4) perché con vocali e consonanti comuni
si formano parole lunghe.

I numeri si rimisurano con `pnpm --filter @boggle/server measure:schede` (opzione `--variant`);
le schede si verificano con `verify:schede`.

Catalogo di base: **135 schede** — 10 `standard` + 5 `full` per ognuna delle 9 combinazioni
dimensione × difficoltà — rigenerabili con `pnpm gen:schede` (opzioni `--variant`, `--append`) e
ampliabili dal pannello admin.

### 3.2 Selezione parola (swipe)
- Il giocatore preme su una cella e trascina verso celle **adiacenti** (8 direzioni).
- Ogni cella può essere usata **una sola volta** per parola.
- Tornare sull'ultima cella selezionata → annulla l'ultimo passo (undo immediato).
- Rilasciare il dito → la parola viene confermata e validata.
- Una parola deve avere **≥ 3 lettere**.
- Le celle non possono essere riutilizzate nella stessa parola (percorso semplice).
- **Riconoscimento** (`apps/web/src/game/cellTracker.ts`): dalla cella corrente la
  direzione del vettore dito→centro viene classificata in 8 settori angolari; le diagonali
  hanno settori più larghi, così un dito che "striscia" verso la laterale sceglie comunque
  la cella diagonale voluta. Si richiedono una **deadzone oltre il confine fra le celle**
  (una cella si accende solo quando il dito è davvero entrato in quella vicina, non
  "sfiorandola") e un allineamento minimo, più severo al cambio di direzione. La soglia di
  **undo è più alta di quella di attivazione** (isteresi: accendere è facile, spegnere no) e
  i **micro-movimenti si accumulano** invece di essere valutati uno per uno, così un tremolio
  sul bordo non produce sfarfallio e i percorsi a zig-zag incrociati restano stabili.
  I movimenti veloci sono interpolati, quindi non si perdono le celle intermedie.

### 3.3 Validità
Una parola è valida se **tutte** queste condizioni sono vere:
1. Lunghezza ≥ 3.
2. **Presente fra le parole della scheda** (multiplayer: presente nel dizionario italiano).
3. Non già trovata in questo round dal giocatore.
4. Percorso legale nella griglia (adiacenza + nessuna cella ripetuta) — validato client e server.

### 3.4 Punteggio
**Regola classica adattata**: 1 punto per una parola di 3 lettere, **un punto in più per ogni
lettera aggiuntiva** → `punti = lunghezza − 2`.

| Lunghezza | Punti |
|---|---|
| 3 | 1 |
| 4 | 2 |
| 5 | 3 |
| 6 | 4 |
| 10 | 8 |
| 16 | 14 |

La formula è **lineare e senza tetto** (non si ferma a 8 lettere): le schede contengono parole
lunghe, che devono valere di più.

**Raddoppio (solo multiplayer)**: una parola trovata da **un solo giocatore** vale doppio.
In single player non esiste il concetto di "unico", quindi niente raddoppio.
In caso di parola trovata da più giocatori, ognuno prende i punti base.

### 3.5 Struttura partita
- Round da **180 secondi** (3 min) con countdown visibile.
- Dopo ogni round: schermata risultati parziale con classifica e parole che gli altri hanno trovato.
- Numero round configurabile (default **3**).
- A fine partita: **podio** dei primi tre (avatar, nome, punti, corona al vincitore) e classifica
  finale + riepilogo per giocatore (parole trovate e mancate).

---

## 4. Dizionario

### 4.1 Fonte
- **Morph-it! 0.48** (Università di Bologna) — lessico morfologico con forme flesse.
  Licenza duale **CC BY-SA 2.0** / **LGPL**. ~405k forme uniche, ~382k ≥3 lettere.
  Include **tutte le forme verbali coniugate**.
- **napolux/paroleitaliane** (~60k lemmi comuni) — usata come integrazione per colmare
  lacune di vocabolario quotidiano di Morph-it (es. `che`, `ghiaccio`).
- **Abbreviazioni da Wikizionario** — aggiunte come lista curata nel repo.

### 4.2 Normalizzazione
- Tutto in minuscolo, solo caratteri `a-z`, lunghezza 3–16.
- Gli apostrofi vengono rimossi/scartati (le parole con apostrofo non sono giocabili).
- Gli accenti **non** presenti in Morph-it (verificato: il file è privo di caratteri accentati).
  Le forme accentate della lista comuni vengono normalizzate alla vocale base
  (`perché → perche`) e accettate nella forma normalizzata.

### 4.3 Formato distribuito
- `packages/dictionary/data/words.txt` — lista ordinata, una parola per riga.
- **Il client non scarica più il dizionario**: le parole valide per il single player
  arrivano dalle **schede** (`packages/shared/schede/*.json`), che il server serve via HTTP.
- Il server tiene il dizionario in memoria (`Set`) come **fonte di verità** per la validazione
  in multiplayer e per la generazione di nuove schede dall'admin.
- Le schede sono servite dal catalogo in RAM: `/schede`, `/schede/:id`, `/preview`.

### 4.4 Validazione
- **Client (single player)**: validazione istantanea contro l'elenco parole della scheda.
- **Server (multiplayer)**: ricalcola e valida ogni parola ricevuta (dizionario + percorso).
  Il client non può inventare parole o percorsi.
- **Schede**: generate offline o dall'admin, mai dal giocatore: le parole sono già filtrate
  per qualità.

---

## 4-bis. Catalogo schede e admin

### 4-bis.1 Formato scheda
```json
{
  "id": "4-normale-017",
  "size": 4,
  "difficulty": "normale",
  "grid": "casa\\nsola\\ntino\\nevia",
  "words": ["cassaforte", "..."],
  "longest": 10
}
```
I punti non sono salvati: si derivano (`lunghezza − 2`). I file sono partizionati per
`size-difficulty` (`schede-4-normale.json`, ...) con un wrapper `{ version, generatedAt, schede }`.

### 4-bis.2 Endpoint
| Metodo | Rotta | Auth | Descrizione |
|---|---|---|---|
| GET | `/schede` | no | Totali e conteggi per gruppo |
| GET | `/schede/:id` | no | Scheda completa (griglia + tutte le parole) |
| GET | `/preview?gridSize=&difficulty=` | no | Una scheda di esempio + conteggio |
| GET | `/admin/verify` | Bearer | Verifica token |
| GET | `/admin/schede?size=&difficulty=` | Bearer | Elenco metadati schede |
| POST | `/admin/schede/genera` | Bearer | Genera e salva nuove schede |

Il token admin sta in `ADMIN_TOKEN`. Se non impostato, le rotte admin rispondono **503**
(admin disabilitato di default: più sicuro di un pannello aperto per dimenticanza).
Le schede generate dall'admin sono salvate in `SCHEDE_EXTRA_DIR` (default `schede-extra/`),
separate da quelle versionate, e aggiunte subito al catalogo in memoria.

### 4-bis.3 Interfaccia
- **Home**: numero totale di schede disponibili, sempre visibile.
- **Pagina scheda** (`/` → schermata `scheda`): griglia e **tutte** le parole trovabili,
  raggruppate per lunghezza con i punti. Le soluzioni sono pubbliche per scelta di prodotto.
- **Pannello admin** (schermata `admin`): token, elenco con anteprima delle griglie,
  filtri e generazione di nuove schede; dalla card si apre la pagina scheda.

---

## 5. Modalità

### 5.1 Single player
- **Un solo menù** per le impostazioni (griglia 4×4 / 5×5 / 6×6, difficoltà, durata, round):
  si apre come foglio sovrapposto dalla home e sta **in una schermata senza scorrere**.
- **Si parte con un tocco**: «Gioca da solo» sorteggia la scheda e fa partire il countdown.
  Non esiste più una schermata intermedia di conferma.
- **La scheda non si vede prima**: griglia e parole si scoprono **solo quando il round
  comincia** (né in home né altrove), così nessuno parte avvantaggiato.
- Ogni round pesca una **scheda** casuale dal catalogo del server.
- Timer, griglia, punteggio, lista parole trovate.
- Validazione contro le parole della scheda (nessun dizionario nel client).
- A fine round: riepilogo con le parole che esistevano e non sono state trovate
  (limitato alle più "interessanti": lunghe ≥ 5, max ~20).

### 5.2 Multiplayer (codice stanza)
- **Crea stanza** → codice alfanumerico di **6 caratteri** (es. `K7QM2P`), senza vocali
  ambigue (no I/O/1/0), per leggibilità.
- **Entra nella stanza** → inserendo il codice.
- Host sceglie formato griglia + numero round nel lobby; gli altri vedono le impostazioni.
- Countdown **3-2-1** sincronizzato dal server prima di ogni round.
- Stessa griglia e stesso timer per tutti (server è l'autorità sul timer).
- Sidebar con **classifica live** (punteggi aggiornati in tempo reale).
- Nella schermata di fine round ogni giocatore vede le parole trovate dagli altri.
- Gestione disconnessione: il giocatore viene marcato "offline"; la partita continua.
- Riconnessione con lo stesso `playerId` recupera lo stato della stanza.
- **Riconnessione trasparente**: se il socket si riconnette da solo (rete instabile, app in background), il client rientra in stanza con `room:rejoin` e riprende a inviare parole. Prima il server perdeva il legame e rispondeva "Non in una stanza".
- **Voce in stanza**: tasto col microfono in basso a destra, si **tiene premuto** per parlare; gli altri
  sentono la voce quasi in diretta (~0,2 s). Tre barrette accanto al nome mostrano chi parla; un secondo
  tasto silenzia il proprio microfono. L'audio **non viene registrato** e il server lo inoltra soltanto.
  Limiti: max 4 voci insieme, pacchetti PCM 16 kHz mono da 64 ms (vedi §8).

---

## 6. Interfaccia e flusso

### 6.1 Schermate
1. **Home** — titolo, numero di schede disponibili, «Gioca da solo» (parte subito) e
   «Impostazioni partita» (apre il foglio), campo codice + «Entra», link a «Sfoglia le
   schede» e «Admin», credits dizionario.
2. **Impostazioni partita** — foglio sovrapposto alla home: griglia, difficoltà, durata,
   round, «Regole e punteggi», e le due partenze «Gioca da solo» / «Crea la stanza».
   Le stesse scelte valgono per single player e stanza.
3. **Lobby multiplayer** — codice stanza grande e copiabile, invito con link, lista
   giocatori, impostazioni host, «Avvia». Della scheda si sa solo **che è pronta**: non si
   vede prima del round.
4. **Gioco** — griglia centrale, timer, punteggio, input parola corrente, lista parole trovate, classifica (MP).
5. **Riepilogo round** — punteggi del round, parole per giocatore (badge ×2 sulle uniche), "Prossimo round".
6. **Riepilogo finale** — classifica, statistiche, "Rigioca" / "Torna alla home".
7. **Scheda** — griglia della scheda e tutte le parole trovabili, per lunghezza.
8. **Admin** — token, elenco schede con anteprima, filtri, generazione.

Mobile-first: layout verticale, griglia a tutta larghezza, area di swipe con `touch-action: none`.

### 6.2 Animazioni (CSS + WAAPI)
| Evento | Animazione |
|---|---|
| Inizio round | Pop-in scalato a cascata delle celle |
| Countdown | Numeri 3-2-1 con scale+fade |
| Passaggio su cella | Tile "premuta" + pulse luminoso |
| Percorso attivo | Trailer SVG luminoso che collega le celle selezionate |
| Parola valida | Flash verde + pop del punteggio + tile che si "schiariscono" |
| Parola non valida | Shake della griglia + flash rosso |
| Timer < 10s | Pulse rosso del timer |
| Fine round | Burst di particelle/confetti + fade-out celle |
| Nuovo punteggio in classifica | Slide-in + highlight |
| Mobile | `navigator.vibrate` su selezione e conferma (se disponibile) |

Tutte rispettano `prefers-reduced-motion`.

---

## 7. Architettura

```
sbooble/
├── apps/
│   ├── web/                    # React + Vite + TS
│   │   ├── src/
│   │   │   ├── components/     # GridBoard, Timer, WordList, MatchSettings, Podium,
│   │   │   │                   #   VoiceControls, RichText, ...
│   │   │   ├── screens/        # Home, SoloGame, Lobby, MP, Summary,
│   │   │   │                   #   Scheda (soluzioni), Admin
│   │   │   ├── game/           # cellTracker (swipe), useSoloGame
│   │   │   ├── net/            # socket client
│   │   │   └── state/          # store (zustand)
│   └── server/                 # Node + Express + Socket.IO
│       ├── scripts/
│       │   └── gen-schede.ts   # generatore schede (CLI)
│       └── src/
│           ├── rooms.ts        # stanza, round, punteggio (raddoppio)
│           ├── voice.ts        # canale voce della stanza (limiti e inoltro)
│           ├── schede.ts       # catalogo schede (carica/serve/persisti)
│           ├── dictionary.ts   # dizionario + pool di generazione (lazy)
│           └── index.ts        # HTTP + Socket.IO + admin
├── packages/
│   ├── shared/                 # tipi, griglia, scoring, solver, schede (web+server)
│   │   └── schede/             # 180 schede pre-calcolate (JSON versionati)
│   └── dictionary/             # lista parole + script di build
├── tools/
│   └── check-context.mjs       # controllo contesto di build
├── SPEC.md
└── README.md
```

**Principio chiave**: tutta la logica deterministica (griglia, adiacenza, punteggio) vive in
`packages/shared` ed è usata **sia dal client sia dal server** → nessuna duplicazione, nessuna divergenza.

---

## 8. Protocollo Socket.IO (v0.1)

**Client → Server**
- `room:create` `{ nickname, avatar, gridSize, difficulty, rounds, roundDurationMs }` → `{ roomCode, playerId, state }`
- `room:join` `{ roomCode, nickname, playerId? }` → `{ state }`
- `room:rejoin` `{ code, playerId }` → `{ playerId, state }` — rientro dopo una **riconnessione trasparente** del socket: il server ricostruisce il legame socket ↔ giocatore (che Socket.IO perde cambiando `socket.id`) senza far ripartire la partita.
- `room:start` `{ roomCode }` (solo host)
- `game:submitWord` `{ word, path }` → `{ accepted, reason?, word?, points? }`
- `room:leave` `{ roomCode }`
- `voice:start` → `{ ok }` | `{ code, message }` — apre il canale voce (rifiuta se le 4 voci sono occupate)
- `voice:chunk` `ArrayBuffer` (1024 campioni Int16 = 64 ms a 16 kHz) — inoltrato agli altri della stanza
- `voice:stop` — rilascia il posto nel canale

**Server → Client**
- `room:update` `{ players, hostId, gridSize, rounds, phase }`
- `game:roundStart` `{ round, grid, endsAt, durationMs, schedaId? }`
- `game:playerWord` `{ playerId, avatar, word, points, score, self }` (broadcast per classifica live)
- `game:roundEnd` `{ round, results, missedWords, nextRoundInMs }`
- `game:gameEnd` `{ finalScores }`
- `voice:audio` `{ playerId, data }` — voce di un altro giocatore (a chi parla non torna indietro)
- `error` `{ code, message }`

Timer autorevole: il server emette `endsAt` come timestamp; il client calcola il countdown
locale compensando la latenza. Il server chiude il round a prescindere dal client.

---

## 9. Fuori scope v0.1 (roadmap v0.2+)
- Account, login, profili, storico partite (persistenza)
- Chat in stanza, emoji/reazioni — la **voce** in stanza è arrivata nella v0.19.0; mancano la chat scritta e le reazioni
- Bot / avversari AI
- Bonus (parole uniche, più lunga) e regole opzionali
- Classifiche globali e matchmaking pubblico
- PWA / offline / installabilità
- Internazionalizzazione
- Notifiche push
- Spettatori

---

## 10. Licenze e attribuzioni
- **Morph-it!** — Baroni & Zanchetta, Università di Bologna — CC BY-SA 2.0 / LGPL.
  Attribuzione obbligatoria nell'app (pagina credits + README). La lista derivata
  resta distribuita sotto CC BY-SA 2.0.
- **paroleitaliane** (napolux) — vedi licenza del repo.
- **Wikizionario** — CC BY-SA 4.0 per headword e categorie grammaticali.
- Codice del gioco: da definire (proposta MIT).
