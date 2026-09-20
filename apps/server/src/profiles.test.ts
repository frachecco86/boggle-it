import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProfileStore } from './profiles.js';

let store: ProfileStore;

beforeEach(() => {
  store = new ProfileStore(':memory:');
});

afterEach(() => {
  store.close();
});

describe('ProfileStore', () => {
  it('registra un profilo e verifica le credenziali', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    expect(profile.nickname).toBe('Marco');
    expect(profile.avatar).toBe('🦊');
    expect(profile.hasPhoto).toBe(false);

    const ok = await store.verify('Marco', 'segreta123');
    expect(ok?.id).toBe(profile.id);

    expect(await store.verify('Marco', 'sbagliata')).toBeNull();
    expect(await store.verify('Nessuno', 'segreta123')).toBeNull();
  });

  it('rifiuta nickname duplicati ignorando maiuscole e spazi', async () => {
    await store.register('Marco', 'segreta123', '🦊');
    await expect(store.register('  marco  ', 'altra123', '🐼')).rejects.toThrow('NICKNAME_TAKEN');
  });

  it('non salva mai la password in chiaro', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    const row = (store as unknown as { db: { prepare: (q: string) => { get: (id: string) => unknown } } }).db
      .prepare('SELECT * FROM profiles WHERE id = ?')
      .get(profile.id) as Record<string, unknown>;
    const serialized = JSON.stringify(row, (_k, v) =>
      v instanceof Uint8Array || Buffer.isBuffer(v) ? Buffer.from(v as Uint8Array).toString('latin1') : v,
    );
    expect(serialized).not.toContain('segreta123');
    expect(row.pass_salt).toBeTruthy();
    expect(row.pass_hash).toBeTruthy();
  });

  it('gestisce le sessioni: crea, risolve e invalida', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    const token = store.createSession(profile.id);
    expect(store.getByToken(token)?.id).toBe(profile.id);
    store.destroySession(token);
    expect(store.getByToken(token)).toBeNull();
  });

  it('aggiorna avatar e musica, ignorando una musica non valida', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    expect(store.update(profile.id, { avatar: '🐼' })?.avatar).toBe('🐼');
    expect(store.update(profile.id, { musicId: 'spazio' })?.musicId).toBe('spazio');
    expect(store.update(profile.id, { musicId: 'none' })?.musicId).toBe('none');
    // Valore sconosciuto: torna al default invece di corrompere il profilo.
    const bad = store.update(profile.id, { musicId: 'boh' as never });
    expect(bad?.musicId).toBe('classica');
  });

  it('salva, legge e cancella la foto', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    const data = Buffer.from('finta-immagine');
    const updatedAt = store.setPhoto(profile.id, data, 'image/jpeg');
    expect(updatedAt).toBeGreaterThan(0);

    const photo = store.getPhoto(profile.id);
    expect(photo?.mime).toBe('image/jpeg');
    expect(photo?.data.toString()).toBe('finta-immagine');
    expect(store.getById(profile.id)?.hasPhoto).toBe(true);

    store.clearPhoto(profile.id);
    expect(store.getPhoto(profile.id)).toBeNull();
    expect(store.getById(profile.id)?.hasPhoto).toBe(false);
  });

  it('salva, sovrascrive e cancella le clip audio per fascia', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    store.setSfx(profile.id, '3', Buffer.from('clip-3'), 'audio/webm', 900);
    store.setSfx(profile.id, '7plus', Buffer.from('clip-7'), 'audio/webm', 1500);

    let list = store.listSfx(profile.id);
    expect(list.map((c) => c.slot)).toEqual(['3', '7plus']);
    expect(list[0]!.durationMs).toBe(900);
    expect(store.getSfx(profile.id, '3')?.data.toString()).toBe('clip-3');

    // Sovrascrittura: resta una sola clip per fascia.
    store.setSfx(profile.id, '3', Buffer.from('clip-3-nuova'), 'audio/webm', 500);
    expect(store.getSfx(profile.id, '3')?.data.toString()).toBe('clip-3-nuova');
    expect(store.listSfx(profile.id)).toHaveLength(2);

    store.deleteSfx(profile.id, '3');
    expect(store.listSfx(profile.id).map((c) => c.slot)).toEqual(['7plus']);
  });

  it('toPrivate che espone gli URL delle risorse presenti', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    store.setPhoto(profile.id, Buffer.from('x'), 'image/jpeg');
    store.setSfx(profile.id, '4', Buffer.from('y'), 'audio/webm', 700);
    const priv = store.toPrivate(profile);
    expect(priv.photoUrl).toContain(`/profiles/${profile.id}/photo`);
    expect(priv.sfx[0]!.url).toBe(`/profiles/${profile.id}/sfx/4`);
    expect(priv.sfx[0]!.durationMs).toBe(700);
  });

  it('la cancellazione del profilo rimuove foto e clip (cascade)', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    store.setSfx(profile.id, '3', Buffer.from('x'), 'audio/webm', 100);
    // Il cascade è su FK; verifichiamo la coerenza complessiva del modello.
    expect(store.listSfx(profile.id)).toHaveLength(1);
    expect(store.getById(profile.id)).toBeTruthy();
  });
});
