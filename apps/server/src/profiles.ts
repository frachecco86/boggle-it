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
  MUSIC_IDS,
  SFX_SLOTS,
  type MusicId,
  type ProfilePrivate,
  type ProfileSfx,
  type SfxSlot,
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
  musicId: MusicId | 'none';
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
  update(id: string, patch: { avatar?: string; musicId?: MusicId | 'none' }): StoredProfile | null {
    if (patch.avatar !== undefined) {
      this.db.prepare('UPDATE profiles SET avatar = ? WHERE id = ?').run(patch.avatar, id);
    }
    if (patch.musicId !== undefined) {
      const music = patch.musicId === 'none' || MUSIC_IDS.includes(patch.musicId) ? patch.musicId : DEFAULT_MUSIC_ID;
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
      musicId: (row.music_id as MusicId | 'none') ?? DEFAULT_MUSIC_ID,
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
