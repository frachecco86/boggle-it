import { describe, expect, it } from 'vitest';
import { postiPodio, quantiAseguire } from './Podium.js';

/**
 * Il podio deve reggere **qualunque** numero di giocatori: questi test fissano la
 * disposizione delle pedane, che è la parte dove i casi strani si nascondono (due
 * giocatori, un giocatore solo, più di tre).
 *
 * Ordine visivo: 2°, 1°, 3° — il vincitore sta al centro, come su un podio vero.
 * Il valore `-1` è il posto vuoto: serve con due giocatori per non far scivolare
 * il vincitore a destra.
 */
describe('podio: disposizione delle pedane', () => {
  it('con un giocatore solo non si disegna nessuna pedana', () => {
    expect(postiPodio(0)).toEqual([]);
    expect(postiPodio(1)).toEqual([]);
  });

  it('con due giocatori il vincitore resta al centro (terzo posto vuoto)', () => {
    expect(postiPodio(2)).toEqual([1, 0, -1]);
  });

  it('con tre giocatori ci sono tutte e tre le pedane', () => {
    expect(postiPodio(3)).toEqual([1, 0, 2]);
  });

  it('con più di tre giocatori il podio resta a tre', () => {
    for (const n of [4, 5, 6, 12]) {
      expect(postiPodio(n)).toEqual([1, 0, 2]);
    }
  });

  it('il vincitore è sempre al centro (seconda posizione visiva) quando il podio c\'è', () => {
    for (const n of [2, 3, 4, 8]) {
      const pedane = postiPodio(n);
      expect(pedane).toHaveLength(3);
      expect(pedane[1]).toBe(0);
    }
  });

  it('quanti giocatori restano fuori dal podio', () => {
    expect(quantiAseguire(0)).toBe(0);
    expect(quantiAseguire(1)).toBe(0);
    expect(quantiAseguire(2)).toBe(0);
    expect(quantiAseguire(3)).toBe(0);
    expect(quantiAseguire(4)).toBe(1);
    expect(quantiAseguire(7)).toBe(4);
  });
});
