# Boggle-IT — Specifica v0.1

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
- Compongo parole con swipe, valide solo se presenti nel dizionario e non già trovate.
- A fine partita vedo punteggio e riepilogo delle parole mancate.

---

## 2. Decisioni tecniche bloccate

| Ambito | Scelta |
|---|---|
| Frontend | **React 18 + Vite + TypeScript** |
| Animazioni | **CSS + Web Animations API** (nessuna libreria) |
| Multiplayer | **Node + Socket.IO**, stanza con codice 6 caratteri |
| Dizionario | **Bundle client + validazione server** |
| Struttura | **Monorepo pnpm workspaces** |
| Sorgente dizionario | **Morph-it! (UniBO) + abbreviazioni Wikizionario** |
| Griglie | **4×4, 5×5, 6×6** selezionabili |
| Parole duplicate | **Punteggio pieno a tutti** (ogni giocatore prende i punti delle parole che trova) |

---

## 3. Regole di gioco

### 3.1 Generazione griglia
- N×N (`N ∈ {4,5,6}`) con **composizione controllata** per difficoltà:
  un numero esatto di vocali, un limite di lettere rare (z k w x y j), il resto consonanti comuni.
- La faccia `q` rappresenta il digramma **"Qu"** (Q+U inseparabili, come nel Boggle ufficiale).
- La difficoltà agisce sulla composizione, non sulla dimensione (scelta separata).
- Modello derivato empiricamente: le lettere rare sono il fattore dominante sul numero di
  parole trovabili (r ≈ -0.6), le vocali contano molto meno (r ≈ 0.2). Controllare solo le
  vocali lasciava i livelli indistinguibili (mediane 64/62/61 su 4×4); controllando entrambe
  le mediane diventano 86 / 74 / 52 / 49.

### 3.2 Selezione parola (swipe)
- Il giocatore preme su una cella e trascina verso celle **adiacenti** (8 direzioni).
- Ogni cella può essere usata **una sola volta** per parola.
- Tornare sull'ultima cella selezionata → annulla l'ultimo passo (undo immediato).
- Rilasciare il dito → la parola viene confermata e validata.
- Una parola deve avere **≥ 3 lettere**.
- Le celle non possono essere riutilizzate nella stessa parola (percorso semplice).

### 3.3 Validità
Una parola è valida se **tutte** queste condizioni sono vere:
1. Lunghezza ≥ 3.
2. Presente nel dizionario italiano (forma esatta, vedi §4).
3. Non già trovata in questo round dal giocatore.
4. Percorso legale nella griglia (adiacenza + nessuna cella ripetuta) — validato client e server.

### 3.4 Punteggio
| Lunghezza | Punti |
|---|---|
| 3–4 | 1 |
| 5 | 2 |
| 6 | 3 |
| 7 | 4 |
| 8+ | 5 |

Nessun bonus in v0.1 (rimandato a v0.2). **Parole duplicate: punteggio pieno a tutti.**

### 3.5 Struttura partita
- Round da **180 secondi** (3 min) con countdown visibile.
- Dopo ogni round: schermata risultati parziale con classifica e parole che gli altri hanno trovato.
- Numero round configurabile (default **3**).
- A fine partita: classifica finale + riepilogo per giocatore (parole trovate e mancate).

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
- Build: genera `words.json` / array compresso per il client (~390k parole, ordinate
  per consentire binary search) + `.br` precompressa servita dal server.
- Client: `Set` in memoria + ricerca binaria sui dati compressi; lookup O(1)/O(log n).
- Server: stessa lista come **fonte di verità** per la validazione in multiplayer.

### 4.4 Validazione
- **Client**: validazione istantanea per feedback UI (shake/accettata).
- **Server**: in multiplayer ricalcola e valida ogni parola ricevuta. Il client non può
  inventare parole o percorsi.

---

## 5. Modalità

### 5.1 Single player
- Selezione formato griglia (4×4 / 5×5 / 6×6) e numero round.
- Timer, griglia, punteggio, lista parole trovate.
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

---

## 6. Interfaccia e flusso

### 6.1 Schermate
1. **Home** — titolo, bottoni "Gioca da solo" / "Crea partita" / "Entra con codice", credits dizionario.
2. **Setup single player** — griglia N, numero round, "Inizia".
3. **Lobby multiplayer** — codice stanza grande e copiabile, lista giocatori, impostazioni host, "Avvia".
4. **Gioco** — griglia centrale, timer, punteggio, input parola corrente, lista parole trovate, classifica (MP).
5. **Riepilogo round** — punteggi del round, parole per giocatore, "Prossimo round".
6. **Riepilogo finale** — classifica, statistiche, "Rigioca" / "Torna alla home".

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
boggle-it/
├── apps/
│   ├── web/                    # React + Vite + TS
│   │   ├── src/
│   │   │   ├── components/     # Grid, Tile, Timer, ScoreList, Lobby, ...
│   │   │   ├── screens/        # Home, SoloSetup, Lobby, Game, RoundSummary, FinalSummary
│   │   │   ├── game/           # path logic, swipe handler, animations
│   │   │   ├── net/            # socket client, room client
│   │   │   └── state/          # store (zustand o reducer)
│   └── server/                 # Node + Socket.IO
│       └── src/
│           ├── rooms.ts        # stanza, codice, stato
│           ├── game.ts         # round loop, timer autorevole
│           ├── validate.ts     # validazione parole/percorsi
│           └── index.ts
├── packages/
│   ├── shared/                 # tipi, dadi, logica griglia, scoring (usato da web+server)
│   └── dictionary/             # lista parole + script di build
├── tools/
│   └── gen-dice.mjs            # generatore dadi deterministico
├── SPEC.md
└── README.md
```

**Principio chiave**: tutta la logica deterministica (griglia, adiacenza, punteggio) vive in
`packages/shared` ed è usata **sia dal client sia dal server** → nessuna duplicazione, nessuna divergenza.

---

## 8. Protocollo Socket.IO (v0.1)

**Client → Server**
- `room:create` `{ nickname, gridSize, rounds }` → `{ roomCode, playerId, state }`
- `room:join` `{ roomCode, nickname, playerId? }` → `{ state }`
- `room:start` `{ roomCode }` (solo host)
- `game:submitWord` `{ roomCode, word, path }` → `{ accepted, reason?, points? }`
- `room:leave` `{ roomCode }`

**Server → Client**
- `room:update` `{ players, hostId, gridSize, rounds, phase }`
- `game:roundStart` `{ round, grid, endsAt, durationMs }`
- `game:playerWord` `{ playerId, word, points }` (broadcast per classifica live)
- `game:roundEnd` `{ results, perPlayerWords, nextRoundInMs }`
- `game:gameEnd` `{ finalScores }`
- `error` `{ code, message }`

Timer autorevole: il server emette `endsAt` come timestamp; il client calcola il countdown
locale compensando la latenza. Il server chiude il round a prescindere dal client.

---

## 9. Fuori scope v0.1 (roadmap v0.2+)
- Account, login, profili, storico partite (persistenza)
- Chat in stanza, emoji/reazioni
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
- **Wikizionario** — CC BY-SA 3.0 per le voci sulle abbreviazioni.
- Codice del gioco: da definire (proposta MIT).
