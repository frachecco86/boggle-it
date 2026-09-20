import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProfileStore } from './profiles.js';

/**
 * Persistenza su disco: il database deve restare valido anche da solo.
 *
 * Regressione bloccata qui: SQLite in modalità WAL tiene le scritture recenti in
 * `boggle.db-wal`. Senza un checkpoint alla chiusura, `boggle.db` può restare
 * QUASI VUOTO: un backup del solo file principale (o un volume copiato senza i
 * file `-wal`) perderebbe i profili. Verificato: prima della correzione il file
 * non conteneva nemmeno la tabella `profiles`.
 */
describe('ProfileStore su disco', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'boggle-db-'));
    dbPath = path.join(dir, 'boggle.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('consolida il WAL: il file .db basta da solo dopo la chiusura', async () => {
    const store = new ProfileStore(dbPath);
    await store.register('Graceful', 'password1', '🦊');
    store.close();

    // I file di supporto WAL non devono più servire.
    expect(existsSync(`${dbPath}-wal`)).toBe(false);

    // Riaprire il solo file principale deve mostrare i dati.
    const reopened = new ProfileStore(dbPath);
    const profile = await reopened.verify('Graceful', 'password1');
    expect(profile?.nickname).toBe('Graceful');
    reopened.close();
  });

  it('il file principale contiene i dati (non è un guscio vuoto)', async () => {
    const store = new ProfileStore(dbPath);
    await store.register('Contenuto', 'password1', '🐼');
    store.checkpoint();

    // Con il WAL consolidato il file principale supera la sola intestazione.
    expect(statSync(dbPath).size).toBeGreaterThan(8 * 1024);

    const reopened = new ProfileStore(dbPath);
    expect(reopened.getById((await reopened.verify('Contenuto', 'password1'))!.id)).toBeTruthy();
    reopened.close();
  });

  it('sopravvive a più cicli di scrittura e riapertura', async () => {
    for (let i = 0; i < 3; i++) {
      const store = new ProfileStore(dbPath);
      await store.register(`Utente${i}`, 'password1', '🐱');
      store.close();
    }
    const store = new ProfileStore(dbPath);
    for (let i = 0; i < 3; i++) {
      expect(await store.verify(`Utente${i}`, 'password1')).toBeTruthy();
    }
    store.close();
  });

  it('backupTo produce una copia consistente e riutilizzabile', async () => {
    const store = new ProfileStore(dbPath);
    await store.register('DaBackuppare', 'password1', '🚀');
    store.setSfx((await store.verify('DaBackuppare', 'password1'))!.id, '3', Buffer.from('clip'), 'audio/webm', 500);

    const backupPath = path.join(dir, 'backup.db');
    store.backupTo(backupPath);
    store.close();

    expect(existsSync(backupPath)).toBe(true);
    const backup = new ProfileStore(backupPath);
    const restored = await backup.verify('DaBackuppare', 'password1');
    expect(restored?.nickname).toBe('DaBackuppare');
    expect(backup.listSfx(restored!.id)).toHaveLength(1);
    backup.close();
  });

  it('foto e clip restano nel database dopo la chiusura', async () => {
    const store = new ProfileStore(dbPath);
    const profile = await store.register('Risorse', 'password1', '🦊');
    store.setPhoto(profile.id, Buffer.from('finta-foto'), 'image/jpeg');
    store.setSfx(profile.id, '5', Buffer.from('finta-clip'), 'audio/webm', 900);
    store.close();

    const reopened = new ProfileStore(dbPath);
    expect(reopened.getPhoto(profile.id)?.data.toString()).toBe('finta-foto');
    expect(reopened.getSfx(profile.id, '5')?.data.toString()).toBe('finta-clip');
    reopened.close();
  });
});
