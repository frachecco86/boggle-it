# Sbooble

Gioco di parole in italiano (stile Boggle) con il logo di una margherita.
Single player e multiplayer con codice stanza, **app Android** e **profili persistenti**.
Le parole si compongono **scorrendo il dito sulle lettere** del quadrato.

> **Stato: v0.44.0** — la cronologia completa è in [`apps/web/src/version.ts`](apps/web/src/version.ts)
> e nella pagina **Novità** dell'app (numero di versione in alto a destra).
> Specifica completa in [`SPEC.md`](./SPEC.md).

---

## Caratteristiche v0.1

- **Griglie 4×4, 5×5 e 6×6** con composizione controllata (vocali e lettere rare **italiane**: `z`). Le lettere non italiane (`k w x y j`, quasi solo prestiti) non entrano mai in griglia.
- **Round da 3 minuti** con timer autorevole lato server in multiplayer.
- **Swipe/drag** su celle adiacenti (8 direzioni), con undo tornando sulla lettera precedente.
- **Dizionario italiano ampio**: ~372.000 forme, incluse **tutte le coniugazioni verbali**.
  **Ogni voce è giocabile**: è la stessa lista usata dalle schede. Le abbreviazioni e le
  etichette di materia (`idr`, `geogr`, `avv`…) **non** sono nel lessico.
- **Schede pre-calcolate**: ogni partita pesca una **scheda** dal catalogo (270 schede di base:
  10 `standard` + 5 `full criteria` + 15 `ale` per ognuna delle 9 combinazioni dimensione ×
  difficoltà). Ogni scheda contiene la griglia e **tutte** le parole trovabili (accettate in
  partita), con parole di varia lunghezza. Il tipo di scheda si scegle dal pannello admin.
  Niente più griglie improvvisate: partite riproducibili e soluzioni verificate.
- **La difficoltà è il numero di parole trovabili**, non la composizione delle lettere: le bande
  di parole e punteggio sono misurate per dimensione × difficoltà (su 4×4: ~130 / ~60 / ~30
  parole per Facile / Normale / Difficile). Le lettere rare restano più frequenti nei livelli alti,
  ma come mezzo, non come criterio.
- **Punteggio lineare, senza tetto**: **3 lettere → 1 punto, poi +1 per ogni lettera in più**
  (4 → 2, 5 → 3, 6 → 4, 7 → 5, 8 → 6, 10 → 8, 16 → 14). In multiplayer una parola trovata da
  **un solo giocatore vale doppio**. La scala è definita **in un solo punto** (`scoreForLength`
  in `packages/shared/src/scoring.ts`) e da lì la riusano gioco, statistiche e difficoltà ale.
  La scala a soglie del Boggle classico (3-4 → 1 … 8 o più → 11) è stata adottata nella 0.41.0 e
  **abbandonata nella 0.44.0**: da 8 lettere in su non cresce più, quindi una parola da 13
  valeva come una da 8. Confronto misurato delle alternative:
  [`docs/SCALA-PUNTEGGI-ALTERNATIVE.md`](docs/SCALA-PUNTEGGI-ALTERNATIVE.md).
- **Catalogo schede in home**: numero totale sempre visibile; **pannello admin** con token per
  generarne di nuove e per decidere il **tipo di scheda di default** (Standard / Full criteria /
  Ale) valido per tutti i giocatori; la **pagina scheda** con la griglia e tutte le parole
  trovabili si apre dal pannello admin ("Sfoglia le schede").
- **Profili persistenti** (opzionali): più profili salvati sul dispositivo con switch rapido,
  registrazione/acceso con nickname e password (scrypt, SQLite). Il profilo porta con sé
  avatar, **foto** e **suoni personali**.
- **Foto profilo**: si sceglie un'immagine e viene **ritagliata al centro** a 256×256
direttamente nel browser. La foto originale non lascia il dispositivo: si carica solo il
risultato. Niente filtri né stili AI.
- **Suoni personali delle parole**: registri una clip per 5 fasce di lunghezza (3/4/5/6/7+);
  le senti tu quando trovi una parola, e **in multiplayer gli avversari sentono la tua** (a metà
  volume) quando la trovi tu. Se non registri nulla, si usa il suono sintetizzato.
- **Musica di sottofondo reale** (non generata): 6 tracce **CC0** incluse nel bundle
  (OpenGameArt). L'host scegle la traccia della stanza; ognuno può sceglere la propria per
  il single player.
- **App Android** (Capacitor): single player, foto e audio funzionano **offline** (schede e
  tracce incluse nell'APK); multiplayer e sincronizzazione profili quando c'è rete.
- **Pagina Novità leggibile**: ogni versione si apre con una **card di riassunto** in
linguaggio non tecnico (due-tre righe), e grassetti, corsivi e frammenti di codice delle
note sono finalmente formattati; il dettaglio tecnico resta sotto, per chi lo vuole.
- **Home compatta**: logo, testi e pulsanti misurati per stare in **una schermata di
telefono** senza scorrere (niente da cercare sotto il bordo); due soglie di altezza per i
telefoni più bassi.
- **Invito con un link**: in sala d'attesa il tasto **Condividi l'invito** apre il foglio di
condivisione del telefono con il link della stanza (`?stanza=CODICE`); chi lo apre trova il
codice già nel campo “Entra”. Dove la condivisione non c'è, il link si copia negli appunti.
- **Single player**: partita multi-round con riepilogo parole trovate e mancate.
- **Multiplayer**: stanza con codice a 6 caratteri, griglia e timer sincronizzati,
  classifica live, riconnessione a partita in corso. Le **parole degli avversari restano
  nascoste**: si vede solo un badge "+N" accanto al nome, con un suono discreto — la loro
  clip audio personale, se ne hanno registrata una, a metà volume.
- **Si entra anche a partita iniziata** (fino alla fine del **primo round**): chi arriva in
  ritardo apre il link della stanza e si ritrova in gioco, con la griglia in corso e il tempo che
  resta. Nella pausa dopo il round 1 si entra ancora (si gioca dal round successivo); dal round 2
  la stanza è chiusa, perché un round intero di parole e di raddoppi già giocati non si recupera.
- **Riconnessione**: il giocatore viene marcato "offline" e la partita continua; rientrando
  (anche con una **riconnessione automatica** del socket) recupera griglia, timer e punteggio
  senza interrompere la partita.
- **Riepilogo di fine round in stile arcade** (multiplayer): i concorrenti in basso e le
  parole che si accendono una alla volta seguendo la **timeline reale** della partita, con
  punteggio che si accumula fino al totale del round. Saltabile, con suoni dedicati.
- **Podio di fine partita** (multiplayer): i primi tre con avatar, nome e punti, il vincitore
  **al centro** con corona e alone; le pedane salgono a scaglioni e cadono dei coriandoli.
  Con **due giocatori** il vincitore resta al centro (il terzo posto è vuoto); con **più di tre**
  gli altri si elencano subito sotto il podio, con posizione e punti.
- **Voce in stanza** (multiplayer): tasto col **microfono** in basso a destra — si **tiene
  premuto** e si parla, e gli altri sentono la voce **quasi in diretta** (~0,2 s: è una
  conversazione, non un messaggio vocale). Tre barrette accanto al nome mostrano chi sta
  parlando, un secondo tasto **silenzia** il proprio microfono. Nessuna registrazione: il
  server fa solo da ponte e non conserva l'audio.
- **3 difficoltà** (facile / normale / difficile) con tema visivo dedicato.
  La difficoltà controlla la banda di parole/punteggio della scheda; la dimensione è una scelta separata.
- **Classifica separata** fra single player e multiplayer (tab *Da solo* / *Con altri* / *Tutte*),
  con tre classifiche (miglior punteggio, totali, parola più lunga) per ogni modalità.
- **Impostazioni in una schermata**: griglia, difficoltà, durata e round stanno in un **foglio
  sovrapposto** che si apre dalla home — quattro righe compatte e i due pulsanti sempre in vista,
  senza scorrere. Le stesse scelte valgono per la partita singola e per la stanza.
- **Single player a un tocco**: «Gioca da solo» sorteggia la scheda e fa partire il countdown.
  La scheda **non si vede prima del round** (né in home né in sala d'attesa): niente vantaggi.
- **Avatar**: 32 emoji selezionabili, visibili in classifica e nelle notifiche.
- **Durata del round** selezionabile: 90, 120 o 180 secondi.
- **Countdown 3-2-1 a ogni round** (single player e multiplayer), con animazione e suoni.
- **Audio**: effetti sintetizzati con Web Audio (nessun asset da scaricare), motivi musicali
  crescenti in base alla lunghezza della parola, e musica di sottofondo CC0.
  Tutto disattivabile con volumi separati.
- **Swipe preciso**: riconoscimento a settori angolari + deadzone oltre il confine delle
  celle + isteresi (`game/cellTracker.ts`), con interpolazione dei movimenti veloci e
  **accumulo dei micro-movimenti**: le diagonali — anche incrociate — non richiedono
  precisione millimetrica, le celle non si accendono "sfiorando il pixel" e non
  "sfarfallano" sul bordo.
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

**Regola:** ogni commit porta la versione **almeno +0.1** (minor avanti di uno:
`0.41.0` → `0.42.0`) e aggiunge la sua voce in `RELEASES`: niente numero senza
changelog. Il controllo è `pnpm check:version` (confronta con `origin/master`;
con `--base <ref>` si confronta con un altro riferimento).

### App Android

```bash
# URL del server per il multiplayer (una volta sola)
echo 'VITE_SERVER_URL=https://tuo-server.up.railway.app' > .env

./tools/build-apk.sh     # build web + cap sync + gradle → APK debug (~14.6 MB)
```

Verificato: APK firmato e installabile, compilato senza Android Studio
(JDK 21 + command-line tools, nessun root).

Guida completa (requisiti, firma, store gratuiti): [`docs/ANDROID.md`](docs/ANDROID.md).

### Dati persistenti in produzione

Profili (foto + clip audio) e schede generate dall'admin vivono entrambi in
`DATA_DIR` (default `/app/data`): **un solo volume** basta. Su Railway i volumi
**non sono in Settings** — si creano da `Ctrl+K` → *Volume*, oppure col tasto destro
sul canvas — e serve `RAILWAY_RUN_UID=0`, perché i volumi sono montati come root
mentre il container gira come `node`. Dettagli in [`docs/DEPLOY.md`](docs/DEPLOY.md).

### Schede

Le schede di base sono versionate in `packages/shared/schede/` (270 schede, ~700 KB).
Per rigenerarle o aggiungerne:

```bash
pnpm gen:schede                                   # 10 schede standard per combinazione
pnpm gen:schede -- --variant full --n 5 --append   # 5 schede "full criteria"
pnpm gen:schede -- --size 4 --difficolta facile --n 60
pnpm gen:schede:ale -- --replace                   # schede "ale" (4×4, 5×5, 6×6)
```

Le schede generate con i **criteri completi** portano `variant: "full"` e l’etichetta **FULL**
nella pagina "Sfoglia le schede" (dove si possono anche filtrare).

Come funzionano i tre algoritmi (con criteri e numeri misurati): **[`docs/algoritmi/`](docs/algoritmi/README.md)**.

L'admin può generarne altre a runtime dal pannello `/admin` (richiede `ADMIN_TOKEN`), comprese
le **ale**: il pannello ha il pulsante "Genera" per ogni variante e può **cancellare** le schede
per ambito (solo quelle aggiunte, solo le ale, per variante o tutte).
Quelle nuove vengono salvate in `DATA_DIR/schede-extra/` (standard/full) e `DATA_DIR/schede-ale/`
(ale) — entrambe non versionate e dentro il volume persistente.

Le ale a runtime **restano ferme alla calibrazione del giorno in cui sono state create**:
dopo un cambio di calibrazione o della scala punteggi vanno svuotate e rigenerate con il codice
deployato — `node tools/rigenera-ale-server.mjs` (dry-run di default) e la procedura in
**[`docs/ALE-RUNTIME-SERVER.md`](docs/ALE-RUNTIME-SERVER.md)**.

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
| `pnpm check:schede` | **Sola diagnosi**: le schede versionate sono allineate al dizionario? (esce 1 se c'è deriva; non scrive nulla) |
| `pnpm check:version` | Verifica che la versione sia avanzata di almeno 0.1 e abbia la sua voce |

### Feedback sonoro

| Evento | Suono |
|---|---|
| Parola valida | Motivo crescente: 3→nota, 4→intervallo, 5→arpeggio, 6→accordo, 7+→accordo + sparkle |
| Parola già trovata | Due note discendenti (ambra, non è un errore) |
| Parola non valida | Tono basso filtrato, morbido |
| Parola di un avversario | Ding discreto + badge "+N" accanto al nome |
| Ultimi 10 secondi | Campanello per ogni secondo, con tono e volume crescenti |
| Countdown di inizio round | Tick crescente per 3-2-1, accordo ascendente per "VIA!" |
| Replay di fine round | Click per ogni parola che si accende, accordo finale |
| `pnpm typecheck` | Type-check di tutti i pacchetti |

### Variabili d'ambiente del server

| Variabile | Default | Descrizione |
|---|---|---|
| `PORT` | `3001` | Porta HTTP/Socket.IO |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Origini CORS consentite (separate da virgola, `*` per tutte). L'app Android è **sempre** consentita, vedi `ALLOW_CAPACITOR` |
| `ALLOW_CAPACITOR` | `1` | Accetta le origini del WebView dell'app (`https://localhost`, `capacitor://localhost`). Metti `0` solo servendo il WebView da un dominio reale |
| `ROUND_DURATION_MS` | `180000` | Durata round (per test/dev) |
| `COUNTDOWN_MS` | `3000` | Countdown iniziale (per test/dev) |
| `ROUND_END_PAUSE_MS` | `10000` | Pausa tra i round |
| `DATA_DIR` | `data/` | Volume persistente (DB, schede admin, musica, config) |
| `SCHEDE_EXTRA_DIR` | `<DATA_DIR>/schede-extra` | Schede standard/full generate dall'admin |
| `SCHEDE_ALE_DIR` | `<DATA_DIR>/schede-ale` | Schede ale generate dall'admin |
| `APP_CONFIG_FILE` | `<DATA_DIR>/app-config.json` | Tipo di scheda di default |

---

## Architettura

```
sbooble/
├── apps/
│   ├── web/                  React 18 + Vite + TypeScript
│   │   └── src/
│   │       ├── components/   GridBoard (swipe + trail SVG), Timer, WordList,
│   │       │                 MatchSettings (foglio impostazioni), Podium
│   │       ├── screens/      Home, SoloGame, Lobby, Multiplayer, Summary
│   │       ├── game/         SwipeController (Pointer Events), useSoloGame
│   │       ├── net/          socket client, link d'invito della stanza
│   │       └── state/        store zustand + binding eventi Socket.IO
│   └── server/               Node + Express + Socket.IO
│       └── src/
│           ├── rooms.ts      stanza, stato, validazione parole, timer
│           ├── index.ts      eventi Socket.IO, serving dizionario
│           └── dictionary.ts caricamento dizionario + trie
├── packages/
│   ├── shared/               tipi, griglia, adiacenza, punteggio, solver (trie),
│   │                         generazione e validazione schede (standard/full/ale)
│   └── dictionary/           lista parole + script di build
├── tools/                    gen-icon, gen-technical-words, gen-consonant-endings,
│                             rigenera-ale-server, build-apk, check-version, check-context
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
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (hermitdave) | fasce di frequenza d'uso (5k/20k/60k) per la difficoltà | CC BY-SA 4.0 |
| [OpenGameArt](https://opengameart.org) (MintoDog, HydroGene, Bobjt, Wolfgang_, TinyWorlds) | 6 tracce musicali | CC0 1.0 |
| [Google Fonts](https://fonts.google.com) (Baloo 2, Fredoka) | font dell'interfaccia | OFL 1.1 |
| [Wikizionario](https://it.wiktionary.org/wiki/Appendice:Abbreviazioni) | headword e categorie grammaticali | CC BY-SA 4.0 |

Pipeline di build (`packages/dictionary/scripts/`):

1. `fetch-sources.mjs` scarica le fonti grezze in `data/` (con retry: il sito UniBO è instabile).
2. `build-words.mjs` normalizza (minuscolo, accenti → vocale base, solo `a-z`, 3-16 lettere),
   unisce le fonti, deduplica, ordina e produce `words.txt` + `words.br`.
3. `build-frequency.mjs` ritaglia dalla lista di frequenza le prime 60.000 parole **giocabili**
   e scrive `frequency-it.txt` (versionato): sono le fasce usate dal generatore delle schede.
4. `build-words.mjs` legge anche **`technical-words.txt`**, la whitelist che riammette i
   tecnicismi scartati dal filtro di attestazione (vedi sotto).

**Nota (branch `ale-full`):** NVdB/Morph-it restano fonti del **dizionario principale**
(forme flesse), ma non entrano più nella pipeline delle schede **ale**, che misura la rarità
con le fasce di frequenza d'uso di `frequency-it.txt` (top-5000 / top-20000 / oltre).
La vecchia pipeline a lemmi (`lemmas.br`, `nvdb.words.txt`) è conservata solo come storico.

Risultato tipico: **372.439 parole**, 4,2 MB raw → **626 KB Brotli** (15%).

### Perché una whitelist di parole tecniche

Le liste pubbliche contengono anche rumore (`acta`, `agfa`, `baili`, `savere`): una voce della
lista piatta dei 280k entra nel dizionario solo se è **attestata come voce autonoma di
Wikizionario**. Il filtro però scarta ~80.000 voci, e fra queste ci sono parole italiane vere —
Wikizionario copre male botanica, zoologia, geologia, derivati regolari. `setosa` (da `seta`),
`absidale`, `accelerometrico`, `mucillaginoso` erano componibili sulla griglia e venivano
**rifiutate in partita**.

`technical-words.txt` le riammette scavalcando il filtro, con due prove indipendenti:
**derivazione regolare** da una base già attestata nel lessico *e* presenza nella lista dei 280k,
più la **regola del paradigma** (almeno 2 forme attestate, che elimina i falsi positivi come il
gerundio con clitico `abbarbicandosi` = `abbarbicand` + `osi`). Il file è **generato** da
`tools/gen-technical-words.mjs` (idempotente) e integrabile a mano da
`technical-words.curated.txt` — stesso schema di `consonant-endings.txt`.

> **Cosa NON c'è nel dizionario.** Nessuna whitelist copre tutto: restano fuori i tecnicismi la
> cui base non è nel lessico (`abiotico` = `a-` + `biotico`), le locuzioni multi-parola
> (`ferro da stiro`) e le forme con clitici (`dammelo`), che per un gioco di parole non sono
> componibili. Il conteggio non va confrontato con le stime «2 milioni di parole» dell'italiano:
> quelle contano i lessemi per tutte le loro forme flesse, clitici e polirematiche inclusi.

### ⚠️ Cambiare il dizionario richiede di riallineare le schede

Le schede pre-calcolate contengono gli elenchi delle soluzioni già risolti (`allWords`), e in
single player il client valida le parole **contro la scheda**, non contro il dizionario. Quindi
dopo ogni modifica al lessico:

```bash
pnpm --filter @boggle/dictionary build:full   # o `build`, se offline
pnpm sync:schede                              # riallinea words/allWords (--check per la sola diagnosi)
node apps/web/scripts/copy-schede.mjs         # aggiorna il bundle offline dell'app
pnpm --filter @boggle/server verify:schede    # controlla i criteri di qualità
```

`pnpm sync:schede` ricalcola gli elenchi con la **stessa pipeline del generatore** e non tocca le
griglie: le schede `ale` usano il proprio trie (`Dict'`, 16 lettere), le altre il pool classico
(14 lettere, con il filtro sulle consonanti finali). Senza questo passaggio il gioco rifiuta
parole che il server accetta: era il caso di **168 schede su 270**, ed è ancora il caso della
0.47.0: **101 schede su 270** disallineate, **+315 parole accettate** (`ierica`, `torica`,
`sudorale`, `cine`, `cotale`…).

Prima di riallineare, **ricostruire il dizionario**: `words.txt` è generato e può essere vecchio
(su una macchina era fermo a 368.100 forme contro le 372.439 di `words.br`). Se si fa `sync:schede`
con il dizionario vecchio, la deriva viene **congelata nel commit** invece di essere corretta.

> ## ⚠️ `sync:schede` NON tocca le schede generate dall'amministratore
>
> Le schede create dal pannello admin vivono **nel volume** (`schede-ale/`, `schede-extra/`),
> **non sono in git e non si riallineano da sole**: restano risolte sul dizionario del giorno in
> cui sono state generate. Dopo un cambio di dizionario vanno **svuotate e rigenerate** dal
> pannello admin (elimina + Genera) o con `node tools/rigenera-ale-server.mjs` — procedura in
> **[`docs/ALE-RUNTIME-SERVER.md`](docs/ALE-RUNTIME-SERVER.md)**. È il motivo per cui una scheda
> ale già in produzione continua a rifiutare `setosa` anche dopo la 0.47.0.
>
> **Nessun hook lo fa in automatico, né in build né in deploy**: rigenerare le ale costa ~450 MB
> di picco e alcuni minuti, e il dizionario deployato è sempre lo stesso perché arriva da
> `words.br` versionato. Il momento giusto è **quando cambia il dizionario**, non a ogni rilascio.
> `pnpm check:schede` (sola diagnosi, esce 1) esiste per non dimenticarsene.

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
| Avvio (dizionario + catalogo schede in memoria) | ~230 MB |
| Generazione schede standard/full dall'admin (trie completo) | picco ~350 MB |
| Generazione schede **ale** dall'admin (trie 16 lettere + anelli di frequenza) | picco ~450 MB, rilasciato subito dopo |

Il trie del **solver non esiste più a runtime**: le parole valide arrivano dalle schede,
quindi il server non costruisce più l'indice da 142 MB. Il pool di generazione delle schede
classiche e gli ingressi dell'algoritmo **ale** vengono allocati **solo** quando l'admin
genera. Quelli delle ale vengono **rilasciati** a fine richiesta, così il picco non resta.

I deploy sono **riproducibili offline**: `words.br` (626 KB) è versionato, quindi
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
  una **deadzone oltre il confine fra le celle** (una cella si accende solo quando il dito
  è entrato davvero in quella vicina) e un allineamento minimo, più severo quando cambia
  direzione. L'**undo richiede un movimento indietro più deciso dell'attivazione**
  (isteresi: accendere è facile, spegnere no) e i **micro-movimenti si accumulano** invece
  di essere valutati uno per uno, così un tremolio sul bordo non fa sfarfallare le lettere.
  Ogni passo produce una cella adiacente, quindi il percorso è sempre valido.
  I listener sono sul `window` con `setPointerCapture`: un evento interrotto non lascia
  il controller "agganciato".
- **Parole duplicate**: il punteggio base va a tutti; il raddoppio spetta a chi trova una
  parola che **nessun altro** ha trovato.

---

## Licenza

Il codice del gioco è da definire (proposta: MIT).
I **dati del dizionario derivati da Morph-it!** restano distribuiti sotto **CC BY-SA 2.0**:
l'attribuzione è mostrata nella home dell'app e va mantenuta in ogni opera derivata.

### Verifica delle schede

I criteri di qualità delle schede (lessico, quantità, lunghezza, rarità, banda di
punteggio) vivono in `packages/shared/src/schedaGen.ts`. Per controllare che le
schede generate li rispettino:

```bash
pnpm --filter @boggle/server verify:schede                    # schede su disco
pnpm --filter @boggle/server verify:schede -- --measure 200   # 200 griglie fresche
pnpm --filter @boggle/server verify:schede -- --verbose       # dettaglio violazioni
pnpm --filter @boggle/server verify:schede -- --size 5 --difficolta facile
```

Esce con codice 1 se trova violazioni, quindi è utilizzabile in CI. Se una soglia
è troppo stretta, si regola in `schedaGen.ts` e si rigenera con
`pnpm gen:schede -- --n 50`.
