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
  anchorFor,
  createSchedaPool,
  DIFFICULTY_ORDER,
  densityBandFor,
  FOREIGN_LETTERS,
  generateGrid,
  gridStructureIssues,
  normalizeWord,
  RARE_ITALIAN,
  resolveSchedaVariant,
  SCHEDA_VARIANT_LABELS,
  solveGrid,
  SPECS,
  type Difficulty,
  type GridSize,
  type SchedaVariant,
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
function compositionOf(
  size: GridSize,
  difficulty: Difficulty,
  composition = SPECS.standard.composition[difficulty],
  samples = 200,
): string {
  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
  const RARE = new Set<string>(RARE_ITALIAN);
  const FOREIGN = new Set<string>(FOREIGN_LETTERS);
  let vowels = 0;
  let rare = 0;
  let foreign = 0;
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const grid = generateGrid(size, Math.random, difficulty, composition);
    for (const tile of grid.tiles) {
      total++;
      if (VOWELS.has(tile.letter)) vowels++;
      if (RARE.has(tile.letter)) rare++;
      if (FOREIGN.has(tile.letter)) foreign++;
    }
  }
  return (
    `vocali ${((vowels / total) * 100).toFixed(1)}%, ` +
    `rare IT ${((rare / total) * 100).toFixed(1)}%, ` +
    `non IT ${((foreign / total) * 100).toFixed(1)}%`
  );
}

function main(): void {
  const count = Number(arg('n') ?? '300');
  const onlySize = arg('size') ? (Number(arg('size')) as GridSize) : undefined;
  const sizes = onlySize ? [onlySize] : ALL_SIZES;
  const variant: SchedaVariant = resolveSchedaVariant(arg('variant'));
  const spec = SPECS[variant];

  console.log(`Criteri: ${SCHEDA_VARIANT_LABELS[variant]}`);

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
      const band = densityBandFor(size, difficulty, variant);
      const anchor = anchorFor(size, difficulty, variant);
      const meanBand = spec.meanLength?.[size]?.[difficulty];

      const accepted: number[] = [];
      const acceptedScores: number[] = [];
      const means: number[] = [];
      const bandCounts: number[] = [];
      const longs: number[] = [];
      let longEnough = 0;
      let inBand = 0;
      let meanOk = 0;
      let structureOkCount = 0;
      let both = 0;
      const started = Date.now();

      for (let i = 0; i < count; i++) {
        const grid = generateGrid(size, Math.random, difficulty, spec.composition[difficulty]);
        // Quante parole può trovare DAVVERO il giocatore (dizionario intero):
        // è il numero che determina la ricchezza della griglia, ed è la misura
        // su cui è tarata la banda di densità.
        const all = solveGrid(grid, pool.tries.full, { limit: 50_000, minLength: 3 });
        let longest = 0;
        let anchors = 0;
        let total = 0;
        let score = 0;
        for (const w of all) {
          if (w.length > longest) longest = w.length;
          if (w.length >= anchor.length) anchors++;
          total += w.length;
          score += Math.max(0, w.length - 2);
        }
        const mean = all.length > 0 ? total / all.length : 0;
        accepted.push(all.length);
        acceptedScores.push(score);
        means.push(mean);
        longs.push(longest);
        const okLong = anchors >= anchor.count;
        const okBand = all.length >= band.min && all.length <= band.max;
        const okMean = !meanBand || (mean >= meanBand.min && mean <= meanBand.max);
        // Struttura giocabile: nessuna zona morta (vedi `gridStructureIssues`).
        const structure = spec.requirePlayableStructure ? gridStructureIssues(grid) : [];
        const okStructure = structure.length === 0;
        if (okLong) longEnough++;
        if (okBand) inBand++;
        if (okMean) meanOk++;
        if (okStructure) structureOkCount++;
        if (okLong && okBand && okMean && okStructure) {
          both++;
          // Parole ATTESE (fascia) sulle griglie che passano: dice quante parole
          // mostrerà il riepilogo "parole che esistevano".
          bandCounts.push(solveGrid(grid, bandTrie, { limit: 3000, minLength: 3 }).length);
        }
      }

      const sortedAccepted = [...accepted].sort((a, b) => a - b);
      const sortedScores = [...acceptedScores].sort((a, b) => a - b);
      const sortedMeans = [...means].sort((a, b) => a - b);
      const pct = (p: number) => percentile(sortedAccepted, p);
      const scorePct = (p: number) => percentile(sortedScores, p);
      const meanPct = (p: number) => percentile(sortedMeans, p);
      const vowels = compositionOf(size, difficulty, spec.composition[difficulty]);
      const sortedBand = [...bandCounts].sort((a, b) => a - b);
      // Quante griglie cadrebbero in una banda di PUNTEGGIO p25–p75 (la misura
      // che manca oggi: la densità non limita il mix di lunghezze, quindi due
      // griglie con lo stesso numero di parole possono valere il doppio).
      const scoreLow = scorePct(25);
      const scoreHigh = scorePct(75);
      const inScoreBand = acceptedScores.filter((s) => s >= scoreLow && s <= scoreHigh).length;
      /*
       * Quanto la banda sul NUMERO di parole spiega i punti?
       * punti ≈ parole × (lunghezza media − 2): se la lunghezza media fosse
       * costante, la correlazione sarebbe 1 e la banda sulla densità basterebbe.
       * Qui si misura la correlazione reale e la dispersione dei punti per parola
       * (cioè quanto pesa il mix di lunghezze).
       */
      const meanCount = accepted.reduce((a, b) => a + b, 0) / count;
      const meanScore = acceptedScores.reduce((a, b) => a + b, 0) / count;
      let cov = 0;
      let varCount = 0;
      let varScore = 0;
      for (let i = 0; i < count; i++) {
        const dc = accepted[i]! - meanCount;
        const ds = acceptedScores[i]! - meanScore;
        cov += dc * ds;
        varCount += dc * dc;
        varScore += ds * ds;
      }
      const correlation = cov / Math.sqrt(Math.max(1e-9, varCount * varScore));
      const perWord = accepted.map((w, i) => acceptedScores[i]! / Math.max(1, w)).sort((a, b) => a - b);
      const perWordPct = (p: number) => percentile(perWord, p);

      console.log(
        `${size}×${size} ${difficulty.padEnd(9)} ` +
          `parole accettate p10=${pct(10)} p25=${pct(25)} p50=${pct(50)} p75=${pct(75)} p90=${pct(90)}  ` +
          `(media ${(accepted.reduce((a, b) => a + b, 0) / count).toFixed(0)})`,
      );
      console.log(
        `            ancora ≥${anchor.length}: ${((longEnough / count) * 100).toFixed(0)}%  |  ` +
          `in banda [${band.min},${band.max}]: ${((inBand / count) * 100).toFixed(0)}%  |  ` +
          (meanBand
            ? `media [${meanBand.min},${meanBand.max}]: ${((meanOk / count) * 100).toFixed(0)}%  |  `
            : '') +
          (spec.requirePlayableStructure
            ? `struttura: ${((structureOkCount / count) * 100).toFixed(0)}%  |  `
            : '') +
          `TUTTI: ${((both / count) * 100).toFixed(0)}%  (${Date.now() - started}ms)`,
      );
      console.log(
        `            lunghezza media p25=${meanPct(25).toFixed(2)} p50=${meanPct(50).toFixed(2)} p75=${meanPct(75).toFixed(2)}  |  ` +
          `lunghezza max p50=${percentile([...longs].sort((a, b) => a - b), 50)}`,
      );
      console.log(
        `            punteggio max p25=${scoreLow} p50=${scorePct(50)} p75=${scoreHigh}  ` +
          `(spread p75/p25 = ${(scoreHigh / Math.max(1, scoreLow)).toFixed(1)}x)  |  ` +
          `in banda punteggio p25-p75: ${((inScoreBand / count) * 100).toFixed(0)}%`,
      );
      console.log(
        `            correlazione parole↔punti r=${correlation.toFixed(3)}  |  ` +
          `punti per parola p25=${perWordPct(25).toFixed(2)} p50=${perWordPct(50).toFixed(2)} p75=${perWordPct(75).toFixed(2)} ` +
          `(spread ${(perWordPct(75) / Math.max(0.01, perWordPct(25))).toFixed(2)}x)`,
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
