import {
  DEFAULT_MUSIC_ID,
  generateGrid,
  generateRoomCode,
  isMusicChoice,
  isValidPath,
  pathMatchesWord,
  rowsToGrid,
  scoreForWord,
  normalizeWord,
  type Difficulty,
  type FoundWord,
  type Grid,
  type GridSize,
  type MusicId,
  type PlayerPublic,
  type RoomState,
  type Scheda,
} from '@boggle/shared';
import type { Dictionary } from './dictionary.js';

// Default di sviluppo/test: sovrascrivibili via env o per-stanza.
export const DEFAULT_ROUND_DURATION_MS = Number(process.env.ROUND_DURATION_MS ?? 180_000);
export const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS ?? 3_000);
export const ROUND_END_PAUSE_MS = Number(process.env.ROUND_END_PAUSE_MS ?? 10_000);

/** Durate offerte dall'interfaccia (secondi) — allineate a ROUND_DURATIONS_SEC nel shared. */
const ALLOWED_DURATION_MS = [90_000, 120_000, 180_000];

/** Limiti di sicurezza: evitano round istantanei o infiniti. */
const MIN_DURATION_MS = 5_000;
const MAX_DURATION_MS = 15 * 60_000;

/**
 * Normalizza la durata richiesta dal client.
 *
 * La UI propone 90/120/180s, ma il server non impone quella lista: accetta qualsiasi
 * valore nei limiti di sicurezza. Cosi' i test possono usare round da pochi secondi
 * e in futuro si potranno aggiungere durate personalizzate senza toccare il server.
 */
export function clampDuration(ms: unknown): number {
  const v = Number(ms);
  if (!Number.isFinite(v)) return DEFAULT_ROUND_DURATION_MS;
  if (v < MIN_DURATION_MS || v > MAX_DURATION_MS) return DEFAULT_ROUND_DURATION_MS;
  return Math.round(v);
}

/** Durate offerte dalla UI (usata nei messaggi di aiuto/test). */
export const PREDEFINED_DURATIONS_MS = [...ALLOWED_DURATION_MS];

export interface Player {
  id: string;
  socketId: string | null;
  nickname: string;
  avatar: string;
  /** Id del profilo persistente, se il giocatore è loggato. */
  profileId: string | null;
  /** Foto profilo pubblica (mostrata in stanza al posto dell'emoji). */
  photoUrl: string | null;
  totalScore: number;
  roundScore: number;
  words: FoundWord[];
  roundWords: Set<string>;
  connected: boolean;
}

export class Room {
  readonly code: string;
  hostId: string;
  gridSize: GridSize;
  difficulty: Difficulty;
  rounds: number;
  roundDurationMs: number;
  /** Numero massimo di giocatori: 2 (sfida), 4 o 8 (partita allargata). */
  maxPlayers: number;
  currentRound = 0;
  phase: RoomState['phase'] = 'lobby';
  grid: Grid | null = null;
  /** Id della scheda in gioco nel round corrente. */
  schedaId: string | null = null;
  /**
   * Musica di sottofondo scelta dall'HOST, valida per tutta la stanza.
   * In lobby la cambia l'host; durante la partita resta quella scelta.
   */
  musicId: MusicId | 'none' = DEFAULT_MUSIC_ID;
  roundEndsAt = 0;
  players = new Map<string, Player>();
  /** Tutte le parole valide trovate nel round corrente (per il riepilogo mancate). */
  roundFoundWords = new Set<string>();
  /**
   * Tutte le parole trovabili sulla scheda del round corrente.
   * Arrivano pre-calcolate dalla scheda: nessun solver a runtime.
   */
  roundValidWords: Set<string> = new Set();

  private readonly dictionary: Dictionary;

  constructor(
    code: string,
    dictionary: Dictionary,
    gridSize: GridSize = 4,
    rounds = 3,
    difficulty: Difficulty = 'normale',
    roundDurationMs: number = DEFAULT_ROUND_DURATION_MS,
    maxPlayers: number = 8,
  ) {
    this.code = code;
    this.hostId = '';
    this.gridSize = gridSize;
    this.rounds = rounds;
    this.difficulty = difficulty;
    this.roundDurationMs = roundDurationMs;
    this.maxPlayers = maxPlayers;
    this.dictionary = dictionary;
  }

  static create(
    dictionary: Dictionary,
    gridSize: GridSize,
    rounds: number,
    difficulty: Difficulty = 'normale',
    roundDurationMs: number = DEFAULT_ROUND_DURATION_MS,
    maxPlayers: number = 8,
  ): Room {
    return new Room(
      generateRoomCode(),
      dictionary,
      gridSize,
      rounds,
      difficulty,
      roundDurationMs,
      maxPlayers,
    );
  }

  addPlayer(
    id: string,
    nickname: string,
    avatar = '🐱',
    profile?: { id: string; photoUrl: string | null } | null,
  ): Player {
    const player: Player = {
      id,
      socketId: null,
      nickname: nickname.trim().slice(0, 20) || 'Giocatore',
      avatar: String(avatar || '🐱').slice(0, 8),
      profileId: profile?.id ?? null,
      photoUrl: profile?.photoUrl ?? null,
      totalScore: 0,
      roundScore: 0,
      words: [],
      roundWords: new Set(),
      connected: true,
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    return player;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  publicState(): RoomState {
    return {
      code: this.code,
      hostId: this.hostId,
      gridSize: this.gridSize,
      difficulty: this.difficulty,
      rounds: this.rounds,
      roundDurationMs: this.roundDurationMs,
      maxPlayers: this.maxPlayers,
      currentRound: this.currentRound,
      phase: this.phase,
      players: this.publicPlayers(),
      endsAt: this.phase === 'playing' ? this.roundEndsAt : undefined,
      schedaId: this.schedaId ?? undefined,
      musicId: this.musicId,
    };
  }

  publicPlayers(): PlayerPublic[] {    return [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      photoUrl: p.photoUrl ?? undefined,
      score: p.totalScore,
      connected: p.connected,
      isHost: p.id === this.hostId,
    }));
  }

  /**
   * Avvia un nuovo round. Con una `scheda` la griglia e le parole valide arrivano
   * pre-calcolate (percorso normale in produzione); senza, la griglia è generata
   * al volo (usato solo dai test e come fallback se il catalogo è vuoto).
   */
  startRound(scheda?: Scheda): { grid: Grid; endsAt: number } {
    this.currentRound++;
    this.phase = 'playing';
    this.grid = scheda ? rowsToGrid(scheda.grid) : generateGrid(this.gridSize, Math.random, this.difficulty);
    this.schedaId = scheda?.id ?? null;
    this.roundValidWords = new Set(scheda?.words ?? []);
    this.roundFoundWords = new Set();
    for (const p of this.players.values()) {
      p.roundScore = 0;
      p.roundWords = new Set();
    }
    this.roundEndsAt = Date.now() + this.roundDurationMs;
    return { grid: this.grid, endsAt: this.roundEndsAt };
  }

  /**
   * Valida e registra una parola. Ordine dei controlli:
   * round attivo -> formato -> percorso legale -> corrispondenza percorso/parola ->
   * dizionario -> lunghezza -> duplicato.
   */
  submitWord(playerId: string, rawWord: string, path: number[]): { accepted: boolean; reason?: string; word?: string; points?: number } {
    const player = this.players.get(playerId);
    if (!player) return { accepted: false, reason: 'Giocatore non in stanza' };
    if (this.phase !== 'playing') return { accepted: false, reason: 'Il round non e\' attivo' };
    if (Date.now() > this.roundEndsAt) return { accepted: false, reason: 'Tempo scaduto' };
    if (!this.grid) return { accepted: false, reason: 'Griglia non disponibile' };

    if (!Array.isArray(path) || path.length === 0 || path.length > 16) {
      return { accepted: false, reason: 'Percorso non valido' };
    }
    if (!isValidPath(this.grid, path)) {
      return { accepted: false, reason: 'Percorso non valido' };
    }
    const normalized = normalizeWord(rawWord);
    if (!normalized) return { accepted: false, reason: 'Parola non valida' };
    if (!pathMatchesWord(this.grid, path, normalized)) {
      return { accepted: false, reason: 'Parola non corrispondente al percorso' };
    }
    if (normalized.length < 3) return { accepted: false, reason: 'Parola troppo corta' };
    // Validazione contro le parole della SCHEDA (quando disponibile): è la stessa
    // fonte usata dal client, quindi non ci sono divergenze né parole "strane"
    // che il dizionario accetterebbe ma la scheda no. Fallback al dizionario per
    // le stanze avviate senza scheda (test o catalogo vuoto).
    const validOnScheda =
      this.roundValidWords.size > 0
        ? this.roundValidWords.has(normalized)
        : this.dictionary.has(normalized);
    if (!validOnScheda) {
      return {
        accepted: false,
        reason: this.roundValidWords.size > 0 ? 'Non una parola di questa scheda' : 'Parola non nel dizionario',
      };
    }
    if (player.roundWords.has(normalized)) return { accepted: false, reason: 'Parola gia\' trovata' };

    const points = scoreForWord(normalized);
    player.roundWords.add(normalized);
    player.roundScore += points;
    player.totalScore += points;
    player.words.push({ word: normalized, points, at: Date.now() });
    this.roundFoundWords.add(normalized);

    // La parola potrebbe valere doppio (trovata da soli), ma l'unicità si sa solo
    // a fine round: il bonus viene versato in `endRound`.
    return { accepted: true, word: normalized, points };
  }

  /**
   * Chiude il round e produce i risultati ordinati per punteggio.
   *
   * Qui si applica il raddoppio: se NESSUN altro giocatore ha trovato una parola,
   * il giocatore che l'ha trovata riceve un bonus pari ai punti base (→ doppio).
   */
  endRound() {
    this.phase = 'roundEnd';

    // Conteggio per parola: quante volte è stata trovata nella stanza.
    const wordCounts = new Map<string, number>();
    for (const p of this.players.values()) {
      for (const w of p.roundWords) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }

    const uniquePerPlayer = new Map<string, string[]>();
    for (const p of this.players.values()) {
      const unique: string[] = [];
      for (const w of p.roundWords) {
        if (wordCounts.get(w) !== 1) continue;
        const bonus = scoreForWord(w);
        p.roundScore += bonus;
        p.totalScore += bonus;
        const entry = p.words.find((x) => x.word === w);
        if (entry) {
          entry.points += bonus;
          entry.unique = true;
        }
        unique.push(w);
      }
      if (unique.length > 0) uniquePerPlayer.set(p.id, unique.sort());
    }

    return [...this.players.values()]
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        roundScore: p.roundScore,
        totalScore: p.totalScore,
        words: [...p.roundWords].sort(),
        uniqueWords: uniquePerPlayer.get(p.id) ?? [],
      }))
      .sort((a, b) => b.roundScore - a.roundScore || a.nickname.localeCompare(b.nickname));
  }

  isGameOver(): boolean {
    return this.currentRound >= this.rounds;
  }

  finalScores() {
    return [...this.players.values()]
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        roundScore: p.roundScore,
        totalScore: p.totalScore,
        words: [...p.roundWords].sort(),
      }))
      .sort((a, b) => b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname));
  }
  /** Imposta la musica di tutta la stanza (chiamata solo per l'host). */
  setMusic(choice: MusicId | 'none'): void {
    if (isMusicChoice(choice)) this.musicId = choice;
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    if (this.hostId === playerId) {
      const next = [...this.players.values()].find((p) => p.connected) ?? [...this.players.values()][0];
      this.hostId = next?.id ?? '';
    }
  }
}

/** Registro globale delle stanze. */
export class RoomRegistry {
  private rooms = new Map<string, Room>();
  constructor(private dictionary: Dictionary) {}

  create(
    gridSize: GridSize = 4,
    rounds = 3,
    difficulty: Difficulty = 'normale',
    roundDurationMs: number = DEFAULT_ROUND_DURATION_MS,
    maxPlayers: number = 8,
  ): Room {
    let room: Room;
    let attempts = 0;
    do {
      room = Room.create(this.dictionary, gridSize, rounds, difficulty, roundDurationMs, maxPlayers);
      attempts++;
    } while (this.rooms.has(room.code) && attempts < 200);
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  /** Rimuove stanze vuote o terminate da troppo tempo. */
  cleanup(now = Date.now()): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const empty = room.players.size === 0;
      const stale = room.phase === 'gameEnd' && now - room.roundEndsAt > 5 * 60_000;
      if (empty || stale) {
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }
}

