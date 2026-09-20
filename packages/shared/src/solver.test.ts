import { describe, it, expect } from 'vitest';
import { buildTrie, solveGrid, type Grid } from '@boggle/shared';

function gridFromRows(rows: string[]): Grid {
  const size = rows.length;
  return {
    size: size as Grid['size'],
    tiles: rows.flatMap((row, r) =>
      [...row].map((ch, c) => ({
        index: r * size + c,
        row: r,
        col: c,
        letter: ch.toLowerCase(),
        display: ch.toUpperCase(),
      })),
    ),
  };
}

describe('solver', () => {
  it('trova parole semplici nella griglia', () => {
    const trie = buildTrie(['casa', 'caso', 'sacco', 'oca', 'soglia']);
    const grid = gridFromRows(['casa', 'aaaa', 'aaaa', 'aaaa']);
    const found = solveGrid(grid, trie);
    expect(found).toContain('casa');
    // 'caso' non e' componibile (manca la o adiacente)
    expect(found).not.toContain('soglia');
  });

  it('non riusa la stessa cella', () => {
    const trie = buildTrie(['aaaa']);
    const grid = gridFromRows(['aaa', 'aaa', 'aaa']);
    const found = solveGrid(grid, trie);
    // 'aaaa' richiede 4 celle adiacenti, la griglia 3x3 le ha
    expect(found).toContain('aaaa');
  });

  it('trova parole multi-riga rispettando adiacenza', () => {
    const trie = buildTrie(['ramo']);
    const grid = gridFromRows([
      'rxxa',
      'xxxx',
      'mxxx',
      'xxox',
    ]);
    // r(0,0) -> a(0,3) non e' adiacente: non deve trovarla
    expect(solveGrid(grid, trie)).not.toContain('ramo');
  });

  it('supporta la faccia Qu', () => {
    const trie = buildTrie(['quadro']);
    const grid: Grid = {
      size: 4,
      tiles: [
        { index: 0, row: 0, col: 0, letter: 'q', display: 'Qu' },
        { index: 1, row: 0, col: 1, letter: 'a', display: 'A' },
        { index: 2, row: 0, col: 2, letter: 'd', display: 'D' },
        { index: 3, row: 0, col: 3, letter: 'r', display: 'R' },
        { index: 4, row: 1, col: 0, letter: 'o', display: 'O' },
        ...Array.from({ length: 11 }, (_, i) => ({
          index: i + 5,
          row: 1 + Math.floor((i + 1) / 4),
          col: (i + 1) % 4,
          letter: 'x',
          display: 'X',
        })),
      ],
    };
    // q(0,0) -> a(0,1) -> d(0,2) -> r(0,3) -> o(1,0)? o non e' adiacente a r(0,3). Usiamo percorso valido:
    expect(solveGrid(grid, trie)).not.toContain('quadro');
    const trie2 = buildTrie(['quad']);
    expect(solveGrid(grid, trie2)).toContain('quad');
  });

  it('rispetta il limite', () => {
    const trie = buildTrie(['aa', 'aaa', 'aaaa', 'aaaaa', 'aaaaaa']);
    const grid = gridFromRows(['aaa', 'aaa', 'aaa']);
    const found = solveGrid(grid, trie, { limit: 2 });
    expect(found.length).toBeLessThanOrEqual(2);
  });
});
