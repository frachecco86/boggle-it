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

/** Eventi client -> server. */
export interface ClientToServerEvents {
  'room:create': (payload: RoomCreatePayload, ack: (res: RoomCreateAck | ErrorPayload) => void) => void;
  'room:join': (payload: RoomJoinPayload, ack: (res: RoomJoinAck | ErrorPayload) => void) => void;
  'room:start': (payload: { code: string }) => void;
  'room:config': (payload: RoomConfigPayload) => void;
  /** L'host pesca una nuova scheda per il prossimo round (visibile a tutti). */
  'room:shuffleScheda': (payload: { code: string }) => void;
  'game:submitWord': (payload: SubmitWordPayload, ack: (res: SubmitWordAck) => void) => void;
  'room:leave': (payload: { code: string }) => void;
}

/** Eventi server -> client. */
export interface ServerToClientEvents {
  'room:update': (state: RoomState) => void;
  'game:roundStart': (payload: RoundStartPayload) => void;
  'game:playerWord': (payload: PlayerWordPayload) => void;
  'game:roundEnd': (payload: RoundEndPayload) => void;
  'game:gameEnd': (payload: GameEndPayload) => void;
  'game:countdown': (payload: { seconds: number }) => void;
  error: (payload: ErrorPayload) => void;
}
