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

export const APP_VERSION = '0.5.2';

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
