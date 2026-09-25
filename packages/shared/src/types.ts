/**
 * Tipi condivisi tra client e server.
 * Questo pacchetto è la fonte di verità per tipi e logica deterministica.
 */

import type { Difficulty } from './difficulty.js';
import type { MusicChoice } from './music.js';
import type { SfxSlot } from './profile.js';

export type GridSize = 4 | 5 | 6;

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
  currentRound: number;
  phase: GamePhase;
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
  'room:config': (payload: RoomConfigPayload) => void;
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
  /** Voce di un altro giocatore della stanza (a chi parla non torna indietro). */
  'voice:audio': (payload: VoiceAudioPayload) => void;
  error: (payload: ErrorPayload) => void;
}
