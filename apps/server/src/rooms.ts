import {
  generateGrid,
  generateRoomCode,
  isValidPath,
  pathMatchesWord,
  scoreForWord,
  normalizeWord,
  type FoundWord,
  type Grid,
  type GridSize,
  type PlayerPublic,
  type RoomState,
} from '@boggle/shared';
import type { Dictionary } from './dictionary.js';

// Durata round configurabile via env per test/dev (default 3 minuti).
export const ROUND_DURATION_MS = Number(process.env.ROUND_DURATION_MS ?? 180_000);
export const COUNTDOWN_MS = Number(process.env.COUNTDOWN_MS ?? 3_000);
export const ROUND_END_PAUSE_MS = Number(process.env.ROUND_END_PAUSE_MS ?? 10_000);

export interface Player {
  id: string;
  socketId: string | null;
  nickname: string;
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
  rounds: number;
  currentRound = 0;
  phase: RoomState['phase'] = 'lobby';
  grid: Grid | null = null;
  roundEndsAt = 0;
  players = new Map<string, Player>();
  /** Tutte le parole valide trovate nel round corrente (per il riepilogo mancate). */
  roundFoundWords = new Set<string>();

  private readonly dictionary: Dictionary;

  constructor(code: string, dictionary: Dictionary, gridSize: GridSize = 4, rounds = 3) {
    this.code = code;
    this.hostId = '';
    this.gridSize = gridSize;
    this.rounds = rounds;
    this.dictionary = dictionary;
  }

  static create(dictionary: Dictionary, gridSize: GridSize, rounds: number): Room {
    return new Room(generateRoomCode(), dictionary, gridSize, rounds);
  }

  addPlayer(id: string, nickname: string): Player {
    const player: Player = {
      id,
      socketId: null,
      nickname: nickname.trim().slice(0, 20) || 'Giocatore',
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
    return this.players.size >= 8;
  }

  publicState(): RoomState {
    return {
      code: this.code,
      hostId: this.hostId,
      gridSize: this.gridSize,
      rounds: this.rounds,
      currentRound: this.currentRound,
      phase: this.phase,
      players: this.publicPlayers(),
      endsAt: this.phase === 'playing' ? this.roundEndsAt : undefined,
    };
  }

  publicPlayers(): PlayerPublic[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: p.totalScore,
      connected: p.connected,
      isHost: p.id === this.hostId,
    }));
  }

  /** Avvia un nuovo round: genera griglia e azzera i punteggi di round. */
  startRound(): { grid: Grid; endsAt: number } {
    this.currentRound++;
    this.phase = 'playing';
    this.grid = generateGrid(this.gridSize);
    this.roundFoundWords = new Set();
    for (const p of this.players.values()) {
      p.roundScore = 0;
      p.roundWords = new Set();
    }
    this.roundEndsAt = Date.now() + ROUND_DURATION_MS;
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
    if (!this.dictionary.has(normalized)) return { accepted: false, reason: 'Parola non nel dizionario' };
    if (player.roundWords.has(normalized)) return { accepted: false, reason: 'Parola gia\' trovata' };

    const points = scoreForWord(normalized);
    player.roundWords.add(normalized);
    player.roundScore += points;
    player.totalScore += points;
    player.words.push({ word: normalized, points, at: Date.now() });
    this.roundFoundWords.add(normalized);

    return { accepted: true, word: normalized, points };
  }

  /** Chiude il round e produce i risultati ordinati per punteggio. */
  endRound() {
    this.phase = 'roundEnd';
    return [...this.players.values()]
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        roundScore: p.roundScore,
        totalScore: p.totalScore,
        words: [...p.roundWords].sort(),
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

  create(gridSize: GridSize = 4, rounds = 3): Room {
    let room: Room;
    let attempts = 0;
    do {
      room = Room.create(this.dictionary, gridSize, rounds);
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

