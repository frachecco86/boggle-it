/**
 * Misura le griglie che l'algoritmo produce, per TARARE le bande di densità.
 *
 * Perché serve: `DENSITY` e `MIN_LONGEST` in `packages/shared/src/schedaGen.ts`
 * non si scelgono a intuito. Sono misurati su griglie reali generate con la
 * distribuzione di lettere della fascia, così il generatore li soddisfa in pochi
 * tentativi e la difficoltà resta separata fra i livelli.
 *
 * Uso:
 *   pnpm --filter @boggle/server measure:schede            # 300 griglie per categoria
 *   pnpm --filter @boggle/server measure:schede -- --n 1000
 *   pnpm --filter @boggle/server measure:schede -- --size 4
 *
 * Stampa, per ogni dimensione × difficoltà: percentili del numero di parole,
 * quota di griglie con una parola lunga abbastanza, quota dentro la banda
 * dichiarata e le lettere più frequenti della fascia.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSchedaPool,
  DIFFICULTY_ORDER,
  densityBandFor,
  generateGrid,
  minLongestFor,
  normalizeWord,
  solveGrid,
  type Difficulty,
  type GridSize,
} from '@boggle/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DICT_DIR = path.join(ROOT, 'packages/dictionary/data');

const ALL_SIZES: GridSize[] = [4, 5, 6];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

function readWords(file: string): string[] {
  const full = path.join(DICT_DIR, file);
  if (!existsSync(full)) {
    throw new Error(`Manca ${file}: esegui \`pnpm --filter @boggle/dictionary build\``);
  }
  return readFileSync(full, 'utf8')
    .split('\n')
    .map((l) => normalizeWord(l.trim()))
    .filter((w) => w.length >= 3);
}

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

/** Percentile di una serie (indice più vicino, sufficiente per tarare bande). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

/**
 * Composizione media delle griglie di una difficoltà (vocali e lettere rare).
 *
 * Serve a vedere se i livelli si separano DAVVERO nella composizione: è la leva
 * che il giocatore sente, perché le statistiche di lettera dell'italiano sono
 * uguali in tutte le fasce di frequenza (misurato).
 */
function compositionOf(size: GridSize, difficulty: Difficulty, samples = 200): string {
  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
  const RARE = new Set(['z', 'k', 'w', 'x', 'y', 'j']);
  let vowels = 0;
  let rare = 0;
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const grid = generateGrid(size, Math.random, difficulty);
    for (const tile of grid.tiles) {
      total++;
      if (VOWELS.has(tile.letter)) vowels++;
      if (RARE.has(tile.letter)) rare++;
    }
  }
  return `vocali ${((vowels / total) * 100).toFixed(1)}%, rare ${((rare / total) * 100).toFixed(1)}%`;
}

function main(): void {
  const count = Number(arg('n') ?? '300');
  const onlySize = arg('size') ? (Number(arg('size')) as GridSize) : undefined;
  const sizes = onlySize ? [onlySize] : ALL_SIZES;

  console.log('Carico dizionario e fasce…');
  const pool = createSchedaPool({
    fullWords: readWords('words.txt'),
    frequencyWords: readWords('frequency-it.txt'),
    allowedConsonantEndings: readCuratedList('consonant-endings.txt'),
    abbreviations: readCuratedList('abbreviations.txt'),
  });
  console.log(`  ${count} griglie per categoria\n`);

  for (const size of sizes) {
    for (const difficulty of DIFFICULTY_ORDER) {
      const bandTrie = pool.tries.bands[difficulty];
      const band = densityBandFor(size, difficulty);
      const minLongest = minLongestFor(size);

      const accepted: number[] = [];
      const bandCounts: number[] = [];
      const longs: number[] = [];
      let longEnough = 0;
      let inBand = 0;
      let both = 0;
      const started = Date.now();

      for (let i = 0; i < count; i++) {
        const grid = generateGrid(size, Math.random, difficulty);
        // Quante parole può trovare DAVVERO il giocatore (dizionario intero):
        // è il numero che determina la ricchezza della griglia, ed è la misura
        // su cui è tarata la banda di densità.
        const all = solveGrid(grid, pool.tries.full, { limit: 50_000, minLength: 3 });
        let longest = 0;
        for (const w of all) if (w.length > longest) longest = w.length;
        accepted.push(all.length);
        longs.push(longest);
        const okLong = longest >= minLongest;
        const okBand = all.length >= band.min && all.length <= band.max;
        if (okLong) longEnough++;
        if (okBand) inBand++;
        if (okLong && okBand) {
          both++;
          // Parole ATTESE (fascia) sulle griglie che passano: dice quante parole
          // mostrerà il riepilogo "parole che esistevano".
          bandCounts.push(solveGrid(grid, bandTrie, { limit: 3000, minLength: 3 }).length);
        }
      }

      const sortedAccepted = [...accepted].sort((a, b) => a - b);
      const pct = (p: number) => percentile(sortedAccepted, p);
      const vowels = compositionOf(size, difficulty);
      const sortedBand = [...bandCounts].sort((a, b) => a - b);

      console.log(
        `${size}×${size} ${difficulty.padEnd(9)} ` +
          `parole accettate p10=${pct(10)} p25=${pct(25)} p50=${pct(50)} p75=${pct(75)} p90=${pct(90)}  ` +
          `(media ${(accepted.reduce((a, b) => a + b, 0) / count).toFixed(0)})`,
      );
      console.log(
        `            lunghezza max: p50=${percentile([...longs].sort((a, b) => a - b), 50)}  ` +
          `≥${minLongest}: ${((longEnough / count) * 100).toFixed(0)}%  |  ` +
          `in banda [${band.min},${band.max}]: ${((inBand / count) * 100).toFixed(0)}%  |  ` +
          `entrambe: ${((both / count) * 100).toFixed(0)}%  (${Date.now() - started}ms)`,
      );
      console.log(
        `            composizione: ${vowels}  |  parole attese (fascia) sulle accettate: ` +
          (sortedBand.length > 0
            ? `p25=${percentile(sortedBand, 25)} p50=${percentile(sortedBand, 50)} p75=${percentile(sortedBand, 75)} min=${sortedBand[0]}`
            : '—'),
      );
    }
  }
  console.log('\nSe la quota "entrambe" è bassa (<10%) la banda è troppo stretta: allargala in schedaGen.ts.');
}

main();
