import { describe, expect, it } from 'vitest';
import { FINAL_SECONDS, nextTickSecond } from './useFinalCountdown.js';

/**
 * Il feedback degli ultimi secondi deve:
 *  1. partire UNA volta per secondo (il timer si aggiorna a ogni frame);
 *  2. coprire esattamente 10…1;
 *  3. tacere fuori dalla finestra e a round finito.
 *
 * Questi test fermano una regressione facile: senza il controllo su `lastPlayed`
 * il tick partirebbe decine di volte al secondo, e senza la soglia su `active`
 * suonerebbe anche a round concluso.
 */
describe('nextTickSecond', () => {
  it('parte da 10 e non oltre', () => {
    expect(nextTickSecond(10_000, true, null)).toBe(10);
    // 10.5s → ceil = 11: fuori finestra, niente tick.
    expect(nextTickSecond(10_500, true, null)).toBeNull();
    expect(nextTickSecond(60_000, true, null)).toBeNull();
  });

  it('per ogni secondo suona una sola volta, anche con molti aggiornamenti', () => {
    // Simula il timer che si aggiorna a ogni frame dentro lo stesso secondo.
    let last: number | null = null;
    const played: number[] = [];
    for (let ms = 10_000; ms > 9_000; ms -= 16) {
      const s = nextTickSecond(ms, true, last);
      if (s !== null) {
        played.push(s);
        last = s;
      }
    }
    expect(played).toEqual([10]);
  });

  it('copre tutti i secondi da 10 a 1', () => {
    let last: number | null = null;
    const played: number[] = [];
    for (let ms = 10_000; ms > 0; ms -= 250) {
      const s = nextTickSecond(ms, true, last);
      if (s !== null) {
        played.push(s);
        last = s;
      }
    }
    expect(played).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(played).toHaveLength(FINAL_SECONDS);
  });

  it('a round finito (0) non suona', () => {
    expect(nextTickSecond(0, true, null)).toBeNull();
    expect(nextTickSecond(-500, true, null)).toBeNull();
  });

  it('con il round non attivo non suona', () => {
    expect(nextTickSecond(5_000, false, null)).toBeNull();
  });
});
