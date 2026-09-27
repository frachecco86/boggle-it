/**
 * Variante delle schede di una partita (`resolveRoomVariant`).
 *
 * REGRESSIONE: `room:create` leggeva la variante dal payload del client con
 * fallback `'standard'`, mentre dal 0.35.0 il client non la invia più (la
 * sceglie l'admin). Ogni stanza nasceva quindi `standard` e il multiplayer
 * ignorava l'impostazione dell'admin, che invece valeva in single player.
 */
import { describe, expect, it } from 'vitest';
import { resolveRoomVariant } from './roomVariant.js';

describe('resolveRoomVariant', () => {
  it('usa la variante dell’admin, non quella inviata dal client', () => {
    // Un client vecchio manda ancora 'standard': deve essere ignorato.
    expect(resolveRoomVariant('ale', 5, 'standard')).toBe('ale');
    expect(resolveRoomVariant('full', 5, 'standard')).toBe('full');
  });

  it('senza alcuna variante dal client vale ancora quella dell’admin (regressione)', () => {
    // Era esattamente questo il caso rotto: il client non manda più il campo.
    expect(resolveRoomVariant('ale', 5, undefined)).toBe('ale');
    expect(resolveRoomVariant('ale', 4, undefined)).toBe('ale');
    expect(resolveRoomVariant('ale', 6, undefined)).toBe('ale');
    expect(resolveRoomVariant('full', 4, undefined)).toBe('full');
  });

  it('la variante dell’admin vale su ogni griglia', () => {
    for (const size of [4, 5, 6] as const) {
      expect(resolveRoomVariant('ale', size)).toBe('ale');
    }
  });

  it('con admin su `standard` ogni stanza è standard', () => {
    expect(resolveRoomVariant('standard', 4)).toBe('standard');
    // Nemmeno un client che chiede 'ale' può imporla.
    expect(resolveRoomVariant('standard', 5, 'ale')).toBe('standard');
  });

  it('ignora anche un valore inventato dal client', () => {
    expect(resolveRoomVariant('full', 5, 'non-una-variante')).toBe('full');
  });
});
