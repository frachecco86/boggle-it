/**
 * Statistiche di gioco e leaderboard.
 *
 * Perché una tabella dedicata: fino a ora i risultati di una partita NON venivano
 * salvati da nessuna parte — la classifica esisteva solo in memoria durante la
 * partita multiplayer. Per una leaderboard serve persistenza.
 *
 * Ogni partita conclusa diventa una riga: profilo (con snapshot di nome e avatar,
 * così la classifica resta leggibile anche se il profilo cambia o viene eliminato),
 * punteggio, parole trovate, difficoltà, dimensione e data.
 */
import type { Difficulty } from './difficulty.js';
import type { GridSize } from './types.js';

/** Modalità di gioco che generano una partita classificabile. */
export type GameMode = 'solo' | 'multi';

/** Una partita conclusa, come salvata. */
export interface GameRecord {
  id: string;
  profileId: string;
  /** Snapshot del nickname al momento della partita (il profilo può cambiare). */
  nickname: string;
  /** Snapshot dell'avatar. */
  avatar: string;
  score: number;
  /** Numero di parole trovate. */
  words: number;
  /** Numero di parole totali presenti nella scheda. */
  wordCount: number;
  /** Parola più lunga trovata (stringa vuota se nessuna). */
  longest: string;
  difficulty: Difficulty;
  gridSize: GridSize;
  mode: GameMode;
  /** Id della scheda giocata, se applicabile. */
  schedaId: string | null;
  playedAt: number;
}

/** Dati inviati dal client per registrare una partita. */
export interface SubmitGamePayload {
  score: number;
  words: number;
  wordCount: number;
  longest: string;
  difficulty: Difficulty;
  gridSize: GridSize;
  mode: GameMode;
  schedaId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                         */
/* ------------------------------------------------------------------ */

/** Le tre classifiche disponibili. */
export type LeaderboardKind = 'best' | 'total' | 'longest';

export const LEADERBOARD_KINDS: LeaderboardKind[] = ['best', 'total', 'longest'];

/** Intervallo temporale della classifica. */
export type LeaderboardPeriod = 'all' | 'month' | 'week';

/** Filtri della classifica. */
export interface LeaderboardFilters {
  kind: LeaderboardKind;
  /** Se assente, include tutte le dimensioni. */
  gridSize?: GridSize;
  /** Se assente, include tutte le difficoltà. */
  difficulty?: Difficulty;
  period: LeaderboardPeriod;
}

/** Una riga della classifica. */
export interface LeaderboardEntry {
  rank: number;
  profileId: string;
  nickname: string;
  avatar: string;
  /** Valore principale: dipende dal tipo di classifica. */
  value: number;
  /** Dettagli di supporto (punteggio, parole, lunghezza). */
  score: number;
  words: number;
  longest: string;
  gridSize: GridSize;
  difficulty: Difficulty;
  playedAt: number;
  /** Numero di partite (solo per la classifica "totali"). */
  games?: number;
}

/** Risposta dell'endpoint leaderboard. */
export interface LeaderboardResponse {
  kind: LeaderboardKind;
  period: LeaderboardPeriod;
  gridSize?: GridSize;
  difficulty?: Difficulty;
  entries: LeaderboardEntry[];
  /** Totale partite considerate (dopo i filtri). */
  gamesConsidered: number;
  /** Id del profilo che ha fatto la richiesta, se autenticato (per evidenziarlo). */
  myProfileId?: string | null;
  /** Posizione del richiedente nella classifica corrente (0 = non presente). */
  myRank?: number;
}

/** Statistiche personali del giocatore. */
export interface PlayerStats {
  games: number;
  bestScore: number;
  totalScore: number;
  totalWords: number;
  avgScore: number;
  /** Parola più lunga mai trovata. */
  longest: string;
  /** Posizione nella classifica "migliori" globale (0 = non classificato). */
  bestRank: number;
}

export const LEADERBOARD_LIMIT = 50;

/** Valida un payload di partita ricevuto dal client. */
export function isSubmitGamePayload(value: unknown): value is SubmitGamePayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  return (
    num(p.score) &&
    num(p.words) &&
    num(p.wordCount) &&
    typeof p.longest === 'string' &&
    p.longest.length <= 32 &&
    typeof p.difficulty === 'string' &&
    typeof p.gridSize === 'number' &&
    (p.gridSize === 4 || p.gridSize === 5 || p.gridSize === 6) &&
    (p.mode === 'solo' || p.mode === 'multi') &&
    (p.schedaId === undefined || p.schedaId === null || typeof p.schedaId === 'string')
  );
}

/* ------------------------------------------------------------------ */
/* Catalogo delle parole                                               */
/* ------------------------------------------------------------------ */

/**
 * Una parola del catalogo, con quante volte compare nelle schede.
 *
 * Serve a rispondere a "quali parole posso trovare, e quanto sono comuni?":
 * una parola che appare in molte schede è più facile da incontrare.
 */
export interface WordCatalogEntry {
  word: string;
  length: number;
  /** Numero di schede in cui la parola è componibile. */
  occurrences: number;
  /** Punteggio che vale (lunghezza - 2, come nel Boggle). */
  points: number;
}

/** Filtri del catalogo parole. */
export interface WordCatalogQuery {
  /** Ricerca testuale (prefisso o sottostringa). */
  search?: string;
  /** Lunghezza esatta. */
  length?: number;
  /** Solo parole di almeno N lettere. */
  minLength?: number;
  /** Solo parole di al più N lettere. */
  maxLength?: number;
  /** Restringe alle schede di una dimensione. */
  gridSize?: GridSize;
  /** Restringe alle schede di una difficoltà. */
  difficulty?: Difficulty;
  sort: 'word' | 'length' | 'occurrences';
  direction: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface WordCatalogResponse {
  entries: WordCatalogEntry[];
  /** Totale parole che soddisfano i filtri (per la paginazione). */
  total: number;
  /** Distribuzione per lunghezza sull'INTERO catalogo filtrato. */
  byLength: Array<{ length: number; words: number }>;
  offset: number;
  limit: number;
}

export const WORD_CATALOG_DEFAULT_LIMIT = 100;
