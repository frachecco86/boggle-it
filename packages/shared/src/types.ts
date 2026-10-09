/**
 * Tipi condivisi tra client e server.
 * Questo pacchetto è la fonte di verità per tipi e logica deterministica.
 */

import type { Difficulty } from './difficulty.js';
import type { SchedaVariant } from './scheda.js';
import type { MusicChoice } from './music.js';
import type { SfxSlot } from './profile.js';

export type GridSize = 4 | 5 | 6;

/**
 * Impostazioni globali decise dall'admin e valide per TUTTI i giocatori.
 *
 * Vivono sul server (`GET /config`) e non nel browser: il tipo di scheda di
 * default è una scelta di prodotto, non una preferenza del singolo. Prima il
 * giocatore lo sceglieva in home e in lobby; ora lo decide solo l'admin.
 */
export interface AppConfig {
  /**
   * Insieme di criteri delle schede usato da tutte le partite (single player e
   * stanze). `standard`, `full` o `ale`.
   */
  defaultSchedaVariant: SchedaVariant;
}

export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'roundEnd' | 'gameEnd';

/** Una cella della griglia. `q` rappresenta la faccia "Qu" (Q+U inseparabili). */
export interface Tile {
  /** Indice lineare nella griglia (row * size + col). */
  index: number;
  row: number;
  col: number;
  /** Faccia del dado. `'q'` = "Qu". */
  letter: string;
  /** Testo visualizzato nella cella (per 'q' sarà "Qu"). */
  display: string;
}

export interface Grid {
  size: GridSize;
  tiles: Tile[];
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  /** Emoji scelta dal giocatore (es. '🦊'). */
  avatar: string;
  /**
   * URL della foto profilo, se il giocatore ne ha una e la condivide.
   * Le foto sono servite dal server e pubbliche in stanza (è l'equivalente
   * dell'avatar, solo più personale).
   */
  photoUrl?: string;
  /**
   * Id del profiles persistente, se il giocatore è loggato.
   * Serve a scaricare le clip audio condivise in stanza: le registrazioni
   * restano private, ma chi gioca nella stessa partita può sentirle.
   */
  profileId?: string;
  /**
   * Fasce di lunghezza per cui il giocatore ha una clip audio registrata.
   * Il contenuto NON è qui: gli avversari scaricano le clip solo se sono
   * nella stessa stanza (vedi `GET /profiles/:id/sfx/:slot`).
   */
  sfxSlots?: SfxSlot[];
  score: number;
  connected: boolean;
  isHost: boolean;
  /**
   * true se il giocatore è **seduto in stanza ma non gioca la partita in corso**:
   * è arrivato quando non poteva più entrare (dal round 2 in poi, o a partita
   * finita) e giocherà la prossima. Vedi `Room.seatForNewPlayer`.
   *
   * Assente (o false) = gioca la partita corrente.
   */
  waiting?: boolean;
}

export interface FoundWord {
  word: string;
  points: number;
  at: number;
  /**
   * true se NESSUN ALTRO giocatore ha trovato la parola (solo multiplayer):
   * i punti sono già raddoppiati. In single player resta `undefined`.
   */
  unique?: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  gridSize: GridSize;
  /** Difficoltà: cambia distribuzione lettere, tema e durata consigliata. */
  difficulty: Difficulty;
  rounds: number;
  /** Durata di un round in millisecondi. */
  roundDurationMs: number;
  /** Numero massimo di giocatori ammessi (2, 4 o 8). */
  maxPlayers: number;
  /**
   * Scheda scelta per il prossimo round, visibile in lobby.
   * L'host può cambiarla prima di avviare; tutti la vedono.
   */
  pendingSchedaId?: string;
  /**
   * Insieme di criteri delle schede della stanza (`standard` o `full`).
   * Se assente (stanze vecchie), vale `standard`.
   */
  schedaVariant?: SchedaVariant;
  currentRound: number;
  phase: GamePhase;
  /**
   * Quale partita sta giocando QUESTA stanza: 1 alla prima, +1 ogni volta che
   * l'host inizia una nuova partita (stesso codice, stessi giocatori).
   *
   * Non è il numero di round: serve all'interfaccia per dire «partita 2» e per
   * far capire a chi è arrivato tardi che una partita l'hanno già giocata.
   */
  matchNumber: number;
  players: PlayerPublic[];
  /** Timestamp server (ms) di fine round corrente, se in playing. */
  endsAt?: number;
  /** Id della scheda giocata nel round corrente (vedi `Scheda`). */
  schedaId?: string;
  /**
   * Musica di sottofondo scelta dall'host, valida per TUTTA la stanza.
   * `'none'` = musica spenta per tutti. In single player la scelta è locale.
   * L'id può riferirsi a una traccia caricata dall'admin (catalogo dinamico).
   */
  musicId?: MusicChoice;
}

/* ------------------------------------------------------------------ */
/* Messaggi Socket.IO                                                  */
/* ------------------------------------------------------------------ */

export interface RoomCreatePayload {
  nickname: string;
  avatar: string;
  gridSize: GridSize;
  difficulty: Difficulty;
  rounds: number;
  roundDurationMs: number;
  /** Numero massimo di giocatori (2, 4 o 8). Se assente, 8. */
  maxPlayers?: number;
  /**
   * Insieme di criteri delle schede da giocare in questa stanza (`standard` o
   * `full`). Se assente, `standard`.
   */
  schedaVariant?: SchedaVariant;
  /** Token del profilo, se il giocatore è loggato (per foto e avatar). */
  token?: string;
}

export interface RoomJoinPayload {
  code: string;
  nickname: string;
  avatar: string;
  playerId?: string;
  /** Token del profilo, se il giocatore è loggato (per foto e avatar). */
  token?: string;
}

export interface RoomCreateAck {
  ok: true;
  roomCode: string;
  playerId: string;
  state: RoomState;
}

export interface RoomJoinAck {
  ok: true;
  playerId: string;
  state: RoomState;
}

/**
 * Risposta di `room:newGame`: la stanza è pronta per una nuova partita, con i
 * punteggi azzerati e le schede nuove da pescare.
 */
export interface RoomNewGameAck {
  ok: true;
  state: RoomState;
}

/** Payload di `room:newGame`, l'evento con cui la stanza avvisa TUTTI. */
export interface RoomNewGamePayload {
  state: RoomState;
}

/**
 * Payload di `room:closed`: la stanza non esiste più, i client tornano alla home.
 *
 * Non c'è un "motivo": l'unico modo in cui una stanza viene spenta da fuori è la
 * scelta dell'host (`room:close`). Una stanza rimasta senza giocatori non ha
 * nessuno da avvisare, e la pulizia automatica non è un evento: non manda niente.
 */
export interface RoomClosedPayload {
  code: string;
}

/**
 * Payload di `room:updateIdentity`: cambia nome e/o avatar del giocatore che
 * lo invia, nella stanza in cui si trova.
 *
 * Perché serve un evento dedicato: nome e avatar arrivavano al server solo a
 * `room:create`/`room:join`. Cambiarli nella sala d'attesa aggiornava soltanto
 * lo store locale del client: lo stato della stanza (che è l'unica fonte delle
 * barre avatar in partita, del podio e dei risultati di round) restava fermo
 * all'ingresso, e tutti continuavano a vedere il nome/avatar vecchi.
 *
 * I campi sono opzionali: si manda solo ciò che è cambiato. Un campo assente o
 * vuoto NON sovrascrive il valore corrente.
 *
 * È una modifica EFFIMERA alla stanza: aggiorna l'identità mostrata in quella
 * partita, non il profilo sul server (il nickname del profilo è l'handle di
 * accesso, con vincolo di unicità, e non si rinomina da qui).
 */
export interface RoomUpdateIdentityPayload {
  nickname?: string;
  avatar?: string;
}

/** Risposta di `room:updateIdentity`. */
export interface RoomUpdateIdentityAck {
  ok: true;
}

export interface RoomConfigPayload {
  code: string;
  gridSize: GridSize;
  difficulty: Difficulty;
  rounds: number;
  roundDurationMs: number;
  /** Musica di sottofondo per tutta la stanza (solo host). */
  musicId?: MusicChoice;
  /** Numero massimo di giocatori (2, 4 o 8). */
  maxPlayers?: number;
  /** Insieme di criteri delle schede della stanza (solo host). */
  schedaVariant?: SchedaVariant;
}

export interface SubmitWordPayload {
  word: string;
  path: number[];
}

export interface SubmitWordAck {
  accepted: boolean;
  reason?: string;
  word?: string;
  points?: number;
  /** true se è la prima volta che la parola viene trovata nel round (raddoppio). */
  unique?: boolean;
}

export interface RoundStartPayload {
  round: number;
  grid: Grid;
  endsAt: number;
  durationMs: number;
  /** Id della scheda giocata (per la pagina scheda e la cronologia). */
  schedaId?: string;
}

export interface PlayerWordPayload {
  playerId: string;
  nickname: string;
  avatar: string;
  /** Parola trovata. Stringa VUOTA per gli avversari (non riveliamo le parole). */
  word: string;
  /** Lunghezza della parola: permette al client di scdere il suono giusto anche per gli altri. */
  wordLength: number;
  points: number;
  score: number;
  /** true se la parola e' del giocatore che riceve l'evento. */
  self: boolean;
  /** true se la parola è stata trovata da un solo giocatore (punti già raddoppiati). */
  unique?: boolean;
}

/**
 * Una parola trovata durante un round, con il momento in cui è stata trovata.
 *
 * Serve al riepilogo "arcade": il client ripercorre la partita in ordine
 * cronologico e accende le parole una alla volta, come nel Boggle originale.
 * `at` è in millisecondi **dall'inizio del round** (o della partita, per il
 * riepilogo finale), non un timestamp assoluto: così il client non deve
 * conoscere l'orologio del server.
 */
export interface WordEvent {
  word: string;
  /** Punti della parola, raddoppio già incluso. */
  points: number;
  /** Millisecondi dall'inizio del round/partita. */
  at: number;
  /** true se la parola è stata trovata da un solo giocatore (×2). */
  unique?: boolean;
}

export interface RoundResultEntry {
  playerId: string;
  nickname: string;
  roundScore: number;
  totalScore: number;
  words: string[];
  /** Parole trovate da un solo giocatore (punteggio raddoppiato). */
  uniqueWords?: string[];
  /**
   * Parole del round in ordine cronologico, per il replay del riepilogo.
   * Presente solo quando il server può ricostruirla (partite in corso da questa
   * versione in avanti). Assente = il client mostra il riepilogo classico.
   */
  timeline?: WordEvent[];
}

export interface RoundEndPayload {
  round: number;
  results: RoundResultEntry[];
  /** Parole valide che nessuno ha trovato (max ~20, solo lunghezza >= 5). */
  missedWords: string[];
  nextRoundInMs: number;
}

export interface GameEndPayload {
  finalScores: RoundResultEntry[];
}

export interface ErrorPayload {
  code: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Voce in stanza (tieni premuto per parlare)                          */
/* ------------------------------------------------------------------ */

/*
 * Perché PCM grezzo e non WebRTC: la voce serve "quasi in diretta" dentro una
 * partita, senza aggiungere signaling, STUN e TURN. I parametri qui sotto sono
 * il contratto fra chi parla e chi ascolta, quindi vivono nel pacchetto condiviso:
 * se il client cambiasse frequenza o dimensione dei pacchetti senza che il server
 * lo sappia, la validazione li rifiuterebbe a metà partita.
 */

/**
 * Frequenza di campionamento della voce, in Hz.
 *
 * 16 kHz mono è la qualità tipica della telefonia: sufficiente a capire le parole
 * e quattro volte più leggero dei 48 kHz del contesto audio del browser. Il
 * client campiona a questa frequenza e il browser la ricampiona in riproduzione.
 */
export const VOICE_SAMPLE_RATE = 16000;

/**
 * Campioni per pacchetto: 1024 a 16 kHz = **64 ms**.
 *
 * È il compromesso fra ritardo (pacchetti piccoli = più reattivo, ma più overhead
 * e più eventi al secondo) e robustezza (pacchetti grandi = un pacchetto perso si
 * sente di meno). 64 ms tiene il ritardo totale intorno ai 200 ms, che è la
 * soglia sotto la quale una conversazione sembra naturale.
 */
export const VOICE_CHUNK_SAMPLES = 1024;

/** Byte di un pacchetto (campioni Int16): la dimensione che il server accetta. */
export const VOICE_CHUNK_BYTES = VOICE_CHUNK_SAMPLES * 2;

/**
 * Massimo di pacchetti al secondo accettati da un singolo giocatore.
 *
 * Il ritmo nominale è ~16/s (un pacchetto ogni 64 ms): 40 lascia spazio agli
 * scatti della rete senza aprire la porta a chi vorrebbe inondare la stanza.
 */
export const VOICE_MAX_CHUNKS_PER_SECOND = 40;

/**
 * Massimo di giocatori che possono parlare **contemporaneamente** in una stanza.
 *
 * Ogni voce costa ~32 KB/s a ogni ascoltatore: senza un tetto, otto microfoni
 * aperti insieme farebbero 256 KB/s per dispositivo, che su rete mobile si sente
 * (e non serve: in una stanza si parla uno alla volta).
 */
export const VOICE_MAX_TALKERS = 4;

/**
 * Dopo quanti millisecondi di silenzio un parlante è considerato fermo.
 *
 * Vale per il server (libera il posto se il client muore senza mandare `stop`) e
 * per gli indicatori "sta parlando" dei client: un pacchetto ogni 64 ms, quindi
 * 400 ms di silenzio significano che ha smesso.
 */
export const VOICE_SILENCE_MS = 400;

export interface VoiceStartAck {
  ok: true;
}

export interface VoiceAudioPayload {
  /** Chi sta parlando. */
  playerId: string;
  /** Pacchetto PCM Int16 little-endian a `VOICE_SAMPLE_RATE` Hz. */
  data: ArrayBuffer;
}

/** Eventi client -> server. */
export interface ClientToServerEvents {
  'room:create': (payload: RoomCreatePayload, ack: (res: RoomCreateAck | ErrorPayload) => void) => void;
  'room:join': (payload: RoomJoinPayload, ack: (res: RoomJoinAck | ErrorPayload) => void) => void;
  /**
   * Rientro dopo una riconnessione del socket.
   *
   * Perché serve un evento dedicato: Socket.IO riconnette da solo con un NUOVO
   * `socket.id`, e il server associa stanza/giocatore proprio a quell'id. Dopo
   * una riconnessione trasparente il mapping è perso, quindi `game:submitWord`
   * rispondeva "Non in una stanza" pur essendo in partita. Il client, appena il
   * socket torna connesso, rimanda qui i dati della stanza (che conserva nello
   * store) e il server ricostruisce il mapping senza far ripartire la partita.
   */
  'room:rejoin': (payload: { code: string; playerId: string }, ack: (res: RoomJoinAck | ErrorPayload) => void) => void;
  'room:start': (payload: { code: string }) => void;
  /**
   * L'host inizia una NUOVA partita nella stessa stanza.
   *
   * Perché non basta `room:start`: quando una partita finisce la stanza entra in
   * `gameEnd` e i punteggi, i round giocati e le parole restano quelli di quella
   * partita. Qui il server azzera la partita (NON la stanza: codice, giocatori,
   * impostazioni e musica restano) e avvisa tutti con `room:newGame`, così chi
   * è arrivato tardi e aspettava entra a giocare. È anche il momento in cui le
   * partite concluse vengono scritte in classifica, prima di azzerare i punti.
   */
  'room:newGame': (payload: { code: string }, ack: (res: RoomNewGameAck | ErrorPayload) => void) => void;
  /**
   * L'host chiude la stanza per tutti (l'alternativa a «gioca ancora»).
   *
   * Si può fare solo fra una partita e l'altra: durante un round si esce e
   * basta, chiudere la stanza addosso alla gente non è mai stato utile.
   */
  'room:close': (payload: { code: string }, ack: (res: { ok: true } | ErrorPayload) => void) => void;
  'room:config': (payload: RoomConfigPayload) => void;
  /**
   * Aggiorna nome e/o avatar del mittente nella stanza, e avvisa tutti.
   *
   * Si può chiamare in qualunque fase: chi cambia nome a partita in corso lo
   * vede riflesso nella barra avatar, nel podio e nei risultati dei round
   * successivi (i risultati portano il nickname letto dal server al momento
   * della chiusura del round).
   */
  'room:updateIdentity': (
    payload: RoomUpdateIdentityPayload,
    ack?: (res: RoomUpdateIdentityAck | ErrorPayload) => void,
  ) => void;
  /** L'host pesca una nuova scheda per il prossimo round (visibile a tutti). */
  'room:shuffleScheda': (payload: { code: string }) => void;
  'game:submitWord': (payload: SubmitWordPayload, ack: (res: SubmitWordAck) => void) => void;
  'room:leave': (payload: { code: string }) => void;
  /**
   * Apre il canale voce per chi tiene premuto il tasto.
   *
   * L'ack può rifiutare (canale pieno): in quel caso il client NON deve inviare
   * pacchetti, altrimenti riempirebbe la rete della stanza senza che nessuno
   * stia ascoltando.
   */
  'voice:start': (ack: (res: VoiceStartAck | ErrorPayload) => void) => void;
  /** Pacchetto audio (ArrayBuffer Int16 grezzo), inoltrato agli altri della stanza. */
  'voice:chunk': (data: ArrayBuffer) => void;
  /** Chiude il canale voce (il tasto è stato rilasciato). */
  'voice:stop': () => void;
}

/** Eventi server -> client. */
export interface ServerToClientEvents {
  'room:update': (state: RoomState) => void;
  'game:roundStart': (payload: RoundStartPayload) => void;
  'game:playerWord': (payload: PlayerWordPayload) => void;
  'game:roundEnd': (payload: RoundEndPayload) => void;
  'game:gameEnd': (payload: GameEndPayload) => void;
  'game:countdown': (payload: { seconds: number }) => void;
  /**
   * Nuova partita nella stessa stanza: punteggi azzerati, round ricominciato, si
   * torna in sala d'attesa con lo STESSO codice stanza.
   *
   * Serve un evento dedicato (e non solo un `room:update`) perché i client sono
   * sulla schermata di classifica finale con i punteggi di una partita che non
   * esiste più: devono dimenticare quei dati, non aggiornarli.
   */
  'room:newGame': (payload: RoomNewGamePayload) => void;
  /** La stanza è stata chiusa: si torna alla home. */
  'room:closed': (payload: RoomClosedPayload) => void;
  /** Voce di un altro giocatore della stanza (a chi parla non torna indietro). */
  'voice:audio': (payload: VoiceAudioPayload) => void;
  error: (payload: ErrorPayload) => void;
}
