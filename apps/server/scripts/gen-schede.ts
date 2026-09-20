/**
 * Genera le schede pre-calcolate e le scrive in `packages/shared/schede/`.
 *
 * Uso:
 *   pnpm gen:schede                      # tutte le combinazioni, 100 schede ciascuna
 *   pnpm gen:schede -- --size 4 --difficolta normale --n 60
 *   pnpm gen:schede -- --size 4 --difficolta facile --n 40 --append
 *
 * Opzioni:
 *   --size 4|5|6          dimensione della griglia (default: tutte)
 *   --difficolta <nome>   molto-facile|facile|normale|difficile (default: tutte)
 *   --n <numero>          schede da generare per combinazione (default 100)
 *   --append              aggiunge alle schede esistenti invece di sovrascrivere
 *   --seed <numero>       seme del generatore (per risultati riproducibili)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSchedaPool,
  normalizeWord,
  schedaFileName,
  SCHEDA_FORMAT_VERSION,
  type Difficulty,
  type GridSize,
  type Scheda,
  type SchedaFile,
} from '@boggle/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DICT_DIR = path.join(ROOT, 'packages/dictionary/data');
const OUT_DIR = path.join(ROOT, 'packages/shared/schede');

const ALL_SIZES: GridSize[] = [4, 5, 6];
const ALL_DIFFICULTIES: Difficulty[] = ['molto-facile', 'facile', 'normale', 'difficile'];

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function readWords(file: string): string[] {
  const text = readFileSync(path.join(DICT_DIR, file), 'utf8');
  return text.split('\n').map(normalizeWord).filter((w) => w.length >= 3);
}

/** Legge una lista curata (una voce per riga, righe `#` ignorate). */
function readCuratedList(file: string): string[] {
  const full = path.join(DICT_DIR, file);
  if (!existsSync(full)) return [];
  return readFileSync(full, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(normalizeWord)
    .filter((w) => w.length >= 3);
}

/** PRNG deterministico (mulberry32): con --seed la generazione è riproducibile. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadExisting(size: GridSize, difficulty: Difficulty): Scheda[] {
  const file = path.join(OUT_DIR, schedaFileName(size, difficulty));
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as SchedaFile;
    return Array.isArray(parsed.schede) ? parsed.schede : [];
  } catch {
    return [];
  }
}

function main(): void {
  const sizes = arg('size') ? [Number(arg('size')) as GridSize] : ALL_SIZES;
  const difficulties = arg('difficolta') ? [arg('difficolta') as Difficulty] : ALL_DIFFICULTIES;
  const count = Number(arg('n', '100'));
  const append = hasFlag('append');
  const seed = arg('seed') ? Number(arg('seed')) : undefined;
  const rng = seed !== undefined ? mulberry32(seed) : undefined;

  for (const size of sizes) {
    if (!ALL_SIZES.includes(size)) throw new Error(`Dimensione non valida: ${size}`);
  }
  for (const d of difficulties) {
    if (!ALL_DIFFICULTIES.includes(d)) throw new Error(`Difficoltà non valida: ${d}`);
  }

  console.log('Carico il dizionario…');
  const fullWords = readWords('words.txt');
  const commonWords = readWords('60000_parole_italiane.txt');
  // Le abbreviazioni da vocabolario (`agg`, `avv`, `biol`) NON sono parole giocabili:
  // sono marcatori grammaticali e rendevano le schede "strane". Qui non entrano.
  const allowedConsonantEndings = readCuratedList('consonant-endings.txt');
  console.log(`  dizionario completo: ${fullWords.length.toLocaleString('it-IT')} parole`);
  console.log(`  lessico comune:      ${commonWords.length.toLocaleString('it-IT')} parole`);
  console.log(`  finali in consonante ammessi: ${allowedConsonantEndings.length}`);

  const pool = createSchedaPool({ fullWords, commonWords, allowedConsonantEndings });
  mkdirSync(OUT_DIR, { recursive: true });

  for (const size of sizes) {
    for (const difficulty of difficulties) {
      const existing = append ? loadExisting(size, difficulty) : [];
      const startIndex = existing.length + 1;
      const startedAt = Date.now();
      const fresh = pool.generate(size, difficulty, count, { startIndex, rng });
      const schede = append ? [...existing, ...fresh] : fresh;
      const file: SchedaFile = {
        version: SCHEDA_FORMAT_VERSION,
        generatedAt: new Date().toISOString(),
        size,
        difficulty,
        schede,
      };
      const outPath = path.join(OUT_DIR, schedaFileName(size, difficulty));
      writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
      const avgWords = schede.length ? Math.round(schede.reduce((s, x) => s + x.words.length, 0) / schede.length) : 0;
      const avgLongest = schede.length ? (schede.reduce((s, x) => s + x.longest, 0) / schede.length).toFixed(1) : '0';
      console.log(
        `✓ ${size}×${size} ${difficulty}: ${schede.length} schede  (medie: ${avgWords} parole, più lunga ${avgLongest})  in ${Date.now() - startedAt}ms`,
      );
    }
  }
  console.log(`\nSchede scritte in ${path.relative(ROOT, OUT_DIR)}/`);
}

main();
