import { describe, it, expect } from 'vitest';
import { areAdjacent, generateGrid, isValidPath, wordFromPath } from './grid.js';
import { normalizeWord, scoreForWord, generateRoomCode } from './scoring.js';
import type { Tile } from './types.js';

const tile = (index: number, row: number, col: number, letter = 'a'): Tile => ({
  index, row, col, letter, display: letter.toUpperCase(),
});

describe('scoring', () => {
  it('applica la tabella classica', () => {
    expect(scoreForWord('abc')).toBe(1);
    expect(scoreForWord('abcd')).toBe(1);
    expect(scoreForWord('abcde')).toBe(2);
    expect(scoreForWord('abcdef')).toBe(3);
    expect(scoreForWord('abcdefg')).toBe(4);
    expect(scoreForWord('abcdefgh')).toBe(5);
    expect(scoreForWord('abcdefghi')).toBe(5);
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
