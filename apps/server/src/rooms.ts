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
  SchedaMemory,
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
  /**
   * true se il giocatore è **seduto in stanza ma non gioca la partita in corso**.
   *
   * Ci finisce chi arriva quando la partita è già troppo avanti per unirsi (dal
   * round 2) o è già finita: entra lo stesso, guarda la sala d'attesa e gioca la
   * partita successiva. Vale tre cose:
   *  - non può inviare parole (vedi `submitWord`);
   *  - non compare nei risultati di round, nella classifica finale né nelle
   *    partite scritte in classifica (vedi `matchPlayers`);
   *  - non riceve gli eventi del round in corso (vedi `waitingSockets` in
   *    `index.ts`): senza griglia e senza parole altrui non si trova
   *    accidentalmente a giocare — e a leggere le soluzioni — un round che non
   *    ha giocato.
   *
   * Si azzera a `startNewGame`: da lì in poi il giocatore gioca.
   */
  waiting: boolean;
}

/**
 * Dove entra un giocatore NUOVO, cioè chi non ha ancora un `playerId` in quella
 * stanza. Rientrare con il proprio id non passa di qui ed è sempre ammesso
 * (vedi `room:rejoin`).
 *
 *  - `now` → gioca la partita in corso (lobby, primo round e sua pausa);
 *  - `nextMatch` → si siede in stanza e gioca la PARTITA SUCCESSIVA: la partita
 *    corrente è già troppo avanti, o è già finita.
 *
 * Sostituisce il rifiuto della 0.48.0 (`GAME_STARTED` / `GAME_ENDED`): la stanza
 * ora sopravvive alla partita, quindi chi arriva tardi non sente più «partita
 * finita» e non resta fuori: si siede e gioca la rivincita (vedi
 * `Room.seatForNewPlayer`).
 */
export type JoinSeat = 'now' | 'nextMatch';

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
  /**
   * Quale partita sta giocando la stanza: 1 alla prima, +1 a ogni `startNewGame`.
   *
   * La stanza sopravvive alla partita (stesso codice, stessi giocatori), quindi
   * «round 2 di 3» da solo non dice più niente: con due partite in corso serve
   * dire di quale si tratta.
   */
  matchNumber = 1;
  grid: Grid | null = null;
  /** Id della scheda in gioco nel round corrente. */
  schedaId: string | null = null;
  /**
   * Memoria delle schede già viste in questa stanza (a livelli: partita, stanza,
   * passato dei giocatori).
   *
   * Serve a non riproporre la stessa scheda due volte nella stessa partita: i
   * pool sono piccoli (10-15 schede per griglia/difficoltà/variante), quindi su
   * 3 round la probabilità di ripescare per caso una scheda già giocata è del
   * 17-28% circa. Senza questo elenco il server non aveva memoria fra i round.
   *
   * Il livello `match` si azzera a `startNewGame`, il livello `room` NO: è
   * esattamente ciò che rende «schede nuove» una rivincita nella stessa stanza.
   * Il livello `player`, dal 0.50.0, porta le cronologie sommate dei presenti
   * (vedi `syncPlayerMemory`): la griglia è quella che nessuno in stanza ha mai
   * visto e, se non esiste, quella con la somma dei contatori più bassa.
   */
  readonly schedaMemory = new SchedaMemory();
  /**
   * Ultimo momento in cui la stanza ha fatto qualcosa di reale (parola, round,
   * ingresso, nuova partita).
   *
   * `cleanup` lo usa per capire se una stanza è abbandonata: i giocatori possono
   * restare iscritti a una stanza che nessuno guarda più (scheda del telefono che
   * muore in background), e dal 0.49.0 le stanze restano aperte apposta dopo la
   * classifica finale. Senza un orologio di attività una stanza aperta per
   * dimenticanza non si cancellerebbe mai.
   */
  lastActivityAt = Date.now();
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
      waiting: false,
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    this.lastActivityAt = Date.now();
    return player;
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  /**
   * In quale partita entra un giocatore NUOVO.
   *
   * Regola: **si gioca la partita in corso solo se si arriva presto**.
   *
   *  - lobby, o countdown che precede il round 1 → `now` (come sempre);
   *  - **round 1 in corso** → `now`: chi arriva in ritardo gioca il tempo che
   *    resta, con griglia e scadenza re-inviati subito (`resendRoundIfPlaying`);
   *  - pausa dopo il round 1 e countdown del round 2 → `now`: gioca dalla griglia
   *    successiva, con un round intero davanti;
   *  - **dal round 2 in poi**, o **partita già conclusa** → `nextMatch`: si entra
   *    in stanza ma si aspetta la partita dopo.
   *
   * Il confine del round 2 resta, e per lo stesso motivo di sempre: chi entra a
   * questo punto ha già perso un round intero di parole e di raddoppi sulle
   * uniche, e il ritardo di uno non lo paga chi gioca dall'inizio. Cambia cosa
   * succede dopo il «troppo tardi»: la 0.48.0 rispondeva `GAME_STARTED` /
   * `GAME_ENDED` e lasciava la persona fuori dalla stanza; dal 0.49.0 la stanza
   * sopravvive alla partita, quindi chi arriva tardi si siede, vede la sala
   * d'attesa con gli altri e gioca la rivincita da subito (`startNewGame`).
   *
   * La capienza NON si verifica qui: la controlla chi chiama (`room:join` in
   * `index.ts`), così il messaggio dice PERCHÉ non si entra invece di mischiare
   * due motivi diversi.
   */
  seatForNewPlayer(): JoinSeat {
    // Partita conclusa: schermata finale, oppure ultimo round appena chiuso e pausa
    // in corso. Attenzione a `phase === 'playing'`: con un solo round
    // `isGameOver()` è vero MENTRE il round 1 gira, e chi arriva in quel momento
    // deve giocare, non mettersi in attesa.
    const matchOver =
      this.phase === 'gameEnd' || (this.phase !== 'playing' && this.currentRound >= this.rounds);
    if (matchOver) return 'nextMatch';
    return this.currentRound <= 1 ? 'now' : 'nextMatch';
  }

  /** Chi GIOCA la partita in corso: esclude chi è seduto in attesa della prossima. */
  matchPlayers(): Player[] {
    return [...this.players.values()].filter((p) => !p.waiting);
  }

  /**
   * Profili dei giocatori PRESENTI in stanza, senza duplicati.
   *
   * Sono «i presenti», non «chi gioca la partita in corso»: anche chi è seduto
   * in attesa della prossima partita guarda le griglie (e le giocherà tra poco),
   * quindi la sua storia personale conta. Gli anonimi — senza profilo non esiste
   * una cronologia — non compaiono e non influenzano la pesca.
   *
   * L'insieme è anche la risposta al «lo stesso account su due dispositivi»:
   * contato due volte, ogni sua scheda raddoppierebbe il peso e la stanza la
   * eviterebbe più del dovuto.
   */
  profileIds(): string[] {
    const ids = new Set<string>();
    for (const p of this.players.values()) {
      if (p.profileId) ids.add(p.profileId);
    }
    return [...ids];
  }

  /**
   * Ricalcola il livello `player` con le cronologie SOMMATE dei presenti.
   *
   * La stanza non sa leggere SQLite: chi chiama passa una funzione che, data la
   * lista dei profili, risponde con «quante volte ogni scheda è stata vista»
   * sommandoli (nel server è `ProfileStore.playedSchedaCounts`).
   *
   * Si RICALCOLA invece di accumulare, perché il livello dipende da CHI è in
   * stanza: se Dario esce, la sua storia deve uscire con lui (altrimenti la sua
   * cronologia continuerebbe a escludere schede per gente che non c'è più).
   *
   * Va chiamata a ogni **pesca**, non a ogni ingresso/uscita: l'unico
   * consumatore del livello è `pickScheda`, quindi ricalcolarla lì significa
   * essere sempre allineati senza dover ricordare il sync in ogni punto che
   * tocca `players` (e un giocatore entra anche da strade di recupero, dove
   * aggiungerlo sarebbe facile dimenticare).
   *
   * Ritorna quante schede la memoria ha imparato (per i log: 0 = tutti anonimi,
   * e la pesca si comporta come prima della 0.50.0).
   */
  syncPlayerMemory(
    historiesOf: (profileIds: readonly string[]) => ReadonlyMap<string, number>,
  ): number {
    const ids = this.profileIds();
    // Con nessuno loggato il livello va SVUOTATO, non lasciato com'è: chi esce
    // dall'ultima postazione loggata porta via la sua cronologia.
    const counts = ids.length === 0 ? new Map<string, number>() : historiesOf(ids);
    this.schedaMemory.setViews('player', counts);
    return counts.size;
  }

  /**
   * Socket di chi è in attesa della prossima partita.
   *
   * Da escludere dai broadcast del round (`game:roundStart`, `game:playerWord`,
   * `game:roundEnd`, `game:gameEnd`, `game:countdown`): non giocano quel round,
   * e mandarglielo significa far aprire la schermata di gioco a chi non deve
   * giocare e, peggio, fargli leggere le parole di un round a cui non ha
   * partecipato.
   */
  waitingSockets(): string[] {
    return [...this.players.values()]
      .filter((p) => p.waiting && p.socketId)
      .map((p) => p.socketId!);
  }

  /**
   * Ricomincia a giocare nella STESSA stanza: stesso codice, stessi giocatori,
   * stesse impostazioni e stessa musica — partita nuova.
   *
   * Cosa si azzera: i round giocati, i punteggi, le parole, la scheda in gioco e
   * la memoria della partita. Cosa RESTA: l'identità della stanza, l'host, le
   * impostazioni, la musica e la memoria delle schede già viste nella stanza —
   * che è il motivo per cui la rivincita si gioca su griglie nuove.
   *
   * ⚠️ Chiama `recordMultiplayerGames` PRIMA di questo metodo: i punteggi della
   * partita che finisce vivono solo qui dentro e, una volta azzerati, non
   * entrano più in classifica. `gamesPersisted` si azzera qui perché la partita
   * nuova va salvata a sua volta.
   *
   * Non avvia niente: dopo, la stanza è in `lobby` come dopo la creazione, e
   * l'host vede di nuovo «Avvia partita» (potendo cambiare impostazioni fra una
   * partita e l'altra, che prima non si poteva fare).
   */
  startNewGame(): void {
    this.matchNumber++;
    this.currentRound = 0;
    this.phase = 'lobby';
    this.grid = null;
    this.schedaId = null;
    // La scheda scelta in lobby apparteneva alla partita finita: si riparte da
    // una pesca nuova invece di riesumare la griglia di cinque minuti prima.
    this.pendingSchedaId = null;
    this.roundEndsAt = 0;
    this.roundStartedAt = 0;
    this.gamesPersisted = false;
    this.lastActivityAt = Date.now();
    for (const p of this.players.values()) {
      // Chi aspettava una nuova partita, da qui gioca.
      p.waiting = false;
      p.totalScore = 0;
      p.roundScore = 0;
      p.words = [];
      p.roundWords = new Set();
      p.roundTimeline = [];
    }
    // MEMORIA: si azzera solo il livello della partita. Quello della stanza resta:
    // è ciò che fa pescare schede nuove alla rivincita (vedi `SchedaMemory`).
    this.schedaMemory.startMatch();
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
      matchNumber: this.matchNumber,
      players: this.publicPlayers(),
      endsAt: this.phase === 'playing' ? this.roundEndsAt : undefined,
      schedaId: this.schedaId ?? undefined,
      pendingSchedaId: this.pendingSchedaId ?? undefined,
      musicId: this.musicId,
    };
  }

  publicPlayers(): PlayerPublic[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      photoUrl: p.photoUrl ?? undefined,
      profileId: p.profileId ?? undefined,
      sfxSlots: p.sfxSlots.length > 0 ? p.sfxSlots : undefined,
      score: p.totalScore,
      connected: p.connected,
      isHost: p.id === this.hostId,
      waiting: p.waiting || undefined,
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
    // La scheda entra nella memoria della stanza: il prossimo round della stessa
    // partita non la ripesca, e nemmeno la partita dopo nella stessa stanza.
    if (this.schedaId) this.schedaMemory.record(this.schedaId);
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
    this.lastActivityAt = this.roundStartedAt;
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
    // Chi è seduto in attesa della prossima partita non gioca questa: la
    // rifiutiamo qui anche se il client, correttamente, non gli ha nemmeno
    // mandato la griglia (vedi `waitingSockets`).
    if (player.waiting) {
      return { accepted: false, reason: 'Sei in attesa della prossima partita' };
    }
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
    this.lastActivityAt = Date.now();

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
    // Solo chi GIOCA la partita (vedi `matchPlayers`): chi è seduto in attesa non
    // deve comparire in un round a cui non ha partecipato.
    const playing = this.matchPlayers();
    const wordCounts = new Map<string, number>();
    for (const p of playing) {
      for (const w of p.roundWords) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }

    const uniquePerPlayer = new Map<string, string[]>();
    for (const p of playing) {
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

    return playing
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
    // Chi è in attesa della prossima partita non ha giocato questa: niente voce
    // in classifica (il podio sarebbe un elenco di zeri).
    return this.matchPlayers()
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
   * Cambia nome e/o avatar di un giocatore nella stanza.
   *
   * È l'identità EFFIMERA mostrata in partita: aggiorna il `Player` in memoria,
   * non il profilo sul server (il nickname del profilo è l'handle di accesso,
   * con vincolo di unicità). Fino ad ora nome e avatar salivano al server solo a
   * `addPlayer` (creazione/ingresso): modificarli nella sala d'attesa non
   * aggiornava `publicPlayers`, quindi la barra avatar, il podio e i risultati
   * restavano ai valori vecchi.
   *
   * Normalizzazione identica ad `addPlayer` (nome ≤ 20, avatar ≤ 8). Solo un
   * campo presente e non vuoto sovrascrive: un payload parziale non azzera
   * l'altro valore. Ritorna false se il giocatore non è in stanza.
   */
  setIdentity(
    playerId: string,
    patch: { nickname?: string; avatar?: string },
  ): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    const nickname = typeof patch.nickname === 'string' ? patch.nickname.trim() : '';
    if (nickname) player.nickname = nickname.slice(0, 20);
    const avatar = typeof patch.avatar === 'string' ? patch.avatar : '';
    if (avatar) player.avatar = avatar.slice(0, 8);
    this.lastActivityAt = Date.now();
    return true;
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
    this.lastActivityAt = Date.now();
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

  /** Rimuove stanze vuote o abbandonate da troppo tempo. */
  cleanup(now = Date.now()): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const empty = room.players.size === 0;
      /*
       * Stanza abbandonata: nessuno connesso da dieci minuti.
       *
       * Il criterio storico guardava solo `phase === 'gameEnd'` e cinque minuti
       * dall'ultimo round. Non vale più dal 0.49.0, perché una stanza ferma alla
       * classifica finale è proprio il posto dove si decide se giocare ancora: se
       * qualcuno è connesso, quella stanza serve ancora e cancellarla sarebbe
       * «la stanza è stata chiusa» in faccia a chi sta scegliendo. Il rovescio
       * della medaglia: una stanza che sopravvive alla partita può restare aperta
       * per sempre se nessuno esce mai — quindi si misura l'ULTIMA ATTIVITÀ, non
       * la fine dell'ultimo round, e si interviene anche sulle stanze in lobby che
       * nessuno ha più guardato.
       */
      const someoneHere = [...room.players.values()].some((p) => p.connected);
      const abandoned = !someoneHere && now - room.lastActivityAt > 10 * 60_000;
      if (empty || abandoned) {
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }
}

