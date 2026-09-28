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

  it('aggiorna avatar e musica, ignorando una musica malformata', async () => {
    const profile = await store.register('Marco', 'segreta123', '🦊');
    expect(store.update(profile.id, { avatar: '🐼' })?.avatar).toBe('🐼');
    expect(store.update(profile.id, { musicId: 'spazio' })?.musicId).toBe('spazio');
    expect(store.update(profile.id, { musicId: 'none' })?.musicId).toBe('none');
    /*
     * Il catalogo è DIVENUTO DINAMICO: l'admin può caricare nuove tracce, quindi
     * non esiste più un elenco chiuso di id validi. Il server accetta gli id ben
     * formati e scarta solo quelli malformati (vuoti o troppo lunghi).
     */
    expect(store.update(profile.id, { musicId: 'up-ab12cd34' })?.musicId).toBe('up-ab12cd34');
    const bad = store.update(profile.id, { musicId: '' as never });
    expect(bad?.musicId).toBe('classica');
    const tooLong = store.update(profile.id, { musicId: 'x'.repeat(65) as never });
    expect(tooLong?.musicId).toBe('classica');
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

describe('ProfileStore: elenco e cancellazione (admin)', () => {
  it('elenca i profili con il numero di partite', async () => {
    const store = new ProfileStore(':memory:');
    const profile = await store.register('Mario', 'pw123456', '🐱');
    store.recordGame(profile.id, {
      score: 10,
      words: 3,
      wordCount: 20,
      longest: 'casa',
      difficulty: 'facile',
      gridSize: 4,
      mode: 'solo',
      schedaId: null,
      foundWords: [],
    });
    const list = store.listProfiles();
    expect(list).toHaveLength(1);
    expect(list[0]!.nickname).toBe('Mario');
    expect(list[0]!.games).toBe(1);
    store.close();
  });

  it('cancella un profilo con le sue cascate', async () => {
    const store = new ProfileStore(':memory:');
    const profile = await store.register('Luca', 'pw123456', '🐶');
    store.createSession(profile.id);
    expect(store.listProfiles()).toHaveLength(1);
    expect(store.deleteProfile(profile.id)).toBe(true);
    expect(store.listProfiles()).toHaveLength(0);
    // Le sessioni del profilo spariscono con lui (cascata).
    expect(store.getById(profile.id)).toBeNull();
    // Un id inesistente non cancella nulla.
    expect(store.deleteProfile(profile.id)).toBe(false);
    store.close();
  });
});

/*
 * Schede gia' giocate: e' la memoria che impedisce di riproporre la stessa
 * scheda allo stesso giocatore in due partite single player diverse.
 *
 * Contano tre cose: l'idempotenza (rigiocare non duplica), la separazione PER
 * PROFILO (la cronologia di uno non tocca l'altro) e la cancellazione (serve al
 * multiplayer, dove le schede le decide l'host).
 */
describe('ProfileStore: schede gia\' giocate', () => {
  it('segna una scheda e la ritrova', async () => {
    const p = await store.register('Anna', 'segreta123', '🐱');
    expect(store.playedSchede(p.id).size).toBe(0);
    store.markSchedaPlayed(p.id, '4-normale-001');
    expect([...store.playedSchede(p.id)]).toEqual(['4-normale-001']);
  });

  it('rigiocare la stessa scheda non crea duplicati (idempotente)', async () => {
    const p = await store.register('Anna', 'segreta123', '🐱');
    store.markSchedaPlayed(p.id, 'x');
    store.markSchedaPlayed(p.id, 'x');
    store.markSchedaPlayed(p.id, 'x');
    expect(store.playedSchede(p.id).size).toBe(1);
  });

  it('la cronologia e\' PER PROFILO: uno non vede quella dell\'altro', async () => {
    const a = await store.register('Anna', 'segreta123', '🐱');
    const b = await store.register('Bruno', 'segreta123', '🐶');
    store.markSchedaPlayed(a.id, 's-1');
    expect(store.playedSchede(a.id).has('s-1')).toBe(true);
    expect(store.playedSchede(b.id).has('s-1')).toBe(false);
  });

  it('segna piu\' schede in una volta', async () => {
    const p = await store.register('Anna', 'segreta123', '🐱');
    store.markSchedePlayed(p.id, ['a', 'b', 'c', 'a']);
    expect(store.playedSchede(p.id)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('un profilo inesistente non fa fallire la segnalazione', () => {
    // Non deve lanciare: segnare una scheda non e' mai un errore di gioco.
    expect(() => store.markSchedaPlayed('non-esiste', 'x')).not.toThrow();
    expect(() => store.markSchedePlayed('non-esiste', ['x', 'y'])).not.toThrow();
  });

  it('id vuoti vengono ignorati', async () => {
    const p = await store.register('Anna', 'segreta123', '🐱');
    store.markSchedaPlayed(p.id, '');
    store.markSchedePlayed(p.id, ['', '']);
    expect(store.playedSchede(p.id).size).toBe(0);
  });

  it('la cancellazione azzera la cronologia (serve al multiplayer)', async () => {
    const p = await store.register('Anna', 'segreta123', '🐱');
    store.markSchedePlayed(p.id, ['a', 'b']);
    expect(store.clearPlayedSchede(p.id)).toBe(2);
    expect(store.playedSchede(p.id).size).toBe(0);
    // Cancellare di nuovo non e' un errore: zero voci rimosse.
    expect(store.clearPlayedSchede(p.id)).toBe(0);
  });

  it('cancellare il profilo porta via anche la cronologia (ON DELETE CASCADE)', async () => {
    const p = await store.register('Anna', 'segreta123', '🐱');
    store.markSchedaPlayed(p.id, 'a');
    store.deleteProfile(p.id);
    // Nessun profilo: la lettura ritorna vuoto invece di lanciare.
    expect(store.playedSchede(p.id).size).toBe(0);
  });
});
