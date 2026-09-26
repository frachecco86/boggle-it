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

/**
 * Filtro per modalità nella classifica.
 *
 * Perché serve: un punteggio multiplayer dipende dagli avversari (raddoppio
 * sulle parole uniche, più teste che trovano parole). Mescolarlo con il single
 * player rende la classifica poco leggibile, quindi le due modalità si
 * consultano separatamente. `all` è il default retro-compatibile.
 */
export type LeaderboardMode = GameMode | 'all';

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
  /**
   * Parole trovate, con i punti di ciascuna.
   *
   * Perché vengono inviate: senza di esse il database sapeva solo QUANTE parole
   * erano state trovate, non QUALI. Le statistiche personali non potevano quindi
   * mostrare l'elenco delle parole per lunghezza.
   * Opzionale per retro-compatibilità con i client vecchi.
   */
  foundWords?: FoundWordPayload[];
}

/** Una parola trovata, come inviata dal client. */
export interface FoundWordPayload {
  word: string;
  points: number;
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
  /** Modalità: single player, multiplayer o tutte. */
  mode?: LeaderboardMode;
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
  /** Modalità della partita migliore (o della voce aggregata). */
  mode?: GameMode;
}

/** Risposta dell'endpoint leaderboard. */
export interface LeaderboardResponse {
  kind: LeaderboardKind;
  period: LeaderboardPeriod;
  gridSize?: GridSize;
  difficulty?: Difficulty;
  mode?: LeaderboardMode;
  entries: LeaderboardEntry[];
  /** Totale partite considerate (dopo i filtri). */
  gamesConsidered: number;
  /** Id del profilo che ha fatto la richiesta, se autenticato (per evidenziarlo). */
  myProfileId?: string | null;
  /** Posizione del richiedente nella classifica corrente (0 = non presente). */
  myRank?: number;
}

/** Statistiche di gioco, separate per modalità. */
export interface ModeStats {
  games: number;
  bestScore: number;
  totalScore: number;
  totalWords: number;
  avgScore: number;
}

/** Una voce dello storico partite. */
export interface GameHistoryEntry {
  id: string;
  score: number;
  /** Parole trovate in quella partita. */
  words: number;
  /** Parole totali della scheda (0 se non nota). */
  wordCount: number;
  longest: string;
  difficulty: Difficulty;
  gridSize: GridSize;
  mode: GameMode;
  playedAt: number;
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
  /*
   * Statistiche separate per modalità.
   *
   * Perché non un unico totale: una partita multiplayer dipende dagli avversari,
   * quindi mescolarla con il single player rende i numeri poco leggibili ("media
   * punti" fra una partita da soli e una in otto non significa nulla).
   */
  solo: ModeStats;
  multi: ModeStats;
  /**
   * TUTTE le parole trovate dal giocatore, raggruppate per lunghezza e ordinate.
   * Alimenta l'elenco delle statistiche personali.
   */
  wordsByLength: Array<{ length: number; words: string[] }>;
  /** Storico delle partite, dalla più recente. */
  history: GameHistoryEntry[];
}

export const LEADERBOARD_LIMIT = 50;

/** Quante partite restituisce lo storico delle statistiche personali. */
export const STATS_HISTORY_LIMIT = 50;

/** Numero massimo di parole salvate per una singola partita. */
export const MAX_GAME_WORDS = 1500;

/** Valida una singola parola trovata inviata dal client. */
export function isFoundWordPayload(value: unknown): value is FoundWordPayload {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.word === 'string' &&
    w.word.length > 0 &&
    w.word.length <= 32 &&
    typeof w.points === 'number' &&
    Number.isFinite(w.points) &&
    w.points >= 0 &&
    w.points <= 100
  );
}

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
    (p.schedaId === undefined || p.schedaId === null || typeof p.schedaId === 'string') &&
    // Elenco parole: opzionale (client vecchi non lo mandano), ma se presente
    // ogni voce deve essere valida e il numero complessivo limitato.
    (p.foundWords === undefined ||
      (Array.isArray(p.foundWords) &&
        p.foundWords.length <= MAX_GAME_WORDS &&
        p.foundWords.every(isFoundWordPayload)))
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
  /**
   * Categoria grammaticale abbreviata (`sost`, `verb`, `agg`, …) da Morph-it o
   * Wikizionario; `n.c.` se non classificata (~1% con il filtro headword).
   */
  pos: string;
  /**
   * true se esiste una voce di Wikizionario per questa parola: la UI mostra il
   * link alla definizione. Disponibile per i soli headword (~45k parole).
   */
  hasEntry: boolean;
  /**
   * Forma accentata per il link (`citta` → `città`). Assente quando la parola
   * normalizzata coincide col titolo della voce.
   */
  display?: string;
}

/** Filtri del catalogo parole. */
export interface WordCatalogQuery {
  /**
   * Ricerca testuale, per PREFISSO.
   *
   * Era una sottostringa pura (`includes`): "amo" matchava ogni "-iamo"
   * (`abbacchiamo`), cioè 12.782 risultati quasi tutti verbi. Nel dizionario
   * (368k parole) rendeva la ricerca inutilizzabile. Ora si cerca l'INIZIO della
   * parola: "amo" → `amo`, `amore`, `amorevole`.
   */
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
  /**
   * Restringe a UNA scheda specifica.
   * Serve a rispondere a "questa parola vale nella scheda che sto giocando?".
   */
  schedaId?: string;
  /** Categoria grammaticale, o `'all'`/assente per tutte. */
  pos?: string;
  /** true = solo parole con voce di Wikizionario (definizione disponibile). */
  onlyWithEntry?: boolean;
  /**
   * Universo di parole su cui lavorare:
   *  - `'schede'` (default): solo le parole componibili in almeno una scheda.
   *  - `'dizionario'`: TUTTO il lessico, comprese le parole mai componibili.
   *
   * Perché serve: la pagina Parole ha due viste. Senza questo parametro la vista
   * "Dizionario" mostrerebbe comunque solo le parole delle schede, cioè un
   * sottoinsieme (è il bug che rendeva le due viste identiche).
   */
  scope?: 'schede' | 'dizionario';
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
  /**
   * Categorie grammaticali presenti sull'INTERO catalogo filtrato, con il numero
   * di parole. Alimenta il selettore "categoria" senza che il client debba
   * conoscerle in anticipo.
   */
  byPos: Array<{ pos: string; words: number }>;
  /** Quante parole hanno una voce di Wikizionario (definizione disponibile). */
  withEntry: number;
  offset: number;
  limit: number;
}

export const WORD_CATALOG_DEFAULT_LIMIT = 100;


/* ------------------------------------------------------------------ */
/* Statistiche di una scheda                                           */
/* ------------------------------------------------------------------ */

/** Distribuzione delle parole di una scheda per lunghezza. */
export interface SchedaStats {
  id: string;
  size: GridSize;
  difficulty: Difficulty;
  grid: string;
  /** Totale parole componibili. */
  wordCount: number;
  /** Punteggio massimo realizzabile (somma dei punti di tutte le parole). */
  maxScore: number;
  /**
   * Lunghezza della parola più lunga trovabile.
   *
   * Deliberatamente NON la parola: l'anteprima è pubblica e chiunque potrebbe
   * leggerla dalla risposta dell'API, regalandosi la soluzione.
   */
  longestLength: number;
  /** Quante parole per ogni lunghezza (ordinate crescente). */
  byLength: Array<{ length: number; words: number; points: number }>;
  /** Record: miglior punteggio mai fatto su questa scheda, se esiste. */
  record: {
    score: number;
    nickname: string;
    avatar: string;
    playedAt: number;
  } | null;
  /** Quante partite sono state giocate su questa scheda. */
  gamesPlayed: number;
}

/** Punteggio di una parola: 1 punto per 3 lettere, poi 1 per lettera in più. */
export function schedaWordPoints(length: number): number {
  return Math.max(0, length - 2);
}
