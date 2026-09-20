/**
 * Tipi condivisi tra client e server.
 * Questo pacchetto è la fonte di verità per tipi e logica deterministica.
 */

import type { Difficulty } from './difficulty.js';

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
  score: number;
  connected: boolean;
  isHost: boolean;
}

export interface FoundWord {
  word: string;
  points: number;
  at: number;
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
  currentRound: number;
  phase: GamePhase;
  players: PlayerPublic[];
  /** Timestamp server (ms) di fine round corrente, se in playing. */
  endsAt?: number;
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
}

export interface RoomJoinPayload {
  code: string;
  nickname: string;
  avatar: string;
  playerId?: string;
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
}

export interface RoundStartPayload {
  round: number;
  grid: Grid;
  endsAt: number;
  durationMs: number;
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
}

export interface RoundResultEntry {
  playerId: string;
  nickname: string;
  roundScore: number;
  totalScore: number;
  words: string[];
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
