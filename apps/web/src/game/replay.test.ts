import { describe, expect, it } from 'vitest';
import type { RoundResultEntry } from '@boggle/shared';
import { buildReplayPlan, revealedCountAt } from './replay.js';

/** Un giocatore con la sua timeline (già in ordine cronologico). */
function player(
  id: string,
  nickname: string,
  roundScore: number,
  events: Array<[string, number, number]>,
): RoundResultEntry {
  return {
    playerId: id,
    nickname,
    roundScore,
    totalScore: roundScore,
    words: events.map(([w]) => w),
    timeline: events.map(([word, points, at]) => ({ word, points, at })),
  };
}

describe('buildReplayPlan', () => {
  it('rispetta l\'ordine cronologico REALE fra giocatori diversi', () => {
    // Bob trova per primo, poi Alice due volte.
    const plan = buildReplayPlan([
      player('a', 'Alice', 5, [['casa', 2, 5000], ['sole', 3, 9000]]),
      player('b', 'Bob', 4, [['luna', 4, 1000]]),
    ]);
    expect(plan.steps.map((s) => s.word)).toEqual(['luna', 'casa', 'sole']);
    expect(plan.steps.map((s) => s.nickname)).toEqual(['Bob', 'Alice', 'Alice']);
    // I tempi di replay sono crescenti.
    expect(plan.steps[0]!.atMs).toBeLessThan(plan.steps[1]!.atMs);
    expect(plan.steps[1]!.atMs).toBeLessThan(plan.steps[2]!.atMs);
  });

  it('comprime la timeline reale in una finestra breve', () => {
    const plan = buildReplayPlan([
      // Scoperte a 0, 60s e 120s: il replay non può durare 2 minuti.
      player('a', 'Alice', 9, [['aaa', 1, 0], ['bbb', 3, 60_000], ['ccc', 5, 120_000]]),
    ]);
    expect(plan.durationMs).toBeLessThanOrEqual(18_000 + 1);
    // L'ultima parola compare comunque prima della fine.
    const last = plan.steps.at(-1)!;
    expect(last.atMs).toBeLessThan(plan.durationMs);
  });

  it('impone una spaziatura minima a parole troppo vicine', () => {
    const plan = buildReplayPlan([
      player('a', 'Alice', 3, [['aaa', 1, 0], ['bbb', 1, 1], ['ccc', 1, 2]]),
    ]);
    const [s0, s1, s2] = plan.steps;
    expect(s1!.atMs - s0!.atMs).toBeGreaterThanOrEqual(170);
    expect(s2!.atMs - s1!.atMs).toBeGreaterThanOrEqual(170);
  });

  it('resta entro il tetto anche con tantissime parole', () => {
    const events: Array<[string, number, number]> = [];
    for (let i = 0; i < 500; i++) events.push([`w${i}`, 1, i * 100]);
    const plan = buildReplayPlan([player('a', 'Alice', 500, events)]);
    expect(plan.steps).toHaveLength(500);
    expect(plan.durationMs).toBeLessThanOrEqual(18_000 + 1);
  });

  it('senza timeline il piano è vuoto (riepilogo classico)', () => {
    const plan = buildReplayPlan([
      { playerId: 'a', nickname: 'Alice', roundScore: 3, totalScore: 3, words: ['casa'] },
    ]);
    expect(plan.steps).toHaveLength(0);
    expect(plan.durationMs).toBe(0);
    // I totali restano disponibili anche senza timeline.
    expect(plan.totals.a).toBe(3);
  });

  it('il totale usa il roundScore ufficiale, non la somma della timeline', () => {
    // Timeline "parziale" (punti mancanti) ma roundScore autorevole.
    const plan = buildReplayPlan([player('a', 'Alice', 42, [['casa', 2, 100]])]);
    expect(plan.totals.a).toBe(42);
  });

  it('somma i totali per giocatore e marca le parole uniche', () => {
    const a = player('a', 'Alice', 6, [['casa', 2, 100], ['sole', 4, 200]]);
    a.timeline![1]!.unique = true;
    const plan = buildReplayPlan([a, player('b', 'Bob', 1, [['luna', 1, 50]])]);
    expect(plan.totals).toEqual({ a: 6, b: 1 });
    expect(plan.steps.find((s) => s.word === 'sole')!.unique).toBe(true);
    expect(plan.steps.find((s) => s.word === 'casa')!.unique).toBe(false);
  });
});

describe('revealedCountAt', () => {
  it('rivela le parole mano a mano che il tempo avanza', () => {
    const plan = buildReplayPlan([
      player('a', 'Alice', 3, [['aaa', 1, 0], ['bbb', 1, 1000], ['ccc', 1, 2000]]),
    ]);
    expect(revealedCountAt(plan, 0)).toBe(0);
    expect(revealedCountAt(plan, plan.steps[0]!.atMs)).toBe(1);
    expect(revealedCountAt(plan, plan.steps[1]!.atMs)).toBe(2);
    expect(revealedCountAt(plan, plan.durationMs)).toBe(3);
  });
});
