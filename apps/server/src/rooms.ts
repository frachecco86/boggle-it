import {
  acceptedWords,
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
  type MusicChoice,
  type PlayerPublic,
  type RoomState,
  type Scheda,
  type SchedaVariant,
  type SfxSlot,
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
  /**
   * Fasce di lunghezza per cui il giocatore ha una clip audio registrata.
   * Il contenuto delle clip non è pubblico: chi è in stanza scarica le clip
   * del proprietario solo mentre la partita è in corso (vedi `index.ts`).
   */
  sfxSlots: SfxSlot[];
  totalScore: number;
  roundScore: number;
  /**
   * Tutte le parole trovate nella PARTITA, in ordine cronologico.
   *
   * `at` è misurato dall'inizio del round (vedi `roundStartedAt`), non è un
   * timestamp assoluto: il client non deve conoscere l'orologio del server.
   * Alimenta il riepilogo "arcade" (replay della partita).
   */
  words: FoundWord[];
  roundWords: Set<string>;
  /**
   * Parole del round CORRENTE, in ordine cronologico.
   * Separata da `words` perché la timeline del riepilogo di round deve contenere
   * solo le parole di quel round, mentre `words` accumula l'intera partita.
   */
  roundTimeline: FoundWord[];
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
  /**
   * Insieme di criteri delle schede di questa stanza: `standard` o `full`
   * (vedi `Scheda.variant`). L'host lo sceglie creando la stanza o dalla lobby.
   */
  schedaVariant: SchedaVariant = 'standard';
  currentRound = 0;
  phase: RoomState['phase'] = 'lobby';
  grid: Grid | null = null;
  /** Id della scheda in gioco nel round corrente. */
  schedaId: string | null = null;
  /**
   * Scheda scelta in lobby per il prossimo round.
   * Persiste fra i round finché l'host non ne pesca un'altra.
   */
  pendingSchedaId: string | null = null;
  /**
   * Musica di sottofondo scelta dall'HOST, valida per tutta la stanza.
   * In lobby la cambia l'host; durante la partita resta quella scelta.
   */
  musicId: MusicChoice = DEFAULT_MUSIC_ID;
  roundEndsAt = 0;
  /**
   * Momento (ms epoch, orologio server) in cui è iniziato il round corrente.
   * Serve a calcolare `at` delle parole come offset dall'inizio del round.
   */
  roundStartedAt = 0;

  /**
   * true quando la partita è conclusa ma le partite NON sono ancora state
   * registrate per la classifica. Serve a salvare anche chi abbandona la stanza
   * durante la pausa tra l'ultimo round e la schermata finale (dove la UI mostra
   * già i risultati, ma il timer del server non ha ancora scritto sul database).
   */
  gamesPersisted = false;
  players = new Map<string, Player>();
  /** Tutte le parole valide trovate nel round corrente (per il riepilogo mancate). */
  roundFoundWords = new Set<string>();
  /**
   * Tutte le parole ACCETTATE sulla griglia del round corrente.
   *
   * Sono pre-calcolate nella scheda (`allWords`, dizionario intero): nessun
   * solver a runtime. Con le schede di formato 1 valgono le sole parole attese.
   */
  roundValidWords: Set<string> = new Set();
  /**
   * Parole ATTESE della fascia di difficoltà: quelle che il riepilogo mostra come
   * "parole che esistevano". È un sottoinsieme di `roundValidWords`.
   */
  roundExpectedWords: Set<string> = new Set();

  private readonly dictionary: Dictionary;

  constructor(
    code: string,
    dictionary: Dictionary,
    gridSize: GridSize = 4,
    rounds = 3,
    difficulty: Difficulty = 'normale',
    roundDurationMs: number = DEFAULT_ROUND_DURATION_MS,
    maxPlayers: number = 8,
    /** Insieme di criteri delle schede della stanza (standard / full criteria). */
    schedaVariant: SchedaVariant = 'standard',
  ) {
    this.code = code;
    this.hostId = '';
    this.gridSize = gridSize;
    this.rounds = rounds;
    this.difficulty = difficulty;
    this.roundDurationMs = roundDurationMs;
    this.maxPlayers = maxPlayers;
    this.schedaVariant = schedaVariant;
    this.dictionary = dictionary;
  }

  static create(
    dictionary: Dictionary,
    gridSize: GridSize,
    rounds: number,
    difficulty: Difficulty = 'normale',
    roundDurationMs: number = DEFAULT_ROUND_DURATION_MS,
    maxPlayers: number = 8,
    schedaVariant: SchedaVariant = 'standard',
  ): Room {
    return new Room(
      generateRoomCode(),
      dictionary,
      gridSize,
      rounds,
      difficulty,
      roundDurationMs,
      maxPlayers,
      schedaVariant,
    );
  }

  addPlayer(
    id: string,
    nickname: string,
    avatar = '🐱',
    profile?: { id: string; photoUrl: string | null; sfxSlots?: SfxSlot[] } | null,
  ): Player {
    const player: Player = {
      id,
      socketId: null,
      nickname: nickname.trim().slice(0, 20) || 'Giocatore',
      avatar: String(avatar || '🐱').slice(0, 8),
      profileId: profile?.id ?? null,
      photoUrl: profile?.photoUrl ?? null,
      sfxSlots: profile?.sfxSlots ?? [],
      totalScore: 0,
      roundScore: 0,
      words: [],
      roundWords: new Set(),
      roundTimeline: [],
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
      schedaVariant: this.schedaVariant,
      currentRound: this.currentRound,
      phase: this.phase,
      players: this.publicPlayers(),
      endsAt: this.phase === 'playing' ? this.roundEndsAt : undefined,
      schedaId: this.schedaId ?? undefined,
      pendingSchedaId: this.pendingSchedaId ?? undefined,
      musicId: this.musicId,
    };
  }

  publicPlayers(): PlayerPublic[] {    return [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      photoUrl: p.photoUrl ?? undefined,
      profileId: p.profileId ?? undefined,
      sfxSlots: p.sfxSlots.length > 0 ? p.sfxSlots : undefined,
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
    this.roundValidWords = new Set(scheda ? acceptedWords(scheda) : []);
    this.roundExpectedWords = new Set(scheda?.words ?? []);
    this.roundFoundWords = new Set();
    for (const p of this.players.values()) {
      p.roundScore = 0;
      p.roundWords = new Set();
      p.roundTimeline = [];
    }
    this.roundStartedAt = Date.now();
    this.roundEndsAt = this.roundStartedAt + this.roundDurationMs;
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
    // Validazione contro l'insieme ACCETTATO della scheda (dizionario intero):
    // una parola rara fuori fascia vale lo stesso. È la stessa fonte usata dal
    // client, quindi non ci sono divergenze. Fallback al dizionario per le
    // stanze avviate senza scheda (test o catalogo vuoto).
    const validOnScheda =
      this.roundValidWords.size > 0
        ? this.roundValidWords.has(normalized)
        : this.dictionary.has(normalized);
    if (!validOnScheda) {
      return {
        accepted: false,
        reason: this.roundValidWords.size > 0 ? 'Non componibile su questa griglia' : 'Parola non nel dizionario',
      };
    }
    if (player.roundWords.has(normalized)) return { accepted: false, reason: 'Parola gia\' trovata' };

    const points = scoreForWord(normalized);
    player.roundWords.add(normalized);
    player.roundScore += points;
    player.totalScore += points;
    // `at` è un OFFSET dall'inizio del round: il client non deve conoscere
    // l'orologio del server. Minimo 0 per sicurezza.
    const at = Math.max(0, Date.now() - this.roundStartedAt);
    const found: FoundWord = { word: normalized, points, at };
    player.words.push(found);
    player.roundTimeline.push(found);
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
        // Le parole del round in ordine cronologico: il client le accende una
        // alla volta nel riepilogo "arcade". I punti e il flag `unique` sono già
        // definitivi perché `roundTimeline` referenzia gli stessi oggetti di
        // `words`, aggiornati dal raddoppio qui sopra.
        timeline: this.roundTimelineFor(p),
      }))
      .sort((a, b) => b.roundScore - a.roundScore || a.nickname.localeCompare(b.nickname));
  }

  /**
   * Timeline del round corrente per un giocatore, ordinata per momento di
   * scoperta. Estratta perché usata sia nel riepilogo di round sia in quello
   * finale (dove serve la timeline dell'ULTIMO round).
   */
  private roundTimelineFor(p: Player) {
    return [...p.roundTimeline]
      .sort((a, b) => a.at - b.at)
      .map((w) => ({ word: w.word, points: w.points, at: w.at, unique: w.unique }));
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
  setMusic(choice: MusicChoice): void {
    if (isMusicChoice(choice)) this.musicId = choice;
  }

  /**
   * true se la traccia scelta esiste ancora nel catalogo.
   *
   * Serve perché l'admin può CANCELLARE una traccia caricata: una stanza che la
   * stava usando resterebbe con un id non più valido e il client non troverebbe
   * il file. In quel caso si torna alla traccia predefinita.
   */
  /**
   * Garantisce che la traccia scelta sia ancora suonabile.
   *
   * Due casi da coprire:
   *  - la traccia è stata CANCELLATA dall'admin;
   *  - la traccia è stata DISABILITATA (o è una di quelle incluse nel bundle, che
   *    prima si consideravano sempre valide).
   * In entrambi si passa a una traccia attiva, così nessuno resta in silenzio.
   */
  ensureMusicExists(isPlayable: (id: string) => boolean, fallbackId?: string): void {
    if (this.musicId === 'none') return;
    if (isPlayable(this.musicId)) return;
    // `fallbackId` è la prima traccia attiva secondo il server; se manca (vecchie
    // chiamate) si usa la predefinita, che è sempre nel bundle.
    this.musicId = fallbackId ?? DEFAULT_MUSIC_ID;
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
    schedaVariant: SchedaVariant = 'standard',
  ): Room {
    let room: Room;
    let attempts = 0;
    do {
      room = Room.create(
        this.dictionary,
        gridSize,
        rounds,
        difficulty,
        roundDurationMs,
        maxPlayers,
        schedaVariant,
      );
      attempts++;
    } while (this.rooms.has(room.code) && attempts < 200);
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /**
   * true se `profileId` sta giocando in una stanza INSIEME a `otherProfileId`.
   *
   * Serve per l'accesso alle clip audio: le registrazioni restano private, ma
   * chi condivide la partita con il proprietario può sentirle (a volume ridotto)
   * quando l'altro trova una parola. Basta essere nella stessa stanza, in
   * qualsiasi fase: l'host le scarica già in lobby.
   */
  sharesRoomWith(profileId: string, otherProfileId: string): boolean {
    if (profileId === otherProfileId) return true;
    for (const room of this.rooms.values()) {
      const players = [...room.players.values()];
      if (
        players.some((p) => p.profileId === profileId) &&
        players.some((p) => p.profileId === otherProfileId)
      ) {
        return true;
      }
    }
    return false;
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  /** Tutte le stanze attive (per operazioni globali, come un cambio di playlist). */
  all(): Room[] {
    return [...this.rooms.values()];
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

