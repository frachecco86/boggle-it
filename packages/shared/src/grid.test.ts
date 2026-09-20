import { describe, it, expect } from 'vitest';
import { COMPOSITION, areAdjacent, generateGrid, isValidPath, wordFromPath } from './grid.js';
import { DIFFICULTY_ORDER, isDifficulty } from './difficulty.js';
import { normalizeWord, scoreForWord, scoreForRound, generateRoomCode } from './scoring.js';
import type { Tile } from './types.js';

const tile = (index: number, row: number, col: number, letter = 'a'): Tile => ({
  index, row, col, letter, display: letter.toUpperCase(),
});

describe('scoring', () => {
  it('assegna 1 punto per 3 lettere, poi 1 per lettera in più', () => {
    expect(scoreForWord('ab')).toBe(0); // sotto il minimo
    // Regola Boggle: lunghezza − 2.
    expect(scoreForWord('abc')).toBe(1);
    expect(scoreForWord('abcd')).toBe(2);
    expect(scoreForWord('abcde')).toBe(3);
    expect(scoreForWord('abcdef')).toBe(4);
    expect(scoreForWord('abcdefg')).toBe(5);
    expect(scoreForWord('abcdefgh')).toBe(6);
    expect(scoreForWord('abcdefghi')).toBe(7);
    expect(scoreForWord('abcdefghij')).toBe(8);
    expect(scoreForWord('abcdefghijklmnop')).toBe(14);
  });

  it('le parole lunghe valgono molto più delle corte', () => {
    // Il motivo della formula: con una piatta (⌊len/3⌋) una parola da 9 lettere
    // valeva 3 punti, come tre parole da 3. Ora ne vale 7.
    const nove = scoreForWord('abcdefghi');
    const tre = scoreForWord('abc');
    expect(nove).toBe(7);
    expect(nove / tre).toBe(7);
    // La crescita è lineare: ogni lettera in più vale 1 punto.
    for (let len = 4; len <= 15; len++) {
      expect(scoreForWord('x'.repeat(len)) - scoreForWord('x'.repeat(len - 1))).toBe(1);
    }
  });

  it('raddoppia i punti per una parola trovata da un solo giocatore', () => {
    // 'casa' = 4 lettere → 2 punti, doppio = 4.
    expect(scoreForRound('casa')).toBe(2);
    expect(scoreForRound('casa', { unique: true })).toBe(4);
    // 'strada' = 6 lettere → 4 punti, doppio = 8.
    expect(scoreForRound('strada')).toBe(4);
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

describe('Difficoltà: validazione condivisa', () => {
  it('accetta tutti i 5 livelli, incluso Estremo', () => {
    // Regressione: il server aveva una copia locale della validazione con i
    // confronti hardcoded. Aggiungendo 'estremo' non era stata aggiornata e il
    // livello veniva rifiutato silenziosamente, ricadendo su 'normale'.
    expect(isDifficulty('molto-facile')).toBe(true);
    expect(isDifficulty('facile')).toBe(true);
    expect(isDifficulty('normale')).toBe(true);
    expect(isDifficulty('difficile')).toBe(true);
    expect(isDifficulty('estremo')).toBe(true);
  });

  it('rifiuta valori non validi', () => {
    expect(isDifficulty('inventata')).toBe(false);
    expect(isDifficulty('')).toBe(false);
    expect(isDifficulty(undefined)).toBe(false);
    expect(isDifficulty(null)).toBe(false);
    expect(isDifficulty(4)).toBe(false);
  });

  it('DIFFICULTY_ORDER contiene esattamente i livelli validi', () => {
    expect(DIFFICULTY_ORDER).toHaveLength(5);
    for (const d of DIFFICULTY_ORDER) expect(isDifficulty(d)).toBe(true);
    expect(DIFFICULTY_ORDER[DIFFICULTY_ORDER.length - 1]).toBe('estremo');
  });

  it('ogni livello ha una composizione definita', () => {
    for (const d of DIFFICULTY_ORDER) {
      const comp = COMPOSITION[d];
      expect(comp, `manca COMPOSITION per ${d}`).toBeDefined();
      expect(comp!.vowels.min).toBeLessThan(comp!.vowels.max);
    }
    // Estremo ha meno vocali e più rare di Difficile.
    expect(COMPOSITION.estremo.vowels.max).toBeLessThan(COMPOSITION.difficile.vowels.max);
    expect(COMPOSITION.estremo.rareMax).toBeGreaterThan(COMPOSITION.difficile.rareMax);
  });

  it('genera griglie valide per Estremo', () => {
    for (const size of [4, 5, 6] as const) {
      for (let i = 0; i < 15; i++) {
        const g = generateGrid(size, Math.random, 'estremo');
        expect(g.tiles).toHaveLength(size * size);
        const vowels = g.tiles.filter((t) => 'aeiou'.includes(t.letter)).length;
        // Estremo: 16-26% di vocali.
        expect(vowels / (size * size)).toBeLessThanOrEqual(0.3);
      }
    }
  });
});
