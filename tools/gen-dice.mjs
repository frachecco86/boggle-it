// Genera set di dadi deterministici per griglie NxN basati su frequenze lettere italiane.
// Uso: node tools/gen-dice.mjs
// Convenzione: la faccia 'q' rappresenta il digramma "Qu" (Q+U inseparabili in Boggle).
import { writeFileSync } from 'node:fs';

const FREQ = {
  a: 99, i: 87, e: 78, r: 63, o: 62, t: 59, s: 55, n: 43, c: 32, u: 29,
  l: 27, m: 26, v: 22, p: 22, d: 21, g: 17, b: 11, f: 11, z: 9, h: 4,
  q: 1, x: 1, w: 1, y: 1, k: 1, j: 1,
};
const VOWELS = ['a', 'e', 'i', 'o', 'u'];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const weightedPool = () => {
  const p = [];
  for (const [ch, w] of Object.entries(FREQ)) for (let i = 0; i < w; i++) p.push(ch);
  return p;
};

function genDice(size, seed) {
  const rnd = mulberry32(seed);
  const diceCount = size * size;
  const facesCount = diceCount * 6;
  const pool = weightedPool();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const faces = [];
  // Quote garantite per garantire giocabilità in italiano
  const vowelFaces = Math.round(facesCount * 0.38);
  const hFaces = Math.max(1, Math.round(facesCount * 0.02));
  const qFaces = Math.max(1, Math.round(facesCount * 0.015));
  for (let i = 0; i < vowelFaces; i++) faces.push(pick(VOWELS));
  for (let i = 0; i < hFaces; i++) faces.push('h');
  for (let i = 0; i < qFaces; i++) faces.push('q');
  while (faces.length < facesCount) {
    let ch = pick(pool);
    let guard = 0;
    while (VOWELS.includes(ch) && guard++ < 30) ch = pick(pool); // evita eccesso vocali extra
    faces.push(ch);
  }
  // shuffle facce
  for (let i = faces.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }
  // distribuisci 6 facce per dado SENZA spezzare i gruppi
  const dice = [];
  for (let i = 0; i < diceCount; i++) dice.push(faces.slice(i * 6, i * 6 + 6));
  return dice;
}

const labels = { 4: 'DICE_4', 5: 'DICE_5', 6: 'DICE_6' };
const seeds = { 4: 20240501, 5: 20240502, 6: 20240503 };

let ts = `// ⚠️  GENERATO da tools/gen-dice.mjs — non modificare a mano.\n`;
ts += `// Ogni stringa = un dado (6 facce). 'q' = faccia "Qu" (Q+U inseparabili).\n\n`;
for (const size of [4, 5, 6]) {
  const dice = genDice(size, seeds[size]);
  ts += `export const ${labels[size]}: readonly string[] = [\n`;
  ts += dice.map((d) => `  '${d.join('')}',`).join('\n') + '\n];\n\n';
}
writeFileSync(new URL('../packages/shared/src/dice.ts', import.meta.url), ts);
console.log(ts);
