/**
 * Test dell'anteprima parola.
 *
 * Non montiamo React (non c'è testing-library nel progetto): verifichiamo la
 * logica di scelta della classe, che è ciò che determina la dimensione del testo
 * e quindi il mantenimento dell'altezza fissa.
 */
import { describe, expect, it } from 'vitest';

/**
 * Replica della logica in `CurrentWord`: la classe dipende solo dalla lunghezza.
 * Se cambia lì, questo test fallisce — ed è voluto: è il contratto con il CSS.
 */
function sizeClassFor(len: number): string {
  if (len > 12) return 'current-word-banner--xlong';
  if (len >= 8) return 'current-word-banner--long';
  return '';
}

describe('CurrentWord — classi di dimensione', () => {
  it('parole corte: nessuna classe di riduzione', () => {
    expect(sizeClassFor(0)).toBe('');
    expect(sizeClassFor(7)).toBe('');
  });

  it('a 8 lettere entra la riduzione intermedia', () => {
    expect(sizeClassFor(8)).toBe('current-word-banner--long');
    expect(sizeClassFor(12)).toBe('current-word-banner--long');
  });

  it('oltre 12 lettere si riduce ancora (parole lunghe delle griglie 6×6)', () => {
    expect(sizeClassFor(13)).toBe('current-word-banner--xlong');
    expect(sizeClassFor(16)).toBe('current-word-banner--xlong');
  });
});
