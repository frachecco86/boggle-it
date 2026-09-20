# Sbooble

Gioco di parole in italiano (stile Boggle) con il logo di una margherita.
Single player e multiplayer con codice stanza, **app Android** e **profili persistenti**.
Le parole si compongono **scorrendo il dito sulle lettere** del quadrato.

> **Stato: v0.5.3** — la cronologia completa è in [`apps/web/src/version.ts`](apps/web/src/version.ts)
> e nella pagina **Novità** dell'app (numero di versione in alto a destra).
> Specifica completa in [`SPEC.md`](./SPEC.md).

---

## Caratteristiche v0.1

- **Griglie 4×4, 5×5 e 6×6** con composizione controllata (vocali e lettere rare).
- **Round da 3 minuti** con timer autorevole lato server in multiplayer.
- **Swipe/drag** su celle adiacenti (8 direzioni), con undo tornando sulla lettera precedente.
- **Dizionario italiano ampio**: ~387.000 forme, incluse **tutte le coniugazioni verbali**
  e le abbreviazioni da dizionario.
- **Schede pre-calcolate**: ogni partita pesca una **scheda** dal catalogo (480 schede di base,
  40 per ognuna delle 12 combinazioni dimensione × difficoltà). Ogni scheda contiene la griglia
  e **tutte** le parole trovabili, con parole di varia lunghezza (fino a 10-12 lettere su 6×6).
  Niente più griglie improvvisate: partite riproducibili e soluzioni verificate.
- **Parole comuni nei livelli facili**: le schede `molto-facile` e `facile` sono risolte contro
  il **lessico comune** (~60k parole non astruse); `normale` e `difficile` contro il dizionario
  completo, ma solo se contengono almeno una parola lunga.
- **Punteggio Boggle adattato**: **1 punto per una parola di 3 lettere, poi un punto in più per
  ogni lettera** (lunghezza − 2; una parola da 10 lettere vale 8 punti). In multiplayer una
  parola trovata da **un solo giocatore vale doppio**.
- **Catalogo schede in home**: numero totale sempre visibile; **pagina scheda** con la griglia
  e tutte le parole trovabili raggruppate per lunghezza; **pannello admin** con token per
  generarerne di nuove.
- **Profili persistenti** (opzionali): più profili salvati sul dispositivo con switch rapido,
  registrazione/acceso con nickname e password (scrypt, SQLite). Il profilo porta con sé
  avatar, **foto** e **suoni personali**.
- **Foto profilo con filtri** applicati localmente (canvas): cartoon, fumetto, poster, schizzo,
  seppia. La foto originale non lascia il dispositivo: si carica solo il risultato 256×256.
- **Suoni personali delle parole**: registri una clip per 5 fasce di lunghezza (3/4/5/6/7+);
  le senti tu quando trovi una parola. Se non registri nulla, si usa il suono sintetizzato.
- **Musica di sottofondo reale** (non generata): 6 tracce **CC0** incluse nel bundle
  (OpenGameArt). L'host scegle la traccia della stanza; ognuno può sceglere la propria per
  il single player.
- **App Android** (Capacitor): single player, foto e audio funzionano **offline** (schede e
  tracce incluse nell'APK); multiplayer e sincronizzazione profili quando c'è rete.
- **Single player**: partita multi-round con riepilogo parole trovate e mancate.
- **Multiplayer**: stanza con codice a 6 caratteri, griglia e timer sincronizzati,
  classifica live, riconnessione a partita in corso. Le **parole degli avversari restano
  nascoste**: si vede solo un badge "+N" accanto al nome, con un suono discreto.
- **4 difficoltà** (molto facile / facile / normale / difficile) con tema visivo dedicato.
  La difficoltà controlla la composizione della griglia; la dimensione è una scelta separata.
- **Anteprima reale**: il server pesca una scheda di esempio dal catalogo con le impostazioni
  scelte e mostra quante parole si possono trovare (conteggio esatto, non stimato).
- **Avatar**: 32 emoji selezionabili, visibili in classifica e nelle notifiche.
- **Durata del round** selezionabile: 90, 120 o 180 secondi.
- **Audio**: effetti sintetizzati con Web Audio (nessun asset da scaricare), motivi musicali
  crescenti in base alla lunghezza della parola, e musica di sottofondo CC0.
  Tutto disattivabile con volumi separati.
- **Swipe preciso**: riconoscimento a settori angolari + deadzone + isteresi
  (`game/cellTracker.ts`), con interpolazione dei movimenti veloci: le diagonali — anche
  incrociate — non richiedono precisione millimetrica e non "sfarfallano" sul bordo.
- **Animazioni** con CSS e Web Animations API: pop-in delle celle, trailer luminoso sullo swipe,
  flash morbido (niente scuotimento) su parola non valida, countdown, confetti a fine round.
  Tutte rispettano `prefers-reduced-motion`.

---

## Avvio rapido

```bash
# 1. Dipendenze
pnpm install

# 2. Genera il dizionario (una volta sola; le schede base sono già versionate)
pnpm build:dict

# 3. Avvia client + server in parallelo
pnpm dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

Il client **non scarica più il dizionario**: le parole valide arrivano dalle schede
pre-calcolate (JSON) servite dal server, quindi l'avvio è immediato.

### Icone e versione

```bash
node tools/gen-icon.mjs     # rigenera icone Android e web (margherita), senza dipendenze
```

Il numero di versione sta in `apps/web/src/version.ts` insieme alle note di rilascio;
nell'app compare in alto a destra e apre la pagina **Novità**.

### App Android

```bash
# URL del server per il multiplayer (una volta sola)
echo 'VITE_SERVER_URL=https://tuo-server.up.railway.app' > .env

pnpm --filter @boggle/web cap:sync    # builda il web + sincronizza Android
cd apps/web/android && ./gradlew assembleDebug
```

Guida completa (requisiti, firma, store gratuiti): [`docs/ANDROID.md`](docs/ANDROID.md).

### Dati persistenti in produzione

Profili (foto + clip audio) e schede generate dall'admin vivono entrambi in
`DATA_DIR` (default `/app/data`): **un solo volume** basta. Su Railway i volumi
**non sono in Settings** — si creano da `Ctrl+K` → *Volume*, oppure col tasto destro
sul canvas — e serve `RAILWAY_RUN_UID=0`, perché i volumi sono montati come root
mentre il container gira come `node`. Dettagli in [`docs/DEPLOY.md`](docs/DEPLOY.md).

### Schede

Le schede di base sono versionate in `packages/shared/schede/` (480 schede, ~1.4 MB).
Per rigenerarle o aggiungerne:

```bash
pnpm gen:schede                                  # tutte le combinazioni, 40 schede ciascuna
pnpm gen:schede -- --size 4 --difficolta facile --n 60
pnpm gen:schede -- --size 4 --difficolta normale --n 40 --append
```

L'admin può generarne altre a runtime dal pannello `/admin` (richiede `ADMIN_TOKEN`).
Quelle nuove vengono salvate in `packages/shared/schede-extra/` (non versionata).

---

## Comandi

| Comando | Descrizione |
|---|---|
| `pnpm dev` | Client + server in parallelo |
| `pnpm dev:web` / `pnpm dev:server` | Solo client / solo server |
| `pnpm build` | Build di produzione di tutti i pacchetti |
| `pnpm build:dict` | Scarica le fonti e rigenera `words.txt` + `words.br` |
| `pnpm test` | Test unitari (`vitest`) di logica condivisa |
| `pnpm test:e2e` | Smoke test multiplayer (richiede il server attivo) |
| `pnpm check:context` | Verifica che il contesto di build contenga il dizionario |

### Feedback sonoro

| Evento | Suono |
|---|---|
| Parola valida | Motivo crescente: 3→nota, 4→intervallo, 5→arpeggio, 6→accordo, 7+→accordo + sparkle |
| Parola già trovata | Due note discendenti (ambra, non è un errore) |
| Parola non valida | Tono basso filtrato, morbido |
| Parola di un avversario | Ding discreto + badge "+N" accanto al nome |
| `pnpm typecheck` | Type-check di tutti i pacchetti |

### Variabili d'ambiente del server

| Variabile | Default | Descrizione |
|---|---|---|
| `PORT` | `3001` | Porta HTTP/Socket.IO |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Origine CORS consentita |
| `ROUND_DURATION_MS` | `180000` | Durata round (per test/dev) |
| `COUNTDOWN_MS` | `3000` | Countdown iniziale (per test/dev) |
| `ROUND_END_PAUSE_MS` | `10000` | Pausa tra i round |

---

## Architettura

```
boggle-it/
├── apps/
│   ├── web/                  React 18 + Vite + TypeScript
│   │   └── src/
│   │       ├── components/   GridBoard (swipe + trail SVG), Timer, WordList
│   │       ├── screens/      Home, SoloSetup, SoloGame, Lobby, Multiplayer, Summary
│   │       ├── game/         SwipeController (Pointer Events), useSoloGame
│   │       ├── net/          socket client
│   │       └── state/        store zustand + binding eventi Socket.IO
│   └── server/               Node + Express + Socket.IO
│       └── src/
│           ├── rooms.ts      stanza, stato, validazione parole, timer
│           ├── index.ts      eventi Socket.IO, serving dizionario
│           └── dictionary.ts caricamento dizionario + trie
├── packages/
│   ├── shared/               tipi, dadi, griglia, adiacenza, punteggio, solver (trie)
│   └── dictionary/           lista parole + script di build
├── tools/gen-dice.mjs        generatore deterministico dei dadi
└── tests/e2e/                smoke test multiplayer
```

**Principio chiave**: la logica deterministica (griglia, adiacenza, percorso, punteggio)
vive in `packages/shared` ed è usata **sia dal client sia dal server**. Il server ricalcola
sempre: un client manomesso non può inventare parole o percorsi.

---

## Dizionario

| Fonte | Contributo | Licenza |
|---|---|---|
| [Morph-it! 0.48](https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it) (UniBO) | forme flesse, coniugazioni verbali | CC BY-SA 2.0 / LGPL |
| [paroleitaliane](https://github.com/napolux/paroleitaliane) (napolux) | lessico comune | MIT |
| [OpenGameArt](https://opengameart.org) (MintoDog, HydroGene, Bobjt, Wolfgang_, TinyWorlds) | 6 tracce musicali | CC0 1.0 |
| [Google Fonts](https://fonts.google.com) (Baloo 2, Fredoka) | font dell'interfaccia | OFL 1.1 |
| [Wikizionario](https://it.wiktionary.org/wiki/Appendice:Abbreviazioni) | abbreviazioni | CC BY-SA 3.0 |

Pipeline di build (`packages/dictionary/scripts/`):

1. `fetch-sources.mjs` scarica le fonti grezze in `data/` (con retry: il sito UniBO è instabile).
2. `build-words.mjs` normalizza (minuscolo, accenti → vocale base, solo `a-z`, 3-16 lettere),
   unisce le fonti, deduplica, ordina e produce `words.txt` + `words.br`.

Risultato tipico: **386.946 parole**, 4,3 MB raw → **616 KB Brotli** (14%).

---

## Deploy

Guida completa in [`docs/DEPLOY.md`](docs/DEPLOY.md). Due opzioni:

- **Gratis** — frontend + dizionario su **Netlify** (CDN), server Socket.IO su **Railway Free**.
- **Semplice** — monolite su **Railway Hobby** ($5/mese): Express serve anche il frontend.

> Netlify **non può** ospitare il multiplayer: le Functions non supportano WebSocket
> né connessioni persistenti. Ospita solo il frontend statico e il dizionario.

**Memoria del server** (build di produzione, misurata):

| Stato | RSS |
|---|---|
| Avvio (dizionario + catalogo schede in memoria) | ~180 MB |
| Generazione schede dall'admin (trie completo) | picco ~350 MB |

Il trie del **solver non esiste più a runtime**: le parole valide arrivano dalle schede,
quindi il server non costruisce più l'indice da 142 MB. Il pool di generazione viene
allocato **solo se** l'admin genera nuove schede.

I deploy sono **riproducibili offline**: `words.br` (616 KB) è versionato, quindi
`pnpm --filter @boggle/dictionary build` rigenera `words.txt` senza rete.

---

## Note tecniche

- **Faccia "Qu"**: nel modello una cella con `letter === 'q'` vale `qu` (Q+U inseparabili),
  come nel Boggle ufficiale. Il solver e la validazione ne tengono conto.
- **Timer autorevole**: il server emette `endsAt` come timestamp; il client calcola il
  countdown locale e il server chiude il round indipendentemente dal client.
- **Swipe**: `Pointer Events` con `touch-action: none`. Il riconoscimento
  (`game/cellTracker.ts`) parte dall'ultima cella selezionata: guarda la direzione del
  vettore dito→centro, la classifica in 8 settori angolari (diagonali favorite), esige
  una deadzone dal centro e un allineamento minimo, più severo quando cambia direzione
  (isteresi). Ogni passo produce una cella adiacente, quindi il percorso è sempre valido.
  I listener sono sul `window` con `setPointerCapture`: un eventi interrotto non lascia
  il controller "agganciato".
- **Parole duplicate**: il punteggio base va a tutti; il raddoppio spetta a chi trova una
  parola che **nessun altro** ha trovato.

---

## Licenza

Il codice del gioco è da definire (proposta: MIT).
I **dati del dizionario derivati da Morph-it!** restano distribuiti sotto **CC BY-SA 2.0**:
l'attribuzione è mostrata nella home dell'app e va mantenuta in ogni opera derivata.
