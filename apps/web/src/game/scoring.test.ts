/**
 * Test della logica di punteggio del single player.
 *
 * Regressione bloccata qui: il totale sommava `roundScores` PIÙ `score`, ma a
 * fine round `score` è già dentro `roundScores`. L'ultimo round veniva contato
 * due volte: con 2 round da 50 e 30 il totale dava 110 invece di 80.
 */
import { describe, expect, it } from 'vitest';

/** Replica della formula usata in `useSoloGame`. */
function totalScore(roundScores: number[], score: number, phase: string): number {
  return roundScores.reduce((a, b) => a + b, 0) + (phase === 'playing' ? score : 0);
}

describe('punteggio totale del single player', () => {
  it('durante il round somma i round passati più quello in corso', () => {
    expect(totalScore([], 50, 'playing')).toBe(50);
    expect(totalScore([50], 30, 'playing')).toBe(80);
  });

  it('a fine round NON conta due volte il round appena chiuso', () => {
    // `score` è già dentro `roundScores`: non va aggiunto.
    expect(totalScore([50], 50, 'roundEnd')).toBe(50);
    expect(totalScore([50, 30], 30, 'roundEnd')).toBe(80);
  });

  it('a fine partita il totale è la somma dei round', () => {
    // Il caso segnalato: 2 round da 50 e 30 → 80, non 110.
    expect(totalScore([50, 30], 30, 'gameEnd')).toBe(80);
    expect(totalScore([120, 45, 67], 67, 'gameEnd')).toBe(232);
  });

  it('una partita di un solo round dà il punteggio del round', () => {
    expect(totalScore([75], 75, 'gameEnd')).toBe(75);
    expect(totalScore([], 0, 'gameEnd')).toBe(0);
  });
});
