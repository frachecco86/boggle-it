import { describe, it, expect } from 'vitest';
import { COMPOSITION, areAdjacent, generateGrid, isValidPath, wordFromPath } from './grid.js';
import { normalizeWord, scoreForWord, scoreForRound, generateRoomCode } from './scoring.js';
import type { Tile } from './types.js';

const tile = (index: number, row: number, col: number, letter = 'a'): Tile => ({
  index, row, col, letter, display: letter.toUpperCase(),
});

describe('scoring', () => {
  it('applica la regola classica: lunghezza − 2', () => {
    expect(scoreForWord('ab')).toBe(0);
    expect(scoreForWord('abc')).toBe(1);
    expect(scoreForWord('abcd')).toBe(2);
    expect(scoreForWord('abcde')).toBe(3);
    expect(scoreForWord('abcdef')).toBe(4);
    expect(scoreForWord('abcdefg')).toBe(5);
    expect(scoreForWord('abcdefgh')).toBe(6);
    expect(scoreForWord('abcdefghi')).toBe(7);
    expect(scoreForWord('abcdefghijklmnop')).toBe(14);
  });

  it('raddoppia i punti per una parola trovata da un solo giocatore', () => {
    expect(scoreForRound('casa')).toBe(2);
    expect(scoreForRound('casa', { unique: true })).toBe(4);
    expect(scoreForRound('strada', { unique: true })).toBe(8);
  });
  it('normalizza accenti e simboli', () => {
    expect(normalizeWord('Perché')).toBe('perche');
    expect(normalizeWord("città!")).toBe('citta');
    expect(normalizeWord("un'altra")).toBe('unaltra');
  });
  it('genera codici stanza senza caratteri ambigui', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe('grid', () => {
  it('genera griglie delle dimensioni corrette', () => {
    for (const size of [4, 5, 6] as const) {
      const g = generateGrid(size);
      expect(g.tiles).toHaveLength(size * size);
      expect(new Set(g.tiles.map((t) => t.index)).size).toBe(size * size);
    }
  });

  it('riconosce adiacenza in 8 direzioni', () => {
    expect(areAdjacent(tile(0, 0, 0), tile(1, 0, 1))).toBe(true);
    expect(areAdjacent(tile(0, 0, 0), tile(5, 1, 1))).toBe(true);
    expect(areAdjacent(tile(0, 0, 0), tile(6, 0, 2))).toBe(false);
    expect(areAdjacent(tile(0, 0, 0), tile(0, 0, 0))).toBe(false);
  });

  it('rifiuta percorsi non adiacenti o con ripetizioni', () => {
    const g = { size: 4 as const, tiles: Array.from({ length: 16 }, (_, i) => tile(i, Math.floor(i / 4), i % 4)) };
    expect(isValidPath(g, [0, 1, 2])).toBe(true);
    expect(isValidPath(g, [0, 2])).toBe(false); // salto
    expect(isValidPath(g, [0, 1, 0])).toBe(false); // ripetizione
    expect(isValidPath(g, [99])).toBe(false); // fuori griglia
    expect(isValidPath(g, [])).toBe(false);
  });

  it('costruisce la parola dal percorso con Qu', () => {
    const g = {
      size: 4 as const,
      tiles: [tile(0, 0, 0, 'q'), tile(1, 0, 1, 'a'), tile(2, 0, 2, 'd'), ...Array.from({ length: 13 }, (_, i) => tile(i + 3, 0, 0))],
    };
    expect(wordFromPath(g, [0, 1, 2])).toBe('quad');
  });
});

describe('Difficoltà: composizione controllata', () => {
  const RARE = new Set(['z', 'k', 'w', 'x', 'y', 'j']);
  const isVowel = (c: string) => 'aeiou'.includes(c);

  it('rispetta i limiti di vocali e lettere rare per ogni difficoltà', () => {
    for (const size of [4, 5, 6] as const) {
      for (const diff of ['molto-facile', 'facile', 'normale', 'difficile'] as const) {
        const comp = COMPOSITION[diff];
        const total = size * size;
        const minV = Math.round(total * comp.vowels.min);
        const maxV = Math.round(total * comp.vowels.max);
        const maxRare = Math.max(0, Math.round(total * comp.rareMax));

        for (let i = 0; i < 25; i++) {
          const g = generateGrid(size, Math.random, diff);
          const vowels = g.tiles.filter((t) => isVowel(t.letter)).length;
          const rare = g.tiles.filter((t) => RARE.has(t.letter)).length;
          expect(vowels, `${diff} ${size}x${size}: vocali ${vowels} fuori [${minV},${maxV}]`).toBeGreaterThanOrEqual(minV);
          expect(vowels, `${diff} ${size}x${size}: vocali ${vowels} fuori [${minV},${maxV}]`).toBeLessThanOrEqual(maxV);
          expect(rare, `${diff} ${size}x${size}: ${rare} rare (max ${maxRare})`).toBeLessThanOrEqual(maxRare);
        }
      }
    }
  });

  it('molto-facile non ha lettere rare', () => {
    for (let i = 0; i < 30; i++) {
      const g = generateGrid(4, Math.random, 'molto-facile');
      expect(g.tiles.filter((t) => RARE.has(t.letter)).length).toBe(0);
    }
  });

  it('ogni difficoltà superiore ha meno vocali della precedente (medie)', () => {
    const avgVowels = (diff: (typeof COMPOSITION)['normale'] extends never ? never : 'molto-facile' | 'facile' | 'normale' | 'difficile') => {
      let sum = 0;
      const N = 40;
      for (let i = 0; i < N; i++) {
        sum += generateGrid(5, Math.random, diff).tiles.filter((t) => isVowel(t.letter)).length;
      }
      return sum / N;
    };
    const a = avgVowels('molto-facile');
    const b = avgVowels('facile');
    const c = avgVowels('normale');
    const d = avgVowels('difficile');
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(d);
  });
});
