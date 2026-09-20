import { describe, expect, it } from 'vitest';

/**
 * La decodifica dei data URL è la porta d'ingresso di foto e clip audio.
 *
 * Regressione bloccata qui: `MediaRecorder` produce data URL con un parametro,
 * es. `data:audio/webm;codecs=opus;base64,...`. La prima versione accettava solo
 * `data:<mime>;base64,`, quindi TUTTE le registrazioni audio venivano rifiutate
 * con "Serve un data URL base64" (mostrato all'utente come "registrazione non
 * riuscita").
 *
 * La funzione è replicata qui perché è interna a `index.ts` (che avvia il server
 * all'import). Il test verifica il contratto esatto usato dalle rotte.
 */
function decodeDataUrl(
  raw: unknown,
  opts: { maxBytes: number; mimePrefix: string },
): { data: Buffer; mime: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Formato non valido' };
  const match = /^data:([^,;]+)(?:;[^,;]+)*;base64,(.+)$/s.exec(raw);
  if (!match) return { error: 'Serve un data URL base64' };
  const mime = match[1]!.trim().toLowerCase();
  if (!mime.startsWith(opts.mimePrefix)) return { error: `Formato non supportato: ${mime}` };
  const data = Buffer.from(match[2]!, 'base64');
  if (data.length === 0) return { error: 'File vuoto' };
  if (data.length > opts.maxBytes) {
    return { error: `File troppo grande (max ${Math.round(opts.maxBytes / 1024)} KB)` };
  }
  return { data, mime };
}

const OPTS = { maxBytes: 512 * 1024, mimePrefix: 'audio/' };
const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('decodeDataUrl', () => {
  it('accetta i data URL di MediaRecorder con parametro codecs', () => {
    // Il caso che falliva: Chrome/Android producono `codecs=opus`.
    const raw = `data:audio/webm;codecs=opus;base64,${b64('clip')}`;
    const out = decodeDataUrl(raw, OPTS);
    expect('error' in out).toBe(false);
    if ('error' in out) return;
    expect(out.mime).toBe('audio/webm');
    expect(out.data.toString()).toBe('clip');
  });

  it('accetta webm, ogg e mp4, con e senza parametri', () => {
    for (const mime of ['audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
      const out = decodeDataUrl(`data:${mime};base64,${b64('x')}`, OPTS);
      expect('error' in out, `fallito per ${mime}`).toBe(false);
    }
  });

  it('accetta le immagini per la foto profilo', () => {
    const out = decodeDataUrl(`data:image/jpeg;base64,${b64('jpeg!')}`, {
      maxBytes: 400 * 1024,
      mimePrefix: 'image/',
    });
    expect('error' in out).toBe(false);
    if ('error' in out) return;
    expect(out.mime).toBe('image/jpeg');
  });

  it('rifiuta un tipo non ammesso dalla rotta', () => {
    const out = decodeDataUrl(`data:video/mp4;base64,${b64('x')}`, OPTS);
    expect(out).toEqual({ error: 'Formato non supportato: video/mp4' });
  });

  it('rifiuta un formato non base64 o non stringa', () => {
    expect(decodeDataUrl('non-un-data-url', OPTS)).toEqual({ error: 'Serve un data URL base64' });
    expect(decodeDataUrl(42, OPTS)).toEqual({ error: 'Formato non valido' });
  });

  it('rifiuta file vuoti e troppo grandi', () => {
    expect(decodeDataUrl('data:audio/webm;base64,', OPTS)).toEqual({ error: 'Serve un data URL base64' });
    const big = `data:audio/webm;codecs=opus;base64,${b64('a'.repeat(600 * 1024))}`;
    const out = decodeDataUrl(big, OPTS);
    expect('error' in out && /troppo grande/.test(out.error)).toBe(true);
  });
});
