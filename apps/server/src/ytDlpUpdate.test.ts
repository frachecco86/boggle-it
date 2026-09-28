/**
 * Test dell'aggiornamento automatico di `yt-dlp`.
 *
 * Contano due cose: (1) un fallimento NON deve lanciare — il server parte
 * comunque, e (2) l'aggiornamento non deve partire quando è disattivato o
 * quando `yt-dlp` non c'è. I comandi sono iniettati: niente rete, niente
 * binari richiesti.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { refreshYtDlp } from './ytDlpUpdate.js';

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.YTDLP_AUTO_UPDATE;
  delete process.env.YTDLP_AUTO_UPDATE;
});

afterEach(() => {
  if (saved === undefined) delete process.env.YTDLP_AUTO_UPDATE;
  else process.env.YTDLP_AUTO_UPDATE = saved;
});

describe('refreshYtDlp', () => {
  it('rileva un aggiornamento quando la versione cambia', async () => {
    let v = '2026.01.01';
    const result = await refreshYtDlp({
      readVersion: async () => v,
      run: async () => {
        v = '2026.08.01';
        return 'Updated yt-dlp to version 2026.08.01';
      },
    });
    expect(result.updated).toBe(true);
    expect(result.reason).toBe('updated');
    expect(result.from).toBe('2026.01.01');
    expect(result.to).toBe('2026.08.01');
  });

  it('se la versione non cambia non dichiara un aggiornamento', async () => {
    const result = await refreshYtDlp({
      readVersion: async () => '2026.08.01',
      run: async () => 'yt-dlp is up to date',
    });
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('already-current');
  });

  it('un errore di aggiornamento NON lancia: il server deve partire lo stesso', async () => {
    const result = await refreshYtDlp({
      readVersion: async () => '2026.08.01',
      run: async () => {
        throw new Error('write permission denied');
      },
    });
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('failed');
    expect(result.from).toBe('2026.08.01');
  });

  it('senza yt-dlp non tenta nulla', async () => {
    const result = await refreshYtDlp({
      readVersion: async () => undefined,
      run: async () => {
        throw new Error('non deve essere chiamato');
      },
    });
    expect(result.reason).toBe('unsupported');
    expect(result.from).toBe('sconosciuta');
  });

  it('si disattiva con YTDLP_AUTO_UPDATE=0 (test e filesystem read-only)', async () => {
    process.env.YTDLP_AUTO_UPDATE = '0';
    let called = false;
    const result = await refreshYtDlp({
      readVersion: async () => '2026.08.01',
      run: async () => {
        called = true;
        return '';
      },
    });
    expect(called).toBe(false);
    expect(result.reason).toBe('unsupported');
  });
});
