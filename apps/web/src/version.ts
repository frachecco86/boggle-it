/**
 * Versioni dell'app e note di rilascio.
 *
 * Ogni release ha un numero (`0.x.y`) e le funzionalità introdotte, descritte in
 * linguaggio tecnico ma leggibile dall'utente: cosa è cambiato e perché.
 *
 * Convenzione (SemVer adattato):
 *  - **major** `1.x`: stabile per il pubblico.
 *  - **minor** `x.N`: nuove funzionalità retro-compatibili.
 *  - **patch** `x.y.N`: correzioni e rifiniture.
 */

export const APP_VERSION = '0.11.0';

export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  /** Sezioni: tipo di modifica → elenco di voci. */
  changes: Array<{
    kind: 'feature' | 'improvement' | 'fix' | 'tech';
    items: string[];
  }>;
}

/**
 * Cronologia delle versioni, dalla più recente.
 * Le voci tecniche (tipo `tech`) spiegano le scelte di implementazione.
 */
export const RELEASES: ReleaseEntry[] = [
  {
    version: '0.11.0',
    date: '2026-09-20',
    title: 'Punteggi premiati per le parole lunghe, countdown e trail allineato',
    changes: [
      {
        kind: 'fix',
        items: [
          '**Punteggio corretto**: le parole lunghe valgono finalmente quanto meritano. Prima la formula era piatta (1 punto ogni 3 lettere) e una parola da 9 lettere valeva **3 punti**, come tre parole da 3. Ora si usa la regola classica del Boggle, **lunghezza − 2**: 3→1, 5→3, 7→5, **9→7**, 10→8. Su una scheda 5×5 il punteggio massimo passa da 155 a **328 punti**.',
          '**Trail dello swipe allineato**: la scia luminosa era spostata di ~13px rispetto alle lettere. L\'errore si notava sulle diagonali verso **sinistra**, dove lo scostamento è perpendicolare alla linea, e quasi per niente su quelle verso destra, dove corre lungo la linea. Ora il disegno usa lo stesso sistema di coordinate delle celle.',
        ],
      },
      {
        kind: 'feature',
        items: [
          '**Countdown di inizio round** con animazione e suoni: ogni numero compare con uno scatto, un anello si riempie e un tick sonoro accompagna 3-2-1, poi un accordo ascendente per **VIA!**. C\'è anche in single player, dove prima si partiva subito.',
          '**Pannello Regole e punteggi** prima della partita: spiega come si gioca e mostra le fasce di punteggio reali, derivate dal codice (non scritte a mano, così non possono divergere). In multiplayer include la regola del **raddoppio** per le parole trovate da un solo giocatore.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'La formula del punteggio è ora **centralizzata**: una copia hardcoded in un endpoint è stata eliminata. Era lo stesso tipo di problema già visto con la validazione delle difficoltà: due copie che possono divergere.',
          'Le regole nel pannello sono generate da `scoreForWord`, quindi se la formula cambia, il testo si aggiorna da solo.',
        ],
      },
    ],
  },

  {
    version: '0.10.1',
    date: '2026-09-20',
    title: 'L\'anteprima non rivela più la parola più lunga',
    changes: [
      {
        kind: 'fix',
        items: [
          'Nell\'anteprima della scheda la **parola più lunga** non viene più mostrata: sapere che la soluzione è `BOSCAIOLI` la regalava. Ora si vede solo il **numero di lettere** ("parola più lunga: 9 lettere"), così sai cosa aspettarti senza ricevere la risposta.',
          'La correzione è anche **lato server**: la parola non è più nella risposta dell\'API. Mostrarla solo meno nella UI non bastava — chiunque può leggere la risposta dalla console del browser.',
        ],
      },
    ],
  },

  {
    version: '0.10.0',
    date: '2026-09-20',
    title: 'Anteprima della scheda con statistiche, record e filtro parole',
    changes: [
      {
        kind: 'feature',
        items: [
          '**Anteprima della scheda** prima di giocare: vedi la griglia reale e cosa aspettarti — quante parole, quante per ogni lunghezza (con barre), il **punteggio massimo** realizzabile e il **record** su quella scheda con chi lo detiene.',
          'Pulsante **"🎲 Cambia scheda"**: se una scheda non ti convince, ne peschi un\'altra prima di iniziare.',
          'L\'anteprima funziona anche in **multiplayer**: l\'host sceglie la scheda in lobby, tutti la vedono (griglia e statistiche) e si gioca quella. Nessuno è sorpreso.',
          'Nel catalogo **Parole** c\'è ora il filtro **"Solo le parole della scheda in corso"**: sai subito se una parola vale nella partita che stai giocando.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Corretto un problema per cui le schede generate dall\'admin potevano **sparire al riavvio**: venivano aggiunte in memoria PRIMA di essere scritte su disco, quindi se la scrittura falliva la scheda restava solo in memoria. Ora si scrive prima su disco.',
          'Corretto l\'errore poco chiaro quando la scrittura fallisce: ora dice esplicitamente se è un problema di permessi e cosa controllare.',
          'La generazione di più schede scriveva il file **60 volte tanto** (49 MB invece di 0,8 MB per 100 schede): ora scrive in blocco.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Chiarita la confusione sul numero accanto alle parole: indica **in quante schede** appare la parola, non se vale in quella in corso. Il filtro risolve il dubbio.',
          'Nuovo endpoint `GET /schede/:id/stats` con statistiche, punteggio massimo e record. Il record usa `scheda_id`, già salvato nel database.',
        ],
      },
    ],
  },

  {
    version: '0.9.1',
    date: '2026-09-20',
    title: 'Admin con utente e password, generazione schede dall\'app',
    changes: [
      {
        kind: 'feature',
        items: [
          'Il pannello **Admin** ora si apre con **utente e password** invece di un token. Da lì si generano nuove schede (dimensione, difficoltà, quante) senza toccare il codice: finiscono subito nel catalogo, per tutti.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le credenziali stanno in **variabili d\'ambiente** (`ADMIN_USER`, `ADMIN_PASSWORD`), non nel codice: il repository è pubblico e una password scritta nel sorgente sarebbe leggibile da chiunque.',
          'La password viaggia **una volta sola**: il login restituisce un token di sessione valido 12 ore, che viene usato per le richieste successive. Il confronto è a **tempo costante**, per non rivelare la password dai tempi di risposta.',
          'Le schede generate vengono salvate nella cartella `data/schede-extra/` (sul volume): **sopravvivono ai riavvii** e si sommano a quelle incluse nel repo.',
          'Se `ADMIN_USER`/`ADMIN_PASSWORD` non sono impostati, le rotte admin rispondono **503**: meglio un admin disabilitato che uno aperto per dimenticanza. Il vecchio `ADMIN_TOKEN` resta accettato.',
        ],
      },
    ],
  },

  {
    version: '0.9.0',
    date: '2026-09-20',
    title: 'Estremo, 5 livelli, punteggio rinnovato e sfida a 2',
    changes: [
      {
        kind: 'feature',
        items: [
          'Nuovo livello **Estremo**: pochissime vocali e molte consonanti rare, per chi vuole il massimo. Cinque livelli in tutto: molto facile, facile, normale, difficile, estremo.',
          '**Sfida a 2**: in lobby l\'host sceglie il numero massimo di giocatori (2, 4 o 8). Con 2 il terzo giocatore viene rifiutato con "stanza piena".',
          'Ogni scheda ora contiene **una parola per ogni lunghezza**: 4×4 → 5-7 lettere, 5×5 → 5-9, 6×6 → 5-10. Le schede 6×6 arrivano a 12 lettere.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Punteggio**: 1 punto ogni 3 lettere (prima era lunghezza − 2). 3-5 lettere = 1 punto, 6-8 = 2, 9-11 = 3, 12+ = 4.',
          'Le schede usano il **dizionario completo** (387k forme) invece del lessico comune: parole comunissime come `vota`, `votare`, `cliccare`, `condividere` non erano componibili perché mancavano dal lessico ridotto.',
          'Escluse le **parole funzionali** (articoli, preposizioni, congiunzioni): non ha senso trovare `il` o `nel` in una griglia.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Corretto un bug per cui il livello **Estremo** veniva rifiutato e la partita partiva come "normale": il server aveva una copia locale della validazione con l\'elenco hardcoded, che non era stata aggiornata. Ora usa la funzione condivisa.',
          'Corretto un bug per cui le parole funzionali nella lista bianca (`con`, `col`) entravano comunque nelle schede: la lista veniva aggiunta dopo il filtro.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Schede: 360 totali (24 per ognuna delle 15 combinazioni dimensione × difficoltà).',
          'Filtro dei troncamenti verificato: 0 parole funzionali residue su 73.000 parole, 0 schede fuori dai requisiti di lunghezza.',
        ],
      },
    ],
  },

  {
    version: '0.8.0',
    date: '2026-09-20',
    title: 'Catalogo delle parole e filtro dei troncamenti corretto',
    changes: [
      {
        kind: 'feature',
        items: [
          'Nuova voce **Parole** nella barra in alto: tutte le parole componibili, con quante volte compaiono nelle schede. Ordinabili per **occorrenze**, **lunghezza** o **alfabetico**, con ricerca e filtri per dimensione e difficoltà.',
          'Grafico della **distribuzione per lunghezza**: cliccando una barra si filtra per quella lunghezza.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Corretto il filtro che scartava parole valide: `tic`, `con`, `far`, `mar`, `sol`, `bar`, `film`, `gol` non erano più accettate perché finiscono in consonante. Ora la lista delle finali ammesse è **1068 voci** invece di 171, generata dal **lemma** di Morph-it (criterio linguistico) invece che da una lista a mano.',
          'Escluse le **parole funzionali** (`il`, `in`, `del`, `nel`, `non`): non ha senso "trovare" un articolo in una griglia.',
          'Esclusi versi (`ahhh`), sigle (`btp`, `ccd`), interiezioni (`boh`) e composti giornalistici (`antibush`, `anticlinton`).',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le schede scendono da 1200 a **300** (25 per ognuna delle 12 combinazioni): file da 2,6 MB a 752 KB.',
          'Il filtro usa il **lemma di Morph-it** per distinguere un troncamento (`andar` → `andare`) da una parola autonoma (`tic` → `tic`). Morph-it è in **ISO-8859-1**, non UTF-8: letto male, `normalità` sembrava un troncamento.',
          'Le parole della lista bianca ora entrano anche nel **lessico comune**: prima `tic` o `bar`, assenti dal file dei 60k, restavano non componibili anche dopo la correzione.',
          'Corretto `SchedaCatalog.list()`: filtrava solo con dimensione E difficoltà insieme, quindi un filtro singolo veniva ignorato.',
        ],
      },
    ],
  },

  {
    version: '0.7.0',
    date: '2026-09-20',
    title: 'Classifica e statistiche dei giocatori',
    changes: [
      {
        kind: 'feature',
        items: [
          '**Classifica** raggiungibile dalla barra in alto (🏆): tre classifiche per **miglior punteggio**, **punteggio totale** e **parola più lunga**. Filtri per dimensione della griglia, difficoltà e periodo (sempre, 30 giorni, 7 giorni).',
          'Le **tue statistiche** in cima alla classifica: miglior punteggio, partite giocate, media punti, posizione globale e la tua parola più lunga. La tua riga in classifica è evidenziata.',
          'Ogni partita conclusa entra in classifica automaticamente, con il profilo attivo.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le partite vengono salvate in una tabella **games** nel database SQLite già esistente, con **snapshot** di nome e avatar: se un profilo cambia nome, la classifica resta leggibile.',
          'Classifica **pubblica** (si vede anche senza profilo), registrazione della partita **autenticata**: il profilo lo decide il server dal token, mai il client.',
          'Il punteggio arriva dal client (in single player il server non conosce la griglia giocata), quindi vengono applicati limiti di plausibilità e salvati i dati per la verifica a posteriori.',
          'Registrazione **best effort**: se il server non è raggiungibile la partita si gioca normalmente, semplicemente non entra in classifica.',
        ],
      },
    ],
  },

  {
    version: '0.6.0',
    date: '2026-09-20',
    title: 'Foto profilo con veri effetti AI (cartoon anime)',
    changes: [
      {
        kind: 'feature',
        items: [
          'Effetti AI per la foto profilo con **AnimeGANv2**, una vera rete neurale di style transfer eseguita nel browser (onnxruntime-web + WebAssembly): tre stili, Hayao (ispirato a Miyazaki), Shinkai e Paprika. Ridisegna il volto in stile anime invece di scurire i contorni come facevano i filtri grafici.',
          'I filtri rapidi in canvas restano disponibili accanto agli stili AI, per chi vuole un effetto immediato senza scaricare nulla.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Niente API cloud: la foto non lascia il dispositivo, non c\'è costo per immagine e la funzione lavora offline dopo il primo uso (utile nell\'app Android).',
          'I pesi (8.25 MB per stile) e il runtime WASM si scaricano al primo uso e restano in cache: l\'app resta leggera (bundle iniziale +295 KB) e le volte successive sono offline.',
          'Avanzamento visibile durante il download del modello e durante l\'elaborazione.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il runtime WASM è servito da CDN con `wasmPaths`: onnxruntime-web espone più varianti (base/JSEP/asyncify/JSPI) e Vite le copiava TUTTE (~80 MB). Un plugin di build le rimuove: nel bundle non resta nessun `.wasm`.',
          'Modello ONNX con input NHWC `[1,H,W,3]` in [-1,1] e output tanh: ~250 ms a 256×256 su CPU (3.4 s su telefono).',
          'La firma "un gioco di Margherita Checco" compare sotto il titolo in home.',
        ],
      },
    ],
  },
  {
    version: '0.5.3',
    date: '2026-09-20',
    title: 'Profili al sicuro: chiusura pulita del database',
    changes: [
      {
        kind: 'fix',
        items: [
          'SQLite gira in modalità WAL: le scritture recenti restano in `boggle.db-wal` finché non avviene un checkpoint. Il server non chiudeva mai il database, quindi `boggle.db` poteva restare QUASI VUOTO (4 KB, senza nemmeno la tabella) e un backup del solo file principale perdeva tutti i profili.',
          'Ora il server intercetta `SIGTERM`/`SIGINT` (come fa un redeploy) ed esegue `PRAGMA wal_checkpoint(TRUNCATE)` prima di chiudere: `boggle.db` resta autosufficiente.',
        ],
      },
      {
        kind: 'feature',
        items: [
          'Diagnostica e backup del database per l\'admin: `GET /admin/db` mostra profili e byte di `.db`/`-wal`; `POST /admin/db/checkpoint` forza il consolidamento prima di copiare il volume.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il profilo è persistito su SQLite lato server (tabella `profiles`): la persistenza tra dispositivi e redeploy è già garantita da volume + database.',
          'Test di persistenza: riapertura del solo file `.db`, assenza del `-wal` dopo la chiusura, più cicli di scrittura/riapertura, risorse (foto e clip) conservate.',
        ],
      },
    ],
  },
  {
    version: '0.5.2',
    date: '2026-09-20',
    title: 'Le clip audio si sentono e sopravvivono al reload',
    changes: [
      {
        kind: 'fix',
        items: [
          'Il pulsante ▶ non produceva audio: l\'endpoint delle clip è privato e un tag `<audio>` NON invia l\'header `Authorization`, quindi il server rispondeva 401 in silenzio. Le clip ora sono scaricate come blob autenticati (fetch + `URL.createObjectURL`).',
          'Le clip sparivano ricaricando la pagina: il profilo attivo non veniva idratato all\'avvio, quindi `sfxUrls` restava vuoto e il motore audio non riceveva le clip. Ora l\'app le ricarica automaticamente al boot.',
          'Cambiando profilo le clip del precedente restavano attive: ora vengono revocate (blob) e rimosse dal motore audio.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Con la rete assente l\'idratazione fallisce senza rompere nulla: resta il suono sintetizzato e la riga compare come "predefinito".',
          'Verificato decodificando il blob con `decodeAudioData`: clip valida a 0.66 s / 44.1 kHz, riproduzione confermata (currentTime avanzato).',
        ],
      },
    ],
  },
  {
    version: '0.5.1',
    date: '2026-09-20',
    title: 'Registrazione audio funzionante, volume unico, Docker su Railway',
    changes: [
      {
        kind: 'fix',
        items: [
          'Registrazione audio: `MediaRecorder` produce data URL come `data:audio/webm;codecs=opus;base64,...`, ma il server accettava solo `data:<mime>;base64,` e RIFIUTAVA ogni clip. Ora i parametri opzionali sono ammessi e i messaggi d\'errore mostrano la causa reale invece del generico "registrazione non riuscita".',
          '`Dockerfile`: rimosso `VOLUME`, che Railway rifiuta ("docker VOLUME is not supported"). Il volume si configura dalla piattaforma.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Le schede generate dall\'admin vivono in `DATA_DIR/schede-extra`: un solo volume copre profili e schede, perché i PaaS consentono un volume per servizio.',
          'Le schede del bundle offline vivono in `/bundled-schede`: con lo stesso nome dell\'API `/schede` la rotta JSON veniva catturata da un redirect 301.',
          'Mount statico e fallback SPA spostati dopo TUTTE le rotte API.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Su Railway serve `RAILWAY_RUN_UID=0`: i volumi sono montati come root mentre il container gira come `node`, quindi il database non sarebbe scrivibile.',
          'I volumi non sono in Settings: si creano con `Ctrl+K` → Volume, oppure col tasto destro sul canvas.',
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-09-20',
    title: 'Sbooble: profili, audio personale e app Android',
    changes: [
      {
        kind: 'feature',
        items: [
          'Profili persistenti su SQLite (`node:sqlite`, nessuna dipendenza nativa): registrazione e accesso con nickname + password, hash `scrypt` con salt per utente e confronto `timingSafeEqual`.',
          'Più profili per dispositivo con switch rapido: si conserva il token di sessione, non la password. I token stanno in `localStorage` (per-origine).',
          'Foto profilo con 6 filtri applicati in canvas (posterize + Sobel per i contorni): cartoon, fumetto, poster, schizzo, seppia. L\'originale non viene mai caricato: si invia solo il JPEG 256×256 (~20 KB).',
          'Suoni personali per 5 fasce di lunghezza parola (3/4/5/6/7+): registrazione con `MediaRecorder` (Opus/WebM), ~12 KB per clip. Le clip sono private: ognuno sente le proprie.',
          'Musica di sottofondo reale e royalty-free: 6 tracce CC0 (OpenGameArt) incluse nel bundle. L\'host scegle la traccia per tutta la stanza (`room:config.musicId`).',
          'App Android con Capacitor 8: web e schede inclusi nell\'APK, quindi single player, foto e audio funzionano offline. Multiplayer e sincronizzazione profili quando c\'è rete.',
          'Rebranding: nome Sbooble, logo margherita (icone Android adaptive generate con encoder PNG in Node, senza librerie native) e font Baloo 2 + Fredoka self-hostati.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Foto e clip audio sono BLOB nel database: backup con un solo file, nessun object storage.',
          '`node:sqlite` caricato via `createRequire` per non rompere la risoluzione di Vite/Vitest.',
          'Embed PNG scritto a mano con `zlib`: le icone si rigenerano con `node tools/gen-icon.mjs` senza dipendenze.',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-09-20',
    title: 'Schede pre-calcolate, punteggio Boggle e admin',
    changes: [
      {
        kind: 'feature',
        items: [
          '480 schede pre-generate (40 per ognuna delle 12 combinazioni 4×4/5×5/6×6 × 4 difficoltà), versionate in `packages/shared/schede/`. Ogni scheda contiene la griglia e TUTTE le parole trovabili.',
          'Filtro di qualità in generazione: almeno una parola lunga (≥ 7), numero minimo di parole, e risoluzione contro il lessico comune per i livelli facili.',
          'Punteggio Boggle lineare: `lunghezza − 2` (3 lettere = 1, 10 = 8). Niente tetto a 8 lettere.',
          'Raddoppio in multiplayer per una parola trovata da un solo giocatore, calcolato a fine round.',
          'Pannello admin con token (`ADMIN_TOKEN`) per generare e persistere nuove schede in `schede-extra/`.',
          'Pagina scheda pubblica: griglia + tutte le parole per lunghezza e punti.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Swipe riscritto: settori angolari + deadzone + isteresi al posto del "centro più vicino", che in diagonale selezionava le celle ortogonali.',
          'Rimosse ~50.000 forme troncate delle fonti (`abbacchier`, `nauseer`, `raitv`) con una regola sui finali in consonante + lista curata.',
          'Il client non scarica più 4 MB di dizionario: valida contro le parole della scheda.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il server non costruisce più il trie da 142 MB: le parole arrivano dalle schede (RSS ~170 MB).',
          'Il generatore di schede gira offline con `pnpm gen:schede` e anche dall\'admin a runtime.',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-09-20',
    title: 'Swipe preciso, 4 difficoltà e anteprima parole',
    changes: [
      {
        kind: 'feature',
        items: [
          'Quattro difficoltà (molto facile / facile / normale / difficile) con tema visivo dedicato.',
          'Anteprima: il server genera una griglia di esempio e mostra quante parole si possono trovare.',
          'Avatar: 32 emoji selezionabili, visibili in classifica e nelle notifiche.',
          'Tema chiaro: superfici bianche su sfondi pastello, un tema per difficoltà.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Hit-test sul centro più vicino invece del rettangolo: elimina le zone morte tra le celle.',
          'Interpolazione dei movimenti veloci: gli swipe rapidi non saltano le celle intermedie.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-20',
    title: 'Audio, durate e privacy multiplayer',
    changes: [
      {
        kind: 'feature',
        items: [
          'Effetti audio sintetizzati con Web Audio (nessun asset): motivi per lunghezza parola.',
          'Durata del round selezionabile: 90, 120 o 180 secondi.',
          'Lettere più grandi e leggibili.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Privacy multiplayer: agli avversari non viene rivelata la parola trovata, solo un badge "+N" e la lunghezza.',
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-20',
    title: 'Prima versione giocabile',
    changes: [
      {
        kind: 'feature',
        items: [
          'Single player con round, timer e riepilogo.',
          'Multiplayer con codice stanza a 6 caratteri, griglia e timer sincronizzati.',
          'Dizionario italiano ampio (Morph-it!, UniBO): ~387.000 forme, incluse le coniugazioni.',
          'Swipe su celle adiacenti (8 direzioni) con annullamento tornando indietro.',
          'Griglie 4×4, 5×5 e 6×6.',
        ],
      },
    ],
  },
];

/** Etichette leggibili per i tipi di modifica. */
export const CHANGE_LABELS: Record<ReleaseEntry['changes'][number]['kind'], string> = {
  feature: 'Novità',
  improvement: 'Migliorie',
  fix: 'Correzioni',
  tech: 'Dettagli tecnici',
};
