/**
 * Regressione sulla SCALA dei punteggi usata dal client.
 *
 * La scala è lineare e SENZA tetto: 3 lettere → 1 punto, poi +1 per ogni lettera
 * oltre la terza (3→1, 4→2, 5→3, … 9→7, 10→8, 16→14). Il task di riferimento lo
 * scrive come "3 lettere 1 punto, 4 lettere 2 punti, 5 lettere 3 punti e così
 * via": il "così via" è la crescita continua.
 *
 * Perché un test qui e non solo in `packages/shared`:
 *
 * 1. `schedaWordPoints` era una COPIA della formula (`length - 2`) dentro
 *    `stats.ts`. Due definizioni della stessa regola possono divergere: qui si
 *    blocca che restino d'accordo.
 * 2. `SchedaBrowser` ricopiava la formula a mano (`Math.max(0, length - 2)`), un
 *    TERZO posto da cui poteva divergere. Ora usa `schedaWordPoints`.
 * 3. Il pannello Regole etichettava l'ultima fascia "10 o più" e la mostrava con
 *    un "+", suggerendo un tetto dopo le 10 lettere: con la crescita illimitata
 *    è falso (16 lettere = 14, non 8). Il test fissa l'assenza di tetto.
 */
import { describe, expect, it } from 'vitest';
import { scoreForWord, schedaWordPoints } from '@boggle/shared';

describe('scala dei punteggi', () => {
  it('cresce di un punto per lettera, senza tetto', () => {
    // Il caso del task: 3→1, 4→2, 5→3.
    expect(scoreForWord('abc')).toBe(1);
    expect(scoreForWord('abcd')).toBe(2);
    expect(scoreForWord('abcde')).toBe(3);

    // "E così via": la crescita NON si ferma a 10 punti né a 8 punti.
    expect(scoreForWord('x'.repeat(9))).toBe(7);
    expect(scoreForWord('x'.repeat(10))).toBe(8);
    expect(scoreForWord('x'.repeat(11))).toBe(9);
    expect(scoreForWord('x'.repeat(16))).toBe(14);
  });

  it('sotto le 3 lettere vale 0', () => {
    expect(scoreForWord('')).toBe(0);
    expect(scoreForWord('a')).toBe(0);
    expect(scoreForWord('ab')).toBe(0);
  });

  it('schedaWordPoints e scoreForWord sono la STESSA regola', () => {
    // Se una delle due cambia, questo test cade: è il guard rail contro la
    // duplicazione della formula che c'era in `stats.ts`.
    for (let len = 0; len <= 20; len++) {
      expect(schedaWordPoints(len)).toBe(scoreForWord('x'.repeat(len)));
    }
  });

  it('nessuna fascia è "più o più": ogni lunghezza ha il suo punto', () => {
    // Il pannello Regole mostrava "10 o più → 8+". Con la scala lineare due
    // lunghezze diverse valgono punti diversi: se comparissero uguali, ci
    // sarebbe un tetto nascosto.
    const lunghezze = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const punti = lunghezze.map((l) => scoreForWord('x'.repeat(l)));
    for (let i = 1; i < punti.length; i++) {
      expect(punti[i]).toBeGreaterThan(punti[i - 1]!);
    }
  });
});
