import { describe, expect, it } from 'vitest';
import { lengthBucket } from './lengthBucket.js';

describe('lengthBucket — scala di colori del punteggio', () => {
  it('le parole corte partono da 3', () => {
    expect(lengthBucket(3)).toBe(3);
    expect(lengthBucket(2)).toBe(3);
    expect(lengthBucket(0)).toBe(3);
  });

  it('segue la lunghezza fino a 7', () => {
    expect(lengthBucket(4)).toBe(4);
    expect(lengthBucket(5)).toBe(5);
    expect(lengthBucket(6)).toBe(6);
  });

  it('da 7 lettere in su resta la fascia massima', () => {
    expect(lengthBucket(7)).toBe(7);
    expect(lengthBucket(12)).toBe(7);
  });

  it('con un valore non valido non esplode', () => {
    expect(lengthBucket(Number.NaN)).toBe(3);
    expect(lengthBucket(Number.POSITIVE_INFINITY)).toBe(3);
  });
});
