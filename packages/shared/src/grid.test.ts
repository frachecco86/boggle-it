import { describe, it, expect } from 'vitest';
import { COMPOSITION, FULL_COMPOSITION, FOREIGN_LETTERS, RARE_ITALIAN, areAdjacent, findWordPath, generateGrid, isValidPath, wordFromPath } from './grid.js';
import { DIFFICULTY_ORDER, isDifficulty } from './difficulty.js';
import { normalizeWord, scoreForWord, scoreForRound, generateRoomCode } from './scoring.js';
import type { Tile } from './types.js';

const tile = (index: number, row: number, col: number, letter = 'a'): Tile => ({
  index, row, col, letter, display: letter.toUpperCase(),
});

describe('scoring', () => {
  it('segue la scala Boggle classica a soglie', () => {
    expect(scoreForWord('ab')).toBe(0); // sotto il minimo
    expect(scoreForWord('abc')).toBe(1); // 3 lettere
    expect(scoreForWord('abcd')).toBe(1); // 4 lettere
    expect(scoreForWord('abcde')).toBe(2); // 5
    expect(scoreForWord('abcdef')).toBe(3); // 6
    expect(scoreForWord('abcdefg')).toBe(5); // 7
    expect(scoreForWord('abcdefgh')).toBe(11); // 8
    expect(scoreForWord('abcdefghi')).toBe(11); // 9
    expect(scoreForWord('abcdefghij')).toBe(11); // 10
    expect(scoreForWord('abcdefghijklmnop')).toBe(11); // 16, tetto
  });

  it('le parole lunghe valgono molto più delle corte', () => {
    // Il senso della scala classica: la parola da 8+ vale 11 volte una da 3.
    const lunga = scoreForWord('abcdefgh');
    const tre = scoreForWord('abc');
    expect(lunga).toBe(11);
    expect(lunga / tre).toBe(11);
    // Da 8 lettere in su il tetto resta 11: non cresce più con la lunghezza.
    for (let len = 8; len <= 16; len++) {
      expect(scoreForWord('x'.repeat(len))).toBe(11);
    }
  });

  it('raddoppia i punti per una parola trovata da un solo giocatore', () => {
    // 'casa' = 4 lettere → 1 punto, doppio = 2.
    expect(scoreForRound('casa')).toBe(1);
    expect(scoreForRound('casa', { unique: true })).toBe(2);
    // 'strada' = 6 lettere → 3 punti, doppio = 6.
    expect(scoreForRound('strada')).toBe(3);
    expect(scoreForRound('strada', { unique: true })).toBe(6);
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
  const isVowel = (c: string) => 'aeiou'.includes(c);

  it('rispetta i limiti di vocali e lettere rare per ogni difficoltà', () => {
    for (const size of [4, 5, 6] as const) {
      for (const diff of ['facile', 'normale', 'difficile'] as const) {
        const comp = COMPOSITION[diff];
        const total = size * size;
        const minV = Math.round(total * comp.vowels.min);
        const maxV = Math.round(total * comp.vowels.max);
        const maxRare = Math.max(0, Math.round(total * comp.rareMax));

        for (let i = 0; i < 25; i++) {
          const g = generateGrid(size, Math.random, diff);
          const vowels = g.tiles.filter((t) => isVowel(t.letter)).length;
          const rare = g.tiles.filter((t) => (RARE_ITALIAN as readonly string[]).includes(t.letter)).length;
          expect(vowels, `${diff} ${size}x${size}: vocali ${vowels} fuori [${minV},${maxV}]`).toBeGreaterThanOrEqual(minV);
          expect(vowels, `${diff} ${size}x${size}: vocali ${vowels} fuori [${minV},${maxV}]`).toBeLessThanOrEqual(maxV);
          expect(rare, `${diff} ${size}x${size}: ${rare} rare italiane (max ${maxRare})`).toBeLessThanOrEqual(maxRare);
        }
      }
    }
  });

  it('non mette MAI lettere non italiane in griglia (foreignMax 0)', () => {
    const foreign = new Set<string>(FOREIGN_LETTERS);
    for (const size of [4, 5, 6] as const) {
      for (const diff of ['facile', 'normale', 'difficile'] as const) {
        for (let i = 0; i < 25; i++) {
          const g = generateGrid(size, Math.random, diff);
          for (const tile of g.tiles) {
            expect(foreign.has(tile.letter), `${diff} ${size}x${size}: lettera non italiana "${tile.letter}"`).toBe(false);
          }
        }
      }
    }
  });

  it('la rara obbligatoria del difficile full è una Z (italiana)', () => {
    for (let i = 0; i < 25; i++) {
      const g = generateGrid(4, Math.random, 'difficile', FULL_COMPOSITION.difficile);
      const z = g.tiles.filter((t) => t.letter === 'z').length;
      expect(z, 'almeno una Z nel difficile full').toBeGreaterThanOrEqual(1);
    }
  });

  it('la composizione resta un MEZZO: le vocali calano con la difficoltà', () => {
    /*
     * La composizione non è più il criterio di difficoltà (lo è la densità di
     * parole): qui verifichiamo solo che generi griglie via via più "secche",
     * che è la proprietà usata dal generatore come base di partenza.
     */
    const avgVowels = (diff: 'facile' | 'normale' | 'difficile') => {
      let sum = 0;
      const N = 40;
      for (let i = 0; i < N; i++) {
        sum += generateGrid(5, Math.random, diff).tiles.filter((t) => isVowel(t.letter)).length;
      }
      return sum / N;
    };
    expect(avgVowels('facile')).toBeGreaterThan(avgVowels('normale'));
    expect(avgVowels('normale')).toBeGreaterThan(avgVowels('difficile'));
  });
});

describe('Difficoltà: validazione condivisa', () => {
  it('accetta i 3 livelli', () => {
    expect(isDifficulty('facile')).toBe(true);
    expect(isDifficulty('normale')).toBe(true);
    expect(isDifficulty('difficile')).toBe(true);
    // I livelli rimossi non devono più essere accettati.
    expect(isDifficulty('molto-facile')).toBe(false);
    expect(isDifficulty('estremo')).toBe(false);
  });

  it('rifiuta valori non validi', () => {
    expect(isDifficulty('inventata')).toBe(false);
    expect(isDifficulty('')).toBe(false);
    expect(isDifficulty(undefined)).toBe(false);
    expect(isDifficulty(null)).toBe(false);
    expect(isDifficulty(4)).toBe(false);
  });

  it('DIFFICULTY_ORDER contiene esattamente i livelli validi', () => {
    expect(DIFFICULTY_ORDER).toHaveLength(3);
    for (const d of DIFFICULTY_ORDER) expect(isDifficulty(d)).toBe(true);
    expect(DIFFICULTY_ORDER[DIFFICULTY_ORDER.length - 1]).toBe('difficile');
  });

  it('ogni livello ha una composizione definita', () => {
    for (const d of DIFFICULTY_ORDER) {
      const comp = COMPOSITION[d];
      expect(comp, `manca COMPOSITION per ${d}`).toBeDefined();
      expect(comp!.vowels.min).toBeLessThan(comp!.vowels.max);
    }
  });
});

describe('findWordPath: percorso di una parola (suggerimento)', () => {
  const mk = (faces: string, size: 4 = 4) => {
    const lines = faces.split('/');
    const tiles = lines.flatMap((row, r) =>
      [...row].map((letter, c) => tile(r * size + c, r, c, letter)),
    );
    return { size, tiles } as const;
  };

  it('trova un percorso legale per una parola presente', () => {
    // riga 1: c a s a → "casa" si legge da sinistra a destra
    const g = mk('casa/xxxx/xxxx/xxxx');
    const path = findWordPath(g, 'casa');
    expect(path).not.toBeNull();
    expect(path).toHaveLength(4);
    expect(path!.map((i) => g.tiles[i]!.letter).join('')).toBe('casa');
  });

  it('gestisce qu come una sola cella', () => {
    // La faccia `q` vale "qu": servono 5 celle (q, a, n, d, o) per "quando".
    const g = mk('qand/xxxo/xxxx/xxxx');
    const path = findWordPath(g, 'quando');
    expect(path).not.toBeNull();
    expect(path).toHaveLength(5); // q(qu),a,n,d,o
  });

  it('ritorna null se la parola non è componibile', () => {
    const g = mk('abcd/efgh/ijkl/mnop');
    expect(findWordPath(g, 'zzzz')).toBeNull();
  });

  it('non riusa la stessa cella due volte', () => {
    // "caca" servirebbe due volte la stessa 'c': non c'è percorso.
    const g = mk('caaa/aaaa/aaaa/aaaa');
    const path = findWordPath(g, 'caca');
    if (path) {
      expect(new Set(path).size).toBe(path.length);
    }
    // "caca" esiste solo se c'è una seconda 'c' raggiungibile: qui non c'è.
    expect(path).toBeNull();
  });
});
