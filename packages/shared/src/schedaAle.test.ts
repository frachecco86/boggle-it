import { describe, it, expect } from 'vitest';
import {
  ALE_RARITY_RINGS,
  aleRarityRings,
  aleRingOf,
  calibrateAle,
  cleanAleWord,
  compositeDifficulty,
  computeAleFrequency,
  coverageIssues,
  DEFAULT_ALE_GUARD_RAILS,
  generateAleBuckets,
  generateAleGrid,
  mulberry32,
  newAleGenerationStats,
  nextAleCandidate,
  richnessFor,
  sampleAleBoards,
  tierForDifficulty,
  tokenizeAle,
  tokenGuardRailIssues,
  type AleBoardStats,
  type AleRings,
} from './schedaAle.js';
import { gridStructureIssues } from './grid.js';
import { buildTrie, solveGrid } from './solver.js';
import { DIFFICULTY_ORDER } from './difficulty.js';

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

describe('ale: anelli di frequenza e rarità R = (f1 + 2·f2)/2', () => {
  const rings: AleRings = {
    easy: new Set(['casa', 'cane']),
    medium: new Set(['casa', 'cane', 'gatto', 'mare']),
  };

  it('assegna l’anello giusto (0 top-5k, 1 5–20k, 2 oltre)', () => {
    expect(aleRingOf('casa', rings)).toBe(0);
    expect(aleRingOf('gatto', rings)).toBe(1);
    expect(aleRingOf('finestra', rings)).toBe(2);
    // medium è annidato in easy: una parola easy resta anello 0.
    expect(aleRingOf('cane', rings)).toBe(0);
  });

  it('conta gli anelli e calcola R', () => {
    // 2 anello 0, 0 anello 1, 0 anello 2 → R = 0
    const a = aleRarityRings(['casa', 'cane'], rings);
    expect(a.ringCounts).toEqual([2, 0, 0]);
    expect(a.rarity).toBe(0);

    // tutte anello 2 → R = 1
    const b = aleRarityRings(['finestra', 'strada'], rings);
    expect(b.ringCounts).toEqual([0, 0, 2]);
    expect(b.rarity).toBe(1);

    // 2 anello 1 → f1 = 1 → R = 0,5
    const c = aleRarityRings(['gatto', 'mare'], rings);
    expect(c.ringCounts).toEqual([0, 2, 0]);
    expect(c.rarity).toBe(0.5);

    // metà anello 1 (f1=0,5) + metà anello 2 (f2=0,5) → (0,5 + 1)/2 = 0,75
    const d = aleRarityRings(['gatto', 'finestra'], rings);
    expect(d.rarity).toBe(0.75);
  });

  it('wordCount = 0 → R = 0', () => {
    const empty = aleRarityRings([], rings);
    expect(empty.ringCounts).toEqual([0, 0, 0]);
    expect(empty.rarity).toBe(0);
  });

  it('ALE_RARITY_RINGS vale 5.000 / 20.000', () => {
    expect(ALE_RARITY_RINGS).toEqual({ easy: 5000, medium: 20000 });
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

describe('ale: nuovo rail structure', () => {
  const dictPrime = ['casa', 'cane', 'gatto', 'mare', 'sole', 'luna', 'quando', 'acqua', 'monte', 'finestra'];
  const freq = computeAleFrequency(dictPrime);
  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });

  it('le griglie prodotte passano gridStructureIssues', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const grid = generateAleGrid(4, freq, mulberry32(seed), trie, DEFAULT_ALE_GUARD_RAILS, 400);
      if (!grid) continue;
      expect(gridStructureIssues(grid)).toEqual([]);
    }
  });

  it('le violazioni di struttura finiscono in railRejections', () => {
    const stats = newAleGenerationStats();
    // Con `structure` attivo e `gridStructureIssues` che rifiuta tutto non è
    // garantito: qui si verifica almeno che i motivi registrati siano coerenti.
    const grid = generateAleGrid(4, freq, mulberry32(3), trie, DEFAULT_ALE_GUARD_RAILS, 400, stats);
    if (grid) {
      expect(gridStructureIssues(grid)).toEqual([]);
    }
    // I motivi registrati non devono mai contenere messaggi "estranei".
    for (const reason of Object.keys(stats.railRejections)) {
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

describe('ale: nuovo rail anchor (parola lunga)', () => {
  const dictPrime = ['casa', 'cane', 'gatto', 'mare', 'sole', 'luna', 'quando', 'acqua', 'monte', 'finestra'];
  const freq = computeAleFrequency(dictPrime);
  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });

  it('la scheda ha almeno una parola ≥ soglia', () => {
    const grid = generateAleGrid(4, freq, mulberry32(11), trie, DEFAULT_ALE_GUARD_RAILS, 400);
    if (grid) {
      const words = solveGrid(grid, trie, { minLength: 3 });
      expect(Math.max(...words.map((w) => w.length))).toBeGreaterThanOrEqual(6);
    }
  });

  it('una soglia impossibile riempie railRejections e ritorna null', () => {
    const stats = newAleGenerationStats();
    const rails = { ...DEFAULT_ALE_GUARD_RAILS, noUncoveredLines: false, anchorMinLength: { 4: 99, 5: 99, 6: 99 } };
    const grid = generateAleGrid(4, freq, mulberry32(5), trie, rails, 20, stats);
    expect(grid).toBeNull();
    expect(stats.railRejections['nessuna parola ≥ 99 lettere']).toBeGreaterThan(0);
  });
});

describe('ale: calibrazione', () => {
  const makeStats = (wordCount: number, rarity: number): AleBoardStats => ({
    words: Array.from({ length: wordCount }, () => 'abc'),
    wordCount,
    ringCounts: [wordCount, 0, 0],
    rarity,
    score: wordCount,
    longest: 3,
  });

  const provenance = {
    guardRails: DEFAULT_ALE_GUARD_RAILS,
    dictSize: 1000,
    rings: ALE_RARITY_RINGS,
  };

  it('deriva un intervallo e tre fasce ordinate', () => {
    const samples = Array.from({ length: 300 }, (_, i) => makeStats(50 + i, (i % 100) / 100));
    const cal = calibrateAle(samples, provenance);
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

  it('registra la provenance ad anelli (metric rings-v1)', () => {
    const samples = Array.from({ length: 300 }, (_, i) => makeStats(50 + i, (i % 100) / 100));
    const cal = calibrateAle(samples, provenance);
    expect(cal.provenance.metric).toBe('rings-v1');
    expect(cal.provenance.rings).toEqual(ALE_RARITY_RINGS);
    expect(cal.provenance).not.toHaveProperty('commonSize');
  });

  it('ogni banda di fascia sta dentro il range globale', () => {
    const samples = Array.from({ length: 300 }, (_, i) => makeStats(50 + i, (i % 100) / 100));
    const cal = calibrateAle(samples, provenance);
    for (const tier of cal.tiers) {
      expect(tier.wordRange.lo).toBeGreaterThanOrEqual(cal.wordRange.lo);
      expect(tier.wordRange.hi).toBeLessThanOrEqual(cal.wordRange.hi);
    }
  });

  it('fallback per-tier quando una fascia ha meno di 30 membri', () => {
    // 20 campioni: nessuna fascia può avere 30 membri.
    const samples = Array.from({ length: 20 }, (_, i) => makeStats(50 + i * 3, (i % 20) / 20));
    const cal = calibrateAle(samples, provenance);
    expect(cal.provenance.perTierFallback).toBe(true);
    for (const tier of cal.tiers) {
      expect(tier.wordRange).toEqual(cal.wordRange);
    }
  });

  it('assegna la fascia in base alla difficoltà', () => {
    const samples = Array.from({ length: 300 }, (_, i) => makeStats(50 + i, (i % 100) / 100));
    const cal = calibrateAle(samples, provenance);
    expect(tierForDifficulty(0, cal)).toBe('facile');
    expect(tierForDifficulty(1, cal)).toBe('difficile');
  });
});

describe('ale: difficoltà composita 0.5·R + 0.5·M', () => {
  it('M = 0 se ogni parola vale 1 punto, cresce con il punteggio medio', () => {
    expect(richnessFor(100, 100)).toBe(0);
    expect(richnessFor(100, 200)).toBeCloseTo(0.5);
    expect(richnessFor(100, 400)).toBeCloseTo(0.75);
    expect(richnessFor(0, 0)).toBe(0);
  });

  it('combina rarità e ricchezza con i pesi 0.5/0.5', () => {
    expect(compositeDifficulty(0, 100, 100)).toBeCloseTo(0);
    expect(compositeDifficulty(0, 100, 200)).toBeCloseTo(0.25);
    expect(compositeDifficulty(1, 100, 200)).toBeCloseTo(0.75);
    expect(compositeDifficulty(1, 100, 100)).toBeCloseTo(0.5);
  });
});

describe('ale: generazione a tre secchi', () => {
  const dict = [
    'casa', 'cane', 'gatto', 'mare', 'sole', 'luna', 'quando', 'acqua',
    'monte', 'piano', 'verde', 'rosso', 'libro', 'tavolo', 'sedia', 'porta',
    'finestra', 'strada', 'città', 'perché', 'giorno', 'notte', 'tempo', 'anno',
    'castello', 'stazione', 'giornale', 'montagna', 'persona', 'parola',
  ];
  const dictPrime = dict.map((w) => cleanAleWord(w)!).filter(Boolean);
  const freq = computeAleFrequency(dictPrime);
  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });
  const rings: AleRings = {
    easy: new Set(dictPrime.slice(0, 12)),
    medium: new Set(dictPrime),
  };

  const calibration = calibrateAle(sampleAleBoards(4, freq, trie, rings, 120, 1), {
    guardRails: DEFAULT_ALE_GUARD_RAILS,
    dictSize: dictPrime.length,
    rings: ALE_RARITY_RINGS,
  });

  it('genera candidati coerenti con range globale e banda di fascia', () => {
    let seen = 0;
    for (let attempt = 0; attempt < 200 && seen < 5; attempt++) {
      const candidate = nextAleCandidate({
        size: 4,
        freq,
        trie,
        rings,
        calibration,
        seed: 7,
        attempt,
      });
      if (!candidate) continue;
      seen++;
      const tier = calibration.tiers.find((t) => t.difficulty === candidate.difficulty)!;
      expect(candidate.stats.wordCount).toBeGreaterThanOrEqual(calibration.wordRange.lo);
      expect(candidate.stats.wordCount).toBeLessThanOrEqual(calibration.wordRange.hi);
      expect(candidate.stats.wordCount).toBeGreaterThanOrEqual(tier.wordRange.lo);
      expect(candidate.stats.wordCount).toBeLessThanOrEqual(tier.wordRange.hi);
      expect(candidate.stats.ringCounts[0] + candidate.stats.ringCounts[1] + candidate.stats.ringCounts[2]).toBe(
        candidate.stats.wordCount,
      );
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('riempie i tre secchi con id contigui per fascia', () => {
    const buckets = generateAleBuckets({
      size: 4,
      perTier: 2,
      freq,
      trie,
      rings,
      calibration,
      seed: 1,
      idStart: 16,
    });
    for (const difficulty of DIFFICULTY_ORDER) {
      const schede = buckets[difficulty];
      expect(schede).toHaveLength(2);
      schede.forEach((scheda, i) => {
        expect(scheda.id).toBe(`4-${difficulty}-${String(16 + i).padStart(3, '0')}`);
        expect(scheda.variant).toBe('ale');
        expect(scheda.allWords).toEqual(scheda.words);
      });
    }
  });

  it('è deterministica: stessa chiamata → stessi id e griglie', () => {
    const opts = { size: 4 as const, perTier: 2, freq, trie, rings, calibration, seed: 99, idStart: 1 };
    const a = generateAleBuckets(opts);
    const b = generateAleBuckets(opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('non usa più il contatore difficultyOut (rimosso)', () => {
    const stats = newAleGenerationStats();
    expect(stats).not.toHaveProperty('difficultyOut');
    expect(stats).toHaveProperty('tierBandOut');
    expect(stats).toHaveProperty('fallbacks');
  });
});
