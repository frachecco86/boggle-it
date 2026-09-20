// Genera set di dadi deterministici per griglie NxN, per ogni livello di difficoltà.
//
// Uso: node tools/gen-dice.mjs
//
// Convenzione: la faccia 'q' rappresenta il digramma "Qu" (Q+U inseparabili in Boggle).
//
// La difficoltà agisce sulla DISTRIBUZIONE DELLE LETTERE (la dimensione è scelta a parte):
//   facile   45% vocali, niente lettere rare straniere, poche Z
//   normale  38% vocali: bilanciata (come prima)
//   difficile 30% vocali, più consonanti rare (Z, K, Q, W, X, Y)
import { writeFileSync } from 'node:fs';

// Frequenze relative (corpus di parole italiane) usate per i livelli normale/difficile.
const FREQ_BASE = {
  a: 99, i: 87, e: 78, r: 63, o: 62, t: 59, s: 55, n: 43, c: 32, u: 29,
  l: 27, m: 26, v: 22, p: 22, d: 21, g: 17, b: 11, f: 11, z: 9, h: 4,
  q: 1, x: 1, w: 1, y: 1, k: 1, j: 1,
};

// Facile: vocabolario comune, lettere rare straniere assenti, Z ridotta.
const FREQ_EASY = {
  a: 105, i: 95, e: 88, o: 72, u: 34,
  r: 62, t: 58, s: 54, n: 44, l: 34, c: 33, m: 27, d: 22, p: 22, v: 17, g: 15, b: 12, f: 12, z: 2,
  // niente h, q, x, w, y, k, j
};

// Difficile: meno vocali, lettere rare più presenti.
const FREQ_HARD = {
  a: 88, i: 74, e: 68, o: 55, u: 26,
  r: 60, t: 57, s: 54, n: 44, c: 33, l: 28, m: 26, v: 23, p: 23, d: 22, g: 20, b: 13, f: 13,
  z: 16, h: 8, q: 3, x: 3, w: 3, y: 3, k: 3, j: 2,
};

const VOWELS = ['a', 'e', 'i', 'o', 'u'];

const LEVELS = {
  facile: {
    freq: FREQ_EASY,
    vowelRatio: 0.45,
    hFaces: 0, // niente facce H isolate nel livello facile
    qFaces: 0,
    minVowelFaces: 8,
  },
  normale: {
    freq: FREQ_BASE,
    vowelRatio: 0.38,
    hFacesRatio: 0.02,
    qFacesRatio: 0.015,
  },
  difficile: {
    freq: FREQ_HARD,
    vowelRatio: 0.3,
    hFacesRatio: 0.025,
    qFacesRatio: 0.022,
  },
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const weightedPool = (freq) => {
  const p = [];
  for (const [ch, w] of Object.entries(freq)) for (let i = 0; i < w; i++) p.push(ch);
  return p;
};

function genDice(size, level, seed) {
  const cfg = LEVELS[level];
  const rnd = mulberry32(seed);
  const diceCount = size * size;
  const facesCount = diceCount * 6;
  const pool = weightedPool(cfg.freq);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const faces = [];
  const vowelFaces = Math.max(cfg.minVowelFaces ?? 0, Math.round(facesCount * cfg.vowelRatio));
  for (let i = 0; i < vowelFaces; i++) faces.push(pick(VOWELS));

  const hFaces = cfg.hFaces !== undefined ? cfg.hFaces : Math.max(1, Math.round(facesCount * cfg.hFacesRatio));
  for (let i = 0; i < hFaces; i++) faces.push('h');

  const qFaces = cfg.qFaces !== undefined ? cfg.qFaces : Math.max(1, Math.round(facesCount * cfg.qFacesRatio));
  for (let i = 0; i < qFaces; i++) faces.push('q');

  while (faces.length < facesCount) {
    let ch = pick(pool);
    let guard = 0;
    // Evita eccesso di vocali extra (sono già state assegnate con quota dedicata).
    while (VOWELS.includes(ch) && guard++ < 40) ch = pick(pool);
    faces.push(ch);
  }

  for (let i = faces.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }

  const dice = [];
  for (let i = 0; i < diceCount; i++) dice.push(faces.slice(i * 6, i * 6 + 6));
  return dice;
}

// Seed distinti per ogni combinazione dimensione/difficoltà: set stabili e riproducibili.
const SEEDS = {
  4: { facile: 20240511, normale: 20240501, difficile: 20240521 },
  5: { facile: 20240512, normale: 20240502, difficile: 20240522 },
  6: { facile: 20240513, normale: 20240503, difficile: 20240523 },
};

const NAME_FOR = {
  facile: 'EASY',
  normale: 'NORMAL',
  difficile: 'HARD',
};

let ts = `// ⚠️  GENERATO da tools/gen-dice.mjs — non modificare a mano.\n`;
ts += `// Ogni stringa = un dado (6 facce). 'q' = faccia "Qu" (Q+U inseparabili).\n`;
ts += `// Tre livelli di difficoltà: distribuzione di vocali e consonanti diverse.\n\n`;
ts += `import type { GridSize } from './types.js';\n`;
ts += `import type { Difficulty } from './difficulty.js';\n\n`;

for (const size of [4, 5, 6]) {
  for (const level of ['facile', 'normale', 'difficile']) {
    const dice = genDice(size, level, SEEDS[size][level]);
    ts += `export const DICE_${size}_${NAME_FOR[level]}: readonly string[] = [\n`;
    ts += dice.map((d) => `  '${d.join('')}',`).join('\n') + '\n];\n\n';
  }
}

ts += `/** Mappa dimensione → difficoltà → set di dadi. */\n`;
ts += `export const DICE: Record<GridSize, Record<Difficulty, readonly string[]>> = {\n`;
for (const size of [4, 5, 6]) {
  ts += `  ${size}: { facile: DICE_${size}_EASY, normale: DICE_${size}_NORMAL, difficile: DICE_${size}_HARD },\n`;
}
ts += `};\n`;

writeFileSync(new URL('../packages/shared/src/dice.ts', import.meta.url), ts);
console.log(`✓ generati ${3 * 3} set di dadi (3 dimensioni × 3 difficoltà)`);
for (const size of [4, 5, 6]) {
  for (const level of ['facile', 'normale', 'difficile']) {
    const dice = genDice(size, level, SEEDS[size][level]);
    // `dice` è un array di array (ogni dado = 6 facce): appiattisci prima di contare.
    const all = dice.flat().join('');
    const vowels = [...all].filter((c) => VOWELS.includes(c) || c === 'q').length;
    console.log(
      `  ${size}x${size} ${level.padEnd(9)} vocali+qu: ${((vowels / all.length) * 100).toFixed(0)}%`,
    );
  }
}
