# Boggle-IT

Gioco web in italiano ispirato a Boggle. Single player e multiplayer con codice stanza.
Le parole si compongono **scorrendo il dito sulle lettere** del quadrato.

> **Stato: v0.1** — vedi [`SPEC.md`](./SPEC.md) per la specifica completa.

---

## Caratteristiche v0.1

- **Griglie 4×4, 5×5 e 6×6**, generate da dadi dedicati costruiti sulle frequenze lettere italiane.
- **Round da 3 minuti** con timer autorevole lato server in multiplayer.
- **Swipe/drag** su celle adiacenti (8 direzioni), con undo tornando sulla lettera precedente.
- **Dizionario italiano ampio**: ~387.000 forme, incluse **tutte le coniugazioni verbali**
  e le abbreviazioni da dizionario.
- **Punteggio classico**: 3-4 lettere = 1 pt, 5 = 2, 6 = 3, 7 = 4, 8+ = 5.
  Parole trovate da più giocatori danno **punteggio pieno a tutti**.
- **Single player**: partita multi-round con riepilogo parole trovate e mancate.
- **Multiplayer**: stanza con codice a 6 caratteri, griglia e timer sincronizzati,
  classifica live, riconnessione a partita in corso.
- **Animazioni** con CSS e Web Animations API: pop-in delle celle, trailer luminoso
  sullo swipe, shake su parola non valida, countdown 3-2-1, confetti a fine round.
  Tutte rispettano `prefers-reduced-motion`.

---

## Avvio rapido

```bash
# 1. Dipendenze
pnpm install

# 2. Genera il dizionario (scarica Morph-it! + lessico comune, ~5 MB, una volta sola)
pnpm build:dict

# 3. Avvia client + server in parallelo
pnpm dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

Il client carica il dizionario dal server (compressione Brotli trasparente, ~616 KB).
Se il dizionario non è stato generato, il server usa una mini-lista di fallback per lo sviluppo.

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
| [paroleitaliane](https://github.com/napolux/paroleitaliane) (napolux) | lessico comune | vedi repo |
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
| Avvio (dizionario in memoria) | 168 MB |
| Dopo il primo fine round (trie lazy) | 211 MB |

Il trie del solver è **lazy** e limitato con `TRIE_MAX_WORD_LENGTH` (default 10, ~66 MB;
8 → ~24 MB; senza limite → ~142 MB). Costruito in ~150 ms alla prima fine round.

I deploy sono **riproducibili offline**: `words.br` (616 KB) è versionato, quindi
`pnpm --filter @boggle/dictionary build` rigenera `words.txt` senza rete.

---

## Note tecniche

- **Faccia "Qu"**: nel modello una cella con `letter === 'q'` vale `qu` (Q+U inseparabili),
  come nel Boggle ufficiale. Il solver e la validazione ne tengono conto.
- **Timer autorevole**: il server emette `endsAt` come timestamp; il client calcola il
  countdown locale e il server chiude il round indipendentemente dal client.
- **Swipe**: `Pointer Events` con `touch-action: none`; hit-test sui `getBoundingClientRect`
  delle celle. Il controller è istanziato una sola volta e legge griglia/callback via ref,
  così non si interrompe a metà gesture durante i re-render.
- **Parole duplicate**: punteggio pieno a tutti (scelta esplicita v0.1).

---

## Licenza

Il codice del gioco è da definire (proposta: MIT).
I **dati del dizionario derivati da Morph-it!** restano distribuiti sotto **CC BY-SA 2.0**:
l'attribuzione è mostrata nella home dell'app e va mantenuta in ogni opera derivata.
