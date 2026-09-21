/**
 * Profili persistenti su SQLite (`node:sqlite`, incluso in Node 22+).
 *
 * Perche' SQLite e non un database esterno: un solo file, nessun servizio da
 * gestire, deploy identico in locale e in Docker (basta un volume per il file).
 * Il modulo `node:sqlite` evita qualsiasi dipendenza nativa da compilare.
 *
 * Sicurezza password: `scrypt` (node:crypto) con salt casuale per utente.
 * Non salviamo MAI la password in chiaro ne' con hash reversibili.
 * Il confronto usa `timingSafeEqual`.
 *
 * Foto e audio sono BLOB nel database: restano privati, si fanno il backup con
 * lo stesso file e non serve un object storage.
 */
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_MUSIC_ID,
  LEADERBOARD_LIMIT,
  isMusicChoice,
  SFX_SLOTS,
  type Difficulty,
  type GameMode,
  type GridSize,
  type LeaderboardEntry,
  type LeaderboardFilters,
  type MusicChoice,
  type PlayerStats,
  type ProfilePrivate,
  type ProfileSfx,
  type SfxSlot,
  type SubmitGamePayload,
} from '@boggle/shared';

/** Parametri scrypt: N=16384, r=8, p=1 — robusti ma veloci (~50ms). */
const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export interface StoredProfile {
  id: string;
  nickname: string;
  avatar: string;
  hasPhoto: boolean;
  photoUpdatedAt: number | null;
  musicId: MusicChoice;
  createdAt: number;
}

/**
 * `node:sqlite` caricato via `createRequire`: Vite (usato dai test) non conosce
 * questo builtin recente e ne romperebbe la risoluzione. Con require dinamico il
 * modulo resta esterno sia in Vitest sia nel bundle esbuild.
 */
const require_ = createRequire(import.meta.url);
const { DatabaseSync } = require_('node:sqlite') as typeof import('node:sqlite');
type DatabaseSyncInstance = InstanceType<typeof DatabaseSync>;

interface ProfileRow {
  id: string;
  nickname: string;
  nickname_norm: string;
  pass_salt: Buffer;
  pass_hash: Buffer;
  avatar: string;
  photo: Buffer | null;
  photo_mime: string | null;
  photo_updated_at: number | null;
  music_id: string;
  created_at: number;
}

interface SfxRow {
  slot: string;
  data: Buffer;
  mime: string;
  duration_ms: number;
  updated_at: number;
}

export class ProfileStore {
  private readonly db: DatabaseSyncInstance;

  constructor(filePath: string) {
    if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        nickname_norm TEXT NOT NULL UNIQUE,
        pass_salt BLOB NOT NULL,
        pass_hash BLOB NOT NULL,
        avatar TEXT NOT NULL DEFAULT '🐱',
        photo BLOB,
        photo_mime TEXT,
        photo_updated_at INTEGER,
        music_id TEXT NOT NULL DEFAULT 'classica',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile_sfx (
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        slot TEXT NOT NULL,
        data BLOB NOT NULL,
        mime TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (profile_id, slot)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL
      );
      -- Partite concluse: alimenta la leaderboard. Nickname e avatar sono SNAPSHOT:
      -- la classifica resta leggibile anche se il profilo cambia nome o viene eliminato.
      CREATE TABLE IF NOT EXISTS games (
        id          TEXT PRIMARY KEY,
        profile_id  TEXT REFERENCES profiles(id) ON DELETE CASCADE,
        nickname    TEXT NOT NULL,
        avatar      TEXT NOT NULL DEFAULT '🐱',
        score       INTEGER NOT NULL,
        words       INTEGER NOT NULL,
        word_count  INTEGER NOT NULL DEFAULT 0,
        longest     TEXT NOT NULL DEFAULT '',
        difficulty  TEXT NOT NULL,
        grid_size   INTEGER NOT NULL,
        mode        TEXT NOT NULL DEFAULT 'solo',
        scheda_id   TEXT,
        played_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_games_score ON games(score DESC);
      CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at);
      CREATE INDEX IF NOT EXISTS idx_games_profile ON games(profile_id);
      CREATE INDEX IF NOT EXISTS idx_games_filter ON games(grid_size, difficulty, mode);
      CREATE INDEX IF NOT EXISTS idx_games_longest ON games(length(longest) DESC);
    `);
  }

  /** Nickname normalizzato per il confronto (minuscolo, senza spazi doppi). */
  private static norm(nickname: string): string {
    return nickname.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private static async hashPassword(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      scryptCb(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS, (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      });
    });
  }

  /** Registra un nuovo profilo. Lancia se il nickname è già usato. */
  async register(nickname: string, password: string, avatar: string): Promise<StoredProfile> {
    const norm = ProfileStore.norm(nickname);
    if (this.findByNickname(nickname)) {
      throw new Error('NICKNAME_TAKEN');
    }
    const id = randomUUID();
    const salt = randomBytes(16);
    const hash = await ProfileStore.hashPassword(password, salt);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO profiles (id, nickname, nickname_norm, pass_salt, pass_hash, avatar, music_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, nickname.trim(), norm, salt, hash, avatar, DEFAULT_MUSIC_ID, now);
    return this.getById(id)!;
  }

  /** Verifica le credenziali; ritorna il profilo o null. */
  async verify(nickname: string, password: string): Promise<StoredProfile | null> {
    const row = this.db
      .prepare('SELECT * FROM profiles WHERE nickname_norm = ?')
      .get(ProfileStore.norm(nickname)) as ProfileRow | undefined;
    if (!row) {
      // Confronto fittizio: mantiene il tempo di risposta simile a un utente esistente,
      // così non si può enumerare quali nickname sono registrati.
      await ProfileStore.hashPassword(password, randomBytes(16));
      return null;
    }
    const candidate = await ProfileStore.hashPassword(password, Buffer.from(row.pass_salt));
    const stored = Buffer.from(row.pass_hash);
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return null;
    return this.toStored(row);
  }

  /** Crea un token di sessione persistente. */
  createSession(profileId: string): string {
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare('INSERT INTO sessions (token, profile_id, created_at) VALUES (?, ?, ?)')
      .run(token, profileId, Date.now());
    return token;
  }

  /** Invalida un token (logout). */
  destroySession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  /** Profilo associato a un token, o null. */
  getByToken(token: string): StoredProfile | null {
    const row = this.db
      .prepare(
        `SELECT p.* FROM sessions s JOIN profiles p ON p.id = s.profile_id WHERE s.token = ?`,
      )
      .get(token) as ProfileRow | undefined;
    return row ? this.toStored(row) : null;
  }

  getById(id: string): StoredProfile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as
      | ProfileRow
      | undefined;
    return row ? this.toStored(row) : null;
  }

  private findByNickname(nickname: string): ProfileRow | undefined {
    return this.db
      .prepare('SELECT * FROM profiles WHERE nickname_norm = ?')
      .get(ProfileStore.norm(nickname)) as ProfileRow | undefined;
  }

  /** Aggiorna avatar e/o musica. */
  update(id: string, patch: { avatar?: string; musicId?: MusicChoice }): StoredProfile | null {
    if (patch.avatar !== undefined) {
      this.db.prepare('UPDATE profiles SET avatar = ? WHERE id = ?').run(patch.avatar, id);
    }
    if (patch.musicId !== undefined) {
      // Accettiamo qualsiasi id ben formato: il catalogo può contenere tracce
      // caricate dall'admin a runtime, quindi non esiste un elenco fisso di id
      // validi. `isMusicChoice` valida la FORMA ('none' o stringa breve).
      const music = isMusicChoice(patch.musicId) ? patch.musicId : DEFAULT_MUSIC_ID;
      this.db.prepare('UPDATE profiles SET music_id = ? WHERE id = ?').run(music, id);
    }
    return this.getById(id);
  }

  /* ---------------- Foto ---------------- */

  setPhoto(id: string, data: Buffer, mime: string): number {
    const now = Date.now();
    this.db
      .prepare('UPDATE profiles SET photo = ?, photo_mime = ?, photo_updated_at = ? WHERE id = ?')
      .run(data, mime, now, id);
    return now;
  }

  getPhoto(id: string): { data: Buffer; mime: string; updatedAt: number } | null {
    const row = this.db
      .prepare('SELECT photo, photo_mime, photo_updated_at FROM profiles WHERE id = ?')
      .get(id) as { photo: Buffer | null; photo_mime: string | null; photo_updated_at: number | null } | undefined;
    if (!row?.photo) return null;
    return {
      data: Buffer.from(row.photo),
      mime: row.photo_mime ?? 'image/jpeg',
      updatedAt: row.photo_updated_at ?? 0,
    };
  }

  clearPhoto(id: string): void {
    this.db.prepare('UPDATE profiles SET photo = NULL, photo_mime = NULL, photo_updated_at = NULL WHERE id = ?').run(id);
  }

  /* ---------------- Clip audio ---------------- */

  setSfx(id: string, slot: SfxSlot, data: Buffer, mime: string, durationMs: number): ProfileSfx {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO profile_sfx (profile_id, slot, data, mime, duration_ms, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, slot) DO UPDATE SET
           data = excluded.data, mime = excluded.mime,
           duration_ms = excluded.duration_ms, updated_at = excluded.updated_at`,
      )
      .run(id, slot, data, mime, Math.max(0, Math.round(durationMs)), now);
    return { slot, url: `/profiles/${id}/sfx/${slot}`, durationMs, updatedAt: now };
  }

  getSfx(id: string, slot: SfxSlot): { data: Buffer; mime: string; durationMs: number } | null {
    const row = this.db
      .prepare('SELECT data, mime, duration_ms FROM profile_sfx WHERE profile_id = ? AND slot = ?')
      .get(id, slot) as Pick<SfxRow, 'data' | 'mime' | 'duration_ms'> | undefined;
    if (!row) return null;
    return { data: Buffer.from(row.data), mime: row.mime, durationMs: row.duration_ms };
  }

  deleteSfx(id: string, slot: SfxSlot): void {
    this.db.prepare('DELETE FROM profile_sfx WHERE profile_id = ? AND slot = ?').run(id, slot);
  }

  listSfx(id: string): ProfileSfx[] {
    const rows = this.db
      .prepare('SELECT slot, mime, duration_ms, updated_at FROM profile_sfx WHERE profile_id = ?')
      .all(id) as Array<Pick<SfxRow, 'slot' | 'mime' | 'duration_ms' | 'updated_at'>>;
    const out: ProfileSfx[] = [];
    for (const slot of SFX_SLOTS) {
      const row = rows.find((r) => r.slot === slot);
      if (!row) continue;
      out.push({
        slot,
        url: `/profiles/${id}/sfx/${slot}`,
        durationMs: row.duration_ms,
        updatedAt: row.updated_at,
      });
    }
    return out;
  }

  /* ---------------- Mappatura ---------------- */

  private toStored(row: ProfileRow): StoredProfile {
    return {
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      hasPhoto: row.photo !== null,
      photoUpdatedAt: row.photo_updated_at,
      musicId: (row.music_id as MusicChoice) ?? DEFAULT_MUSIC_ID,
      createdAt: row.created_at,
    };
  }

  /**
   * Profilo completo per il proprietario (foto e audio inclusi come URL).
   * Rilegge lo stato dal database: chi chiama può passare uno snapshot vecchio
   * (es. dopo un upload) e otterrebbe `hasPhoto` non aggiornato.
   */
  toPrivate(snapshot: StoredProfile): ProfilePrivate {
    const row = this.getById(snapshot.id) ?? snapshot;
    return {
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar,
      hasPhoto: row.hasPhoto,
      photoUrl: row.hasPhoto ? `/profiles/${row.id}/photo?v=${row.photoUpdatedAt ?? 0}` : undefined,
      photoUpdatedAt: row.photoUpdatedAt ?? undefined,
      createdAt: row.createdAt,
      sfx: this.listSfx(row.id),
      musicId: row.musicId,
    };
  }

  /**
   * Consolida il WAL nel file principale (`boggle.db`).
   *
   * Con la modalita' WAL le scritture recenti vivono in `boggle.db-wal`: un backup
   * o una copia del solo `boggle.db` perderebbe i dati. `TRUNCATE` scrive tutto nel
   * file principale e azzera il -wal, quindi il DB resta valido anche da solo.
   */
  /* ------------------------------------------------------------------ */
  /* Partite e leaderboard                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Registra una partita conclusa. Ritorna l'id assegnato.
   *
   * Nickname e avatar vengono copiati come snapshot: se il profilo cambia nome
   * o viene eliminato, la classifica resta leggibile.
   */
  recordGame(profileId: string, payload: SubmitGamePayload): string {
    const profile = this.getById(profileId);
    if (!profile) throw new Error('Profilo non trovato');
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO games
           (id, profile_id, nickname, avatar, score, words, word_count, longest,
            difficulty, grid_size, mode, scheda_id, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        profileId,
        profile.nickname,
        profile.avatar,
        Math.round(payload.score),
        Math.round(payload.words),
        Math.round(payload.wordCount),
        payload.longest.slice(0, 32),
        payload.difficulty,
        payload.gridSize,
        payload.mode,
        payload.schedaId ?? null,
        Date.now(),
      );
    return id;
  }

  /**
   * Calcola la classifica secondo i filtri.
   *
   * Le tre classifiche:
   *  - `best`:    punteggio più alto in una singola partita
   *  - `total`:   somma dei punteggi di tutte le partite (solo single player)
   *  - `longest`: parola più lunga mai trovata
   */
  leaderboard(filters: LeaderboardFilters): { entries: LeaderboardEntry[]; gamesConsidered: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];

    // La classifica "totali" somma le partite: solo single player, perché le partite
    // multiplayer non hanno un punteggio confrontabile (dipendono dagli avversari).
    if (filters.kind === 'total') where.push("mode = 'solo'");
    if (filters.gridSize) {
      where.push('grid_size = ?');
      params.push(filters.gridSize);
    }
    if (filters.difficulty) {
      where.push('difficulty = ?');
      params.push(filters.difficulty);
    }
    if (filters.period !== 'all') {
      const days = filters.period === 'week' ? 7 : 30;
      where.push('played_at >= ?');
      params.push(Date.now() - days * 24 * 60 * 60 * 1000);
    }
    // partite valide: almeno una parola trovata (esclude partite abbandonate)
    where.push('words > 0');

    const whereSql = where.join(' AND ');
    const limit = LEADERBOARD_LIMIT;

    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM games WHERE ${whereSql}`)
      .get(...params) as { n: number } | undefined;
    const gamesConsidered = countRow?.n ?? 0;

    if (filters.kind === 'total') {
      const rows = this.db
        .prepare(
          `SELECT profile_id, nickname, avatar,
                  SUM(score) AS value, COUNT(*) AS games,
                  MAX(score) AS best, MAX(played_at) AS played_at
             FROM games
            WHERE ${whereSql}
            GROUP BY profile_id
            ORDER BY value DESC, best DESC
            LIMIT ?`,
        )
        .all(...params, limit) as Array<{
        profile_id: string;
        nickname: string;
        avatar: string;
        value: number;
        games: number;
        best: number;
        played_at: number;
      }>;

      return {
        entries: rows.map((r, i) => ({
          rank: i + 1,
          profileId: r.profile_id,
          nickname: r.nickname,
          avatar: r.avatar,
          value: r.value,
          score: r.best,
          words: 0,
          longest: '',
          gridSize: filters.gridSize ?? 4,
          difficulty: filters.difficulty ?? 'normale',
          playedAt: r.played_at,
          games: r.games,
        })),
        gamesConsidered,
      };
    }

    // `best` e `longest`: una riga per partita, la migliore per giocatore vince.
    const orderBy =
      filters.kind === 'longest' ? 'LENGTH(longest) DESC, score DESC' : 'score DESC, words DESC';
    const rows = this.db
      .prepare(
        `SELECT profile_id, nickname, avatar, score, words, longest,
                grid_size, difficulty, played_at, LENGTH(longest) AS longest_len
           FROM games
          WHERE ${whereSql}
          ORDER BY ${orderBy}
          LIMIT ?`,
      )
      .all(...params, limit) as Array<{
      profile_id: string;
      nickname: string;
      avatar: string;
      score: number;
      words: number;
      longest: string;
      grid_size: number;
      difficulty: string;
      played_at: number;
      longest_len: number;
    }>;

    const seen = new Set<string>();
    const entries: LeaderboardEntry[] = [];
    for (const r of rows) {
      if (seen.has(r.profile_id)) continue;
      seen.add(r.profile_id);
      entries.push({
        rank: entries.length + 1,
        profileId: r.profile_id,
        nickname: r.nickname,
        avatar: r.avatar,
        value: filters.kind === 'longest' ? r.longest_len : r.score,
        score: r.score,
        words: r.words,
        longest: r.longest,
        gridSize: r.grid_size as GridSize,
        difficulty: r.difficulty as Difficulty,
        playedAt: r.played_at,
      });
    }
    return { entries, gamesConsidered };
  }

  /** Statistiche personali di un profilo. */
  playerStats(profileId: string): PlayerStats {
    const agg = this.db
      .prepare(
        `SELECT COUNT(*) AS games,
                COALESCE(MAX(score), 0) AS best,
                COALESCE(SUM(score), 0) AS total,
                COALESCE(SUM(words), 0) AS words
           FROM games WHERE profile_id = ?`,
      )
      .get(profileId) as { games: number; best: number; total: number; words: number } | undefined;

    const longestRow = this.db
      .prepare(
        `SELECT longest FROM games
          WHERE profile_id = ? AND longest <> ''
          ORDER BY LENGTH(longest) DESC LIMIT 1`,
      )
      .get(profileId) as { longest: string } | undefined;

    const games = agg?.games ?? 0;
    const bestScore = agg?.best ?? 0;

    // Posizione nella classifica globale: quanti giocatori DISTINTI hanno un
    // miglior punteggio superiore, più uno.
    let bestRank = 0;
    if (games > 0) {
      const row = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM (
             SELECT profile_id, MAX(score) AS best FROM games GROUP BY profile_id
           ) WHERE best > ?`,
        )
        .get(bestScore) as { n: number } | undefined;
      bestRank = (row?.n ?? 0) + 1;
    }

    return {
      games,
      bestScore,
      totalScore: agg?.total ?? 0,
      totalWords: agg?.words ?? 0,
      avgScore: games > 0 ? Math.round((agg?.total ?? 0) / games) : 0,
      longest: longestRow?.longest ?? '',
      bestRank,
    };
  }

  /**
   * Record di una scheda: miglior punteggio mai realizzato, chi lo detiene e
   * quante partite sono state giocate. Alimenta l'anteprima della scheda.
   */
  schedaRecord(schedaId: string): {
    record: { score: number; nickname: string; avatar: string; playedAt: number } | null;
    gamesPlayed: number;
  } {
    const best = this.db
      .prepare(
        `SELECT score, nickname, avatar, played_at FROM games
          WHERE scheda_id = ? AND words > 0
          ORDER BY score DESC, played_at ASC LIMIT 1`,
      )
      .get(schedaId) as
      | { score: number; nickname: string; avatar: string; played_at: number }
      | undefined;

    const countRow = this.db
      .prepare('SELECT COUNT(*) AS n FROM games WHERE scheda_id = ? AND words > 0')
      .get(schedaId) as { n: number } | undefined;

    return {
      record: best
        ? {
            score: best.score,
            nickname: best.nickname,
            avatar: best.avatar,
            playedAt: best.played_at,
          }
        : null,
      gamesPlayed: countRow?.n ?? 0,
    };
  }

  /** Cancella le partite di un profilo (test e privacy). */
  clearGames(profileId: string): number {
    const res = this.db.prepare('DELETE FROM games WHERE profile_id = ?').run(profileId);
    return Number(res.changes ?? 0);
  }

  /** Cancella TUTTE le partite (es. pulizia della classifica dall'admin). */
  clearAllGames(): number {
    const res = this.db.prepare('DELETE FROM games').run();
    return Number(res.changes ?? 0);
  }

  /**
   * Registra le partite di UNA partita multiplayer, una riga per giocatore
   * con profilo.
   *
   * Perché sul server e non nel client: il punteggio autoritativo e la parola
   * più lunga vivono qui, e così basta una sola chiamata per l'intera partita.
   * Le parole sono per-round e vengono azzerate a ogni `startRound`, quindi la
   * somma delle parole è il totale della partita.
   */
  recordMultiplayerGames(
    entries: Array<{
      profileId: string;
      score: number;
      words: number;
      longest: string;
    }>,
    meta: { difficulty: Difficulty; gridSize: GridSize; schedaId: string | null },
  ): number {
    let saved = 0;
    for (const entry of entries) {
      const profile = this.getById(entry.profileId);
      // Profilo eliminato nel frattempo: la partita non è attribuibile, la saltiamo.
      if (!profile) continue;
      this.recordGame(entry.profileId, {
        score: Math.min(Math.max(0, Math.round(entry.score)), 5000),
        words: Math.min(Math.max(0, Math.round(entry.words)), 1000),
        // Il numero di parole possibili sulla scheda non è disponibile qui:
        // 0 significa "non noto" e non influisce sulla classifica.
        wordCount: 0,
        longest: entry.longest.slice(0, 32),
        difficulty: meta.difficulty,
        gridSize: meta.gridSize,
        mode: 'multi',
        schedaId: meta.schedaId,
      });
      saved++;
    }
    return saved;
  }

  checkpoint(): void {
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  /** Copia di sicurezza CONSISTENTE (include WAL): usa VACUUM INTO di SQLite. */
  backupTo(filePath: string): void {
    this.db.exec(`VACUUM INTO '${filePath.replace(/'/g, "''")}'`);
  }

  /**
   * Metriche del database, per diagnosi e verifica dei backup.
   * `walBytes` > 0 significa scritture non ancora consolidate nel file principale.
   */
  stats(): {
    file: string;
    profiles: number;
    dbBytes: number;
    walBytes: number;
    journalMode: string;
  } {
    const row = this.db.prepare('PRAGMA database_list').all() as Array<{ file?: string }>;
    const file = row.find((r) => r.file)?.file ?? '';
    const count = this.db.prepare('SELECT count(*) AS n FROM profiles').get() as { n: number };
    const mode = this.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    const size = (p: string) => {
      try {
        return statSync(p).size;
      } catch {
        return 0;
      }
    };
    return {
      file,
      profiles: count.n,
      dbBytes: size(file),
      walBytes: file ? size(`${file}-wal`) : 0,
      journalMode: mode.journal_mode,
    };
  }

  close(): void {
    // Consolidamento prima della chiusura: il file .db resta autosufficiente.
    try {
      this.checkpoint();
    } catch {
      /* se fallisce, la chiusura avviene comunque */
    }
    this.db.close();
  }
}
