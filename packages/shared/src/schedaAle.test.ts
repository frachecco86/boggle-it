import { describe, it, expect } from 'vitest';
import {
  buildAleCommon,
  buildAleLemmas,
  calibrateAle,
  cleanAleWord,
  compositeDifficulty,
  computeAleFrequency,
  coverageIssues,
  DEFAULT_ALE_GUARD_RAILS,
  generateAleGrid,
  generateAleScheda,
  isAleCommon,
  mulberry32,
  sampleAleBoards,
  scarcityFor,
  tierForDifficulty,
  tokenizeAle,
  tokenGuardRailIssues,
} from './schedaAle.js';
import { buildTrie } from './solver.js';

describe('ale: pre-processing', () => {
  it('piega gli accenti', () => {
    expect(cleanAleWord('perché')).toBe('perche');
    expect(cleanAleWord('città')).toBe('citta');
    expect(cleanAleWord('così')).toBe('cosi');
    expect(cleanAleWord('crêpe')).toBe('crepe');
  });

  it('scarta voci con caratteri non a-z', () => {
    expect(cleanAleWord('e-mail')).toBeNull();
    expect(cleanAleWord('divano-letto')).toBeNull();
    expect(cleanAleWord('t-shirt')).toBeNull();
    expect(cleanAleWord('un due')).toBeNull();
    expect(cleanAleWord('123')).toBeNull();
  });

  it('scarta le parole più corte di 3 lettere', () => {
    expect(cleanAleWord('ab')).toBeNull();
    expect(cleanAleWord('abc')).toBe('abc');
  });

  it('scarta q non seguita da u', () => {
    expect(cleanAleWord('iraq')).toBeNull();
    expect(cleanAleWord('soqquadro')).toBeNull();
    expect(cleanAleWord('quando')).toBe('quando');
    expect(cleanAleWord('acqua')).toBe('acqua');
  });
});

describe('ale: tokenizer (QU = un token)', () => {
  it('tratta qu come token unico', () => {
    expect(tokenizeAle('quando')).toEqual(['qu', 'a', 'n', 'd', 'o']);
    expect(tokenizeAle('acqua')).toEqual(['a', 'c', 'qu', 'a']);
    expect(tokenizeAle('cuore')).toEqual(['c', 'u', 'o', 'r', 'e']);
  });

  it('QU conta due lettere ma un token', () => {
    expect(tokenizeAle('quando').length).toBe(5);
    expect('quando'.length).toBe(6);
  });
});

describe('ale: frequenza dei token', () => {
  it('calcola la frazione di voci che contengono un token', () => {
    const freq = computeAleFrequency(['casa', 'cane', 'quando']);
    // 'a' è in tutte e 3
    expect(freq.freq.get('a')).toBe(1);
    // 'c' è in 2 su 3
    expect(freq.freq.get('c')).toBeCloseTo(2 / 3);
    // qu è solo in `quando`
    expect(freq.freq.get('qu')).toBeCloseTo(1 / 3);
  });
});

describe('ale: Common = NVdB ∩ Dict’', () => {
  it('tiene solo le parole in entrambi', () => {
    const dict = new Set(['casa', 'cane', 'gatto']);
    const common = buildAleCommon(['casa', 'gatto', 'volpe'], dict);
    expect([...common].sort()).toEqual(['casa', 'gatto']);
  });

  it('normalizza le parole NVdB prima dell’intersezione', () => {
    const dict = new Set(['perche']);
    const common = buildAleCommon(['perché'], dict);
    expect([...common]).toEqual(['perche']);
  });
});

describe('ale: guard rails sui token', () => {
  it('accetta una griglia conforme', () => {
    const tokens = ['c', 'a', 's', 'a', 'm', 'e', 'n', 't', 'e'];
    expect(tokenGuardRailIssues(tokens, 3, DEFAULT_ALE_GUARD_RAILS)).toEqual([]);
  });

  it('rifiuta troppe vocali o troppo poche (banda 30–60%)', () => {
    const troppe = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'i', 'o'];
    expect(
      tokenGuardRailIssues(troppe, 3, DEFAULT_ALE_GUARD_RAILS).some((i: string) => i.startsWith('vocali')),
    ).toBe(true);
    const pochissime = ['b', 'c', 'd', 'f', 'g', 'h', 'l', 'm', 'n'];
    expect(
      tokenGuardRailIssues(pochissime, 3, DEFAULT_ALE_GUARD_RAILS).some((i: string) => i.startsWith('vocali')),
    ).toBe(true);
  });

  it('accetta fino a tre token rari H/Z/QU, rifiuta il quarto', () => {
    // 3 rari + vocali 4/9 = 44% (dentro la banda 30–60%)
    const tre = ['z', 'h', 'qu', 'c', 'd', 'f', 'a', 'e', 'i'];
    expect(tokenGuardRailIssues(tre, 3, DEFAULT_ALE_GUARD_RAILS)).toEqual([]);
    // 4 rari + vocali 3/9 = 33% (dentro la banda)
    const quattro = ['z', 'h', 'qu', 'z', 'c', 'd', 'a', 'e', 'i'];
    expect(
      tokenGuardRailIssues(quattro, 3, DEFAULT_ALE_GUARD_RAILS).some((i: string) => i.includes('rari')),
    ).toBe(true);
  });
});

describe('ale: copertura delle righe/colonne', () => {
  it('segnala righe e colonne senza soluzioni', () => {
    // Tutte le celle usate tranne l’ultima riga e l’ultima colonna.
    const used = [
      true, true, false,
      true, true, false,
      false, false, false,
    ];
    const issues = coverageIssues(used, 3);
    expect(issues.some((i: string) => i.includes('righe'))).toBe(true);
    expect(issues.some((i: string) => i.includes('colonne'))).toBe(true);
  });

  it('non segnala nulla quando ogni linea è coperta', () => {
    const used = new Array(9).fill(true);
    expect(coverageIssues(used, 3)).toEqual([]);
  });
});

describe('ale: determinismo', () => {
  it('stesso seme → stessa sequenza', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('la griglia dipende solo dal seme', () => {
    const freq = computeAleFrequency(['casa', 'cane', 'gatto', 'mare', 'sole', 'luna', 'quando']);
    const trie = buildTrie(['casa', 'cane', 'gatto', 'mare', 'sole', 'luna', 'quando'], {
      maxLength: 16,
      minLength: 3,
    });
    const g1 = generateAleGrid(4, freq, mulberry32(7), trie);
    const g2 = generateAleGrid(4, freq, mulberry32(7), trie);
    expect(g1?.tiles.map((t) => t.letter)).toEqual(g2?.tiles.map((t) => t.letter));
  });
});

describe('ale: calibrazione', () => {
  const makeStats = (wordCount: number, rarity: number) => ({
    words: Array.from({ length: wordCount }, () => 'abc'),
    wordCount,
    commonCount: Math.round(wordCount * (1 - rarity)),
    rarity,
    score: wordCount,
    longest: 3,
  });

  it('deriva un intervallo e tre fasce ordinate', () => {
    const samples = Array.from({ length: 100 }, (_, i) => makeStats(50 + i * 2, (i % 100) / 100));
    const cal = calibrateAle(samples, {
      guardRails: DEFAULT_ALE_GUARD_RAILS,
      dictSize: 1000,
      commonSize: 500,
    });
    expect(cal.wordRange.lo).toBeLessThan(cal.wordRange.hi);
    expect(cal.tiers).toHaveLength(3);
    expect(cal.tiers[0]!.difficulty).toBe('facile');
    expect(cal.tiers[1]!.difficulty).toBe('normale');
    expect(cal.tiers[2]!.difficulty).toBe('difficile');
    // le fasce coprono l'intero [0, 1] senza buchi
    expect(cal.tiers[0]!.range.min).toBe(0);
    expect(cal.tiers[2]!.range.max).toBe(1);
    expect(cal.tiers[0]!.range.max).toBeCloseTo(cal.tiers[1]!.range.min);
  });

  it('assegna la fascia in base alla difficoltà', () => {
    const samples = Array.from({ length: 100 }, (_, i) => makeStats(50 + i, (i % 100) / 100));
    const cal = calibrateAle(samples, {
      guardRails: DEFAULT_ALE_GUARD_RAILS,
      dictSize: 1000,
      commonSize: 500,
    });
    expect(tierForDifficulty(0, cal)).toBe('facile');
    expect(tierForDifficulty(1, cal)).toBe('difficile');
  });
});
describe('ale: difficoltà composita 0.25·R + 0.75·S', () => {
  it('S = 0 al massimo dell’intervallo, S = 1 al minimo', () => {
    expect(scarcityFor(200, { lo: 100, hi: 200 })).toBe(0);
    expect(scarcityFor(100, { lo: 100, hi: 200 })).toBe(1);
    expect(scarcityFor(150, { lo: 100, hi: 200 })).toBeCloseTo(0.5);
  });

  it('combina rarità e scarsità con i pesi 0.25/0.75', () => {
    const range = { lo: 100, hi: 200 };
    // R = 0 (tutte comuni), S = 0 (massimo di parole) → 0
    expect(compositeDifficulty(0, 200, range)).toBeCloseTo(0);
    // R = 0, S = 1 (minimo di parole) → 0.75
    expect(compositeDifficulty(0, 100, range)).toBeCloseTo(0.75);
    // R = 1 (tutte rare), S = 1 → 1
    expect(compositeDifficulty(1, 100, range)).toBeCloseTo(1);
    // R = 1, S = 0 → 0.25
    expect(compositeDifficulty(1, 200, range)).toBeCloseTo(0.25);
  });

  it('una griglia SCARSA ma di parole comuni batte una FITTA di parole rare', () => {
    /*
     * È il senso della nuova metrica: la scarsità pesa tre volte la rarità.
     * Esempio: 0.75·1 = 0.75 contro 0.25·1 = 0.25.
     */
    const range = { lo: 100, hi: 200 };
    const scarsaComune = compositeDifficulty(0, 100, range);
    const fittaRara = compositeDifficulty(1, 200, range);
    expect(scarsaComune).toBeGreaterThan(fittaRara);
  });
});

describe('ale: generazione end-to-end', () => {
  const dict = [
    'casa', 'cane', 'gatto', 'mare', 'sole', 'luna', 'quando', 'acqua',
    'monte', 'piano', 'verde', 'rosso', 'libro', 'tavolo', 'sedia', 'porta',
    'finestra', 'strada', 'città', 'perché', 'giorno', 'notte', 'tempo', 'anno',
  ];
  const dictPrime = dict.map((w) => cleanAleWord(w)!).filter(Boolean);
  const dictSet = new Set(dictPrime);
  const freq = computeAleFrequency(dictPrime);
  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });
  const common = new Set(dictPrime.slice(0, 12));

  it('genera una scheda "ale" con tutti i campi', () => {
    const samples = sampleAleBoards(4, freq, trie, common, 200, 1);
    const cal = calibrateAle(samples, {
      guardRails: DEFAULT_ALE_GUARD_RAILS,
      dictSize: dictPrime.length,
      commonSize: common.size,
    });
    const scheda = generateAleScheda({
      size: 4,
      difficulty: 'normale',
      freq,
      trie,
      common,
      calibration: cal,
      seed: 12345,
      idPrefix: '4-normale',
    });
    expect(scheda.variant).toBe('ale');
    expect(scheda.id).toBe('4-normale-001');
    expect(scheda.size).toBe(4);
    expect(scheda.difficulty).toBe('normale');
    expect(scheda.grid.split('\n')).toHaveLength(4);
    expect(scheda.allWords).toEqual(scheda.words);
    // Nessuna lettera non italiana (guard rail del progetto).
    for (const ch of scheda.grid.replace(/\n/g, '')) {
      expect('jkwxy').not.toContain(ch);
    }
  });

  it('è deterministica: stesso seme → stessa griglia', () => {
    const samples = sampleAleBoards(4, freq, trie, common, 100, 1);
    const cal = calibrateAle(samples, {
      guardRails: DEFAULT_ALE_GUARD_RAILS,
      dictSize: dictPrime.length,
      commonSize: common.size,
    });
    const opts = {
      size: 4 as const,
      difficulty: 'facile' as const,
      freq,
      trie,
      common,
      calibration: cal,
      seed: 999,
      idPrefix: '4-facile',
    };
    const a = generateAleScheda(opts);
    const b = generateAleScheda(opts);
    expect(a.grid).toBe(b.grid);
    expect(a.words).toEqual(b.words);
  });

  it('gli id rispettano l’offset (nessuna collisione con standard/full)', () => {
    const samples = sampleAleBoards(4, freq, trie, common, 100, 1);
    const cal = calibrateAle(samples, {
      guardRails: DEFAULT_ALE_GUARD_RAILS,
      dictSize: dictPrime.length,
      commonSize: common.size,
    });
    const scheda = generateAleScheda({
      size: 4,
      difficulty: 'facile',
      freq,
      trie,
      common,
      calibration: cal,
      seed: 1,
      idPrefix: '4-facile',
      idStart: 16,
      idIndex: 0,
    });
    expect(scheda.id).toBe('4-facile-016');
  });
});

describe('ale: radice (lemma) per la parola comune', () => {
  it('costruisce la mappa forma → lemma dal testo Morph-it', () => {
    const morph = ['amo\tamare\tVER:ind+pres+1+s', 'cani\tcane\tNOM+PLU', 'cervo\tcervo\tNOM'].join('\n');
    const lemmas = buildAleLemmas(morph);
    expect(lemmas.get('amo')).toBe('amare');
    expect(lemmas.get('cani')).toBe('cane');
    // forma === lemma: non serve una voce (evita rumore).
    expect(lemmas.has('cervo')).toBe(false);
  });

  it('`amo` è comune perché lo è la radice `amare`', () => {
    const common = new Set(['amare']);
    const lemmas = new Map([['amo', 'amare']]);
    expect(isAleCommon('amo', common, lemmas)).toBe(true);
  });

  it('una forma di un lemma NON comune resta non comune', () => {
    const common = new Set(['amare']);
    const lemmas = new Map([['abbacchiamo', 'abbacchiare']]);
    expect(isAleCommon('abbacchiamo', common, lemmas)).toBe(false);
  });

  it('senza mappa dei lemmi si comporta come prima', () => {
    const common = new Set(['casa']);
    expect(isAleCommon('casa', common, undefined)).toBe(true);
    expect(isAleCommon('amo', common, undefined)).toBe(false);
  });
});
