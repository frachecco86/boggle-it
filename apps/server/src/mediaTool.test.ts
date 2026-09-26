/**
 * Test del tool di estrazione audio da link.
 *
 * I binari (`yt-dlp`, `ffmpeg`) NON sono richiesti: i test coprono la parte
 * sempre disponibile — validazione dell'URL e messaggio chiaro quando il tool
 * manca. Il download reale si prova a mano dall'admin (dipende dalla rete e da
 * YouTube, non adatto a un test unitario).
 */
import { describe, expect, it } from 'vitest';
import { MediaToolError, validateMediaUrl, hasYtDlp, probeMedia } from './mediaTool.js';

describe('mediaTool: validazione URL', () => {
  it('accetta http e https', () => {
    expect(validateMediaUrl('https://www.youtube.com/watch?v=abc').hostname).toBe('www.youtube.com');
    expect(validateMediaUrl('http://example.com/a.mp3').protocol).toBe('http:');
  });

  it('rifiuta URL senza schema o malformati', () => {
    expect(() => validateMediaUrl('non-un-url')).toThrow(MediaToolError);
    expect(() => validateMediaUrl('')).toThrow(MediaToolError);
  });

  it('rifiuta schemi pericolosi (file:, pipe:)', () => {
    expect(() => validateMediaUrl('file:///etc/passwd')).toThrow(MediaToolError);
    expect(() => validateMediaUrl('pipe:1')).toThrow(MediaToolError);
    // Il codice di errore è quello atteso dal chiamante.
    try {
      validateMediaUrl('file:///etc/passwd');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaToolError);
      expect((err as MediaToolError).code).toBe('invalid-url');
    }
  });
});

describe('mediaTool: binari assenti', () => {
  it('hasYtDlp() ritorna un booleano senza lanciare', async () => {
    expect(typeof (await hasYtDlp())).toBe('boolean');
  });

  it('probeMedia senza yt-dlp dà un errore esplicito, non un crash', async () => {
    if (await hasYtDlp()) return; // ambiente con yt-dlp: si salta il caso
    await expect(probeMedia('https://example.com/x')).rejects.toMatchObject({
      code: 'missing-binary',
    });
  });
});
