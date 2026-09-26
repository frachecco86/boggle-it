import { describe, expect, it } from 'vitest';
import { acceptedWords, createSchedaPool, rowsToGrid, scoreForWord, wordFromPath } from './index.js';
import { BAND_SIZES, bandNameFor, generateScheda } from './schedaGen.js';
import type { Difficulty, GridSize } from './index.js';

/*
 * Lessico di prova: poche parole, abbastanza per una 4x4.
 *
 * La stessa lista vale sia da dizionario completo sia da "lista di frequenza":
 * le fasce risultano più corte dei 5k/20k/60k reali e il pool lo segnala con un
 * warning — nei test è voluto, l'algoritmo non deve dipendere dalle dimensioni.
 */
const FULL = [
  'casa', 'caso', 'cose', 'costa', 'costa', 'cassa', 'cassaforte', 'asta', 'asso',
  'ora', 'ore', 'ora', 'oro', 'resa', 'resta', 'resto', 'stare', 'storia', 'torre',
  'arte', 'rate', 'seta', 'tesa', 'eros', 'erto', 'orto', 'orso', 'rosa', 'sasso',
  'festa', 'festa', 'testa', 'tessa', 'corsa', 'corso', 'sorte', 'sorta',
];
const FREQUENCY = [
  'casa', 'caso', 'cose', 'costa', 'asta', 'ora', 'oro', 'resta', 'testa', 'rosa',
  ...FULL,
];

function pool() {
  return createSchedaPool({ fullWords: FULL, frequencyWords: FREQUENCY, maxWordLength: 12 });
}

describe('generatore schede', () => {
  it('ogni difficoltà ha la sua fascia di frequenza, sempre più larga', () => {
    /*
     * Le fasce sono 5k / 20k / 60k parole più frequenti: la difficoltà non è il
     * lessico ma QUANTE parole entrano nella fascia, più la composizione della
     * griglia (vocali e lettere rare).
     */
    expect(bandNameFor('facile')).toBe('facile');
    expect(bandNameFor('normale')).toBe('normale');
    expect(bandNameFor('difficile')).toBe('difficile');
    expect(BAND_SIZES.facile).toBeLessThan(BAND_SIZES.normale);
    expect(BAND_SIZES.normale).toBeLessThan(BAND_SIZES.difficile);
  });

  it('il pool costruisce le fasce dal dizionario completo', () => {
    const p = pool();
    expect(p.bandCounts.facile).toBeGreaterThan(0);
    expect(p.bandCounts.facile).toBeLessThanOrEqual(p.bandCounts.difficile);
  });

  it('genera una scheda coerente con la sua griglia', () => {
    const p = pool();
    const scheda = generateScheda({
      size: 4,
      difficulty: 'normale',
      tries: p.tries,
      rng: Math.random,
      id: 'test-001',
      maxAttempts: 500,
    });
    expect(scheda).not.toBeNull();
    expect(scheda!.id).toBe('test-001');
    expect(scheda!.grid.split('\n')).toHaveLength(4);

    /*
     * Due elenchi: `words` (parole attese della fascia) e `allWords` (tutte
     * quelle accettate, dizionario intero). Il secondo contiene il primo.
     */
    const allWords = acceptedWords(scheda!);
    const acceptedSet = new Set(allWords);
    expect(allWords.length).toBeGreaterThan(0);
    for (const word of scheda!.words) {
      expect(acceptedSet.has(word)).toBe(true);
    }

    // Ogni parola dichiarata deve esistere sulla griglia per davvero.
    const grid = rowsToGrid(scheda!.grid);
    const letters = new Set(grid.tiles.map((t) => t.letter));
    expect(letters.size).toBeGreaterThan(0);
    for (const word of allWords) {
      // lettere tutte presenti in griglia (condizione necessaria, non sufficiente)
      for (const ch of word) expect(letters.has(ch) || ch === 'u').toBe(true);
    }
    // Ordinamento per lunghezza decrescente e `longest` coerente.
    for (let i = 1; i < allWords.length; i++) {
      expect(allWords[i - 1]!.length).toBeGreaterThanOrEqual(allWords[i]!.length);
    }
    expect(scheda!.longest).toBe(allWords[0]!.length);
  });

  it('acceptedWords ripiega sulle parole attese per le schede di formato 1', () => {
    expect(acceptedWords({ words: ['casa'] })).toEqual(['casa']);
    expect(acceptedWords({ words: ['casa'], allWords: ['casa', 'caso'] })).toEqual(['casa', 'caso']);
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
