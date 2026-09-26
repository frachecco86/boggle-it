/**
 * Test del suggerimento nella griglia (modalità apprendimento).
 *
 * Non montiamo React (non c'è testing-library nel progetto): verifichiamo la
 * LOGICA dei ritardi, importando le funzioni REALI da `GridBoard`. Così se il
 * passo dell'animazione cambia in un posto solo, il test lo segue; e se cambia
 * in modo incoerente (frecce e celle sfasate), il test fallisce.
 *
 * Il suggerimento accende le celle in sequenza E disegna le frecce dello stesso
 * percorso. Entrambe usano lo stesso passo, quindi la freccia N compare insieme
 * all'accensione della cella N+1.
 */
import { describe, expect, it } from 'vitest';
import { HINT_STEP_MS, hintArrowDelayMs, hintTileDelayMs } from './GridBoard.js';

describe('suggerimento — ordine di accensione', () => {
  it('le celle si accendono in ordine crescente', () => {
    const delays = [0, 1, 2, 3].map(hintTileDelayMs);
    expect(delays).toEqual([0, HINT_STEP_MS, HINT_STEP_MS * 2, HINT_STEP_MS * 3]);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it('le frecce seguono le celle (una per collegamento)', () => {
    // Una parola di N celle ha N-1 frecce.
    const delays = Array.from({ length: 4 }, (_, i) => hintArrowDelayMs(i));
    expect(delays).toEqual([
      HINT_STEP_MS / 2,
      HINT_STEP_MS * 1.5,
      HINT_STEP_MS * 2.5,
      HINT_STEP_MS * 3.5,
    ]);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it('ogni freccia compare fra la cella di partenza e quella di arrivo', () => {
    // La freccia `i` collega la cella `i` alla `i+1`: il suo ritardo deve stare
    // in mezzo, così si vede il tratto mentre la destinazione si accende.
    for (let i = 0; i < 4; i++) {
      expect(hintArrowDelayMs(i)).toBeGreaterThan(hintTileDelayMs(i));
      expect(hintArrowDelayMs(i)).toBeLessThan(hintTileDelayMs(i + 1));
    }
  });

  it('la prima freccia compare subito dopo la prima cella', () => {
    expect(hintArrowDelayMs(0)).toBe(HINT_STEP_MS / 2);
    expect(hintArrowDelayMs(0)).toBeLessThan(HINT_STEP_MS);
  });
});
