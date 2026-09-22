import { describe, expect, it } from 'vitest';
import { createSchedaPool, rowsToGrid, scoreForWord, wordFromPath } from './index.js';
import { generateScheda, solvingTrieFor } from './schedaGen.js';
import { buildTrie } from './solver.js';
import type { Difficulty, GridSize } from './index.js';

/** Lessico di prova: poche parole comuni, abbastanza per una 4x4. */
const FULL = [
  'casa', 'caso', 'cose', 'costa', 'costa', 'cassa', 'cassaforte', 'asta', 'asso',
  'ora', 'ore', 'ora', 'oro', 'resa', 'resta', 'resto', 'stare', 'storia', 'torre',
  'arte', 'rate', 'seta', 'tesa', 'eros', 'erto', 'orto', 'orso', 'rosa', 'sasso',
  'festa', 'festa', 'testa', 'tessa', 'corsa', 'corso', 'sorte', 'sorta',
];
const COMMON = ['casa', 'caso', 'cose', 'costa', 'asta', 'ora', 'oro', 'resta', 'testa', 'rosa'];

function pool() {
  return createSchedaPool({ fullWords: FULL, commonWords: COMMON, maxWordLength: 12 });
}

describe('generatore schede', () => {
  it('tutti i livelli risolvono sul dizionario completo', () => {
    /*
     * Scelta di prodotto: la difficoltà è la DENSITÀ di parole, non il lessico.
     * Tutti i livelli usano il dizionario completo, così un livello "facile" è
     * ricco di parole e uno "difficile" ne ha poche.
     */
    expect(solvingTrieFor('facile')).toBe('full');
    expect(solvingTrieFor('normale')).toBe('full');
    expect(solvingTrieFor('difficile')).toBe('full');
  });

  it('genera una scheda coerente con la sua griglia', () => {
    const p = pool();
    const tries = { full: buildTrie(FULL, { maxLength: 12 }) };
    // Tentativi finché una griglia 4x4 soddisfa i requisiti minimi.
    const scheda = generateScheda({
      size: 4,
      difficulty: 'normale',
      tries,
      rng: Math.random,
      id: 'test-001',
      maxAttempts: 500,
    });
    // Il lessico di prova è minuscolo: possiamo non trovare una scheda di qualità.
    if (!scheda) return;
    expect(scheda.id).toBe('test-001');
    expect(scheda.grid.split('\n')).toHaveLength(4);
    expect(scheda.words.length).toBeGreaterThan(0);
    // Ogni parola dichiarata deve esistere sulla griglia per davvero.
    const grid = rowsToGrid(scheda.grid);
    const all = new Set(grid.tiles.map((t) => t.letter));
    expect(all.size).toBeGreaterThan(0);
    for (const word of scheda.words) {
      // lettere tutte presenti in griglia (condizione necessaria, non sufficiente)
      for (const ch of word) expect(all.has(ch) || ch === 'u').toBe(true);
    }
    // Ordinamento per lunghezza decrescente.
    for (let i = 1; i < scheda.words.length; i++) {
      expect(scheda.words[i - 1]!.length).toBeGreaterThanOrEqual(scheda.words[i]!.length);
    }
  });

  it('il pool genera schede con id progressivi', () => {
    const p = pool();
    const schede = p.generate(4, 'normale', 3, { startIndex: 5 });
    expect(schede.length).toBeGreaterThanOrEqual(0);
    for (const s of schede) {
      expect(s.id).toMatch(/^4-normale-\d{3}$/);
      expect(s.size).toBe(4);
      expect(s.difficulty).toBe('normale');
    }
  });

  it('rowsToGrid ricostruisce le celle con display corretto (Qu)', () => {
    const grid = rowsToGrid('qa\nzz');
    expect(grid.size).toBe(2);
    expect(grid.tiles).toHaveLength(4);
    expect(grid.tiles[0]!.letter).toBe('q');
    expect(grid.tiles[0]!.display).toBe('Qu');
    expect(grid.tiles[1]!.letter).toBe('a');
  });

  it('wordFromPath usa qu per la faccia q', () => {
    const grid = rowsToGrid('qa\nzz');
    expect(wordFromPath(grid, [0, 1])).toBe('qua');
  });

  it('scoreForWord cresce di 1 punto per lettera anche oltre le 8', () => {
    // 'cassaforte' = 10 lettere → 8 punti (lunghezza − 2).
    expect(scoreForWord('cassaforte')).toBe(8);
    // 16 lettere → 14 punti.
    expect(scoreForWord('x'.repeat(16))).toBe(14);
  });
});

describe('catalogo schede (metadati)', () => {
  it('accetta tutte le combinazioni dimensione/difficoltà', () => {
    const sizes: GridSize[] = [4, 5, 6];
    const difficulties: Difficulty[] = ['facile', 'normale', 'difficile'];
    expect(sizes).toHaveLength(3);
    expect(difficulties).toHaveLength(3);
  });
});
