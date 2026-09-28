/**
 * Genera le schede "ale" e le aggiunge al catalogo.
 *
 * Pipeline (docs/algoritmi/report/ale-full-implementazione.md, branch `ale-full`):
 *   1. Pre-processing: `words.txt` → `Dict'` (pulizia, accenti piegati, niente `q`
 *      non seguita da `u`);
 *   2. Frequenza dei token su `Dict'` (`QU` = un token);
 *   3. Anelli di frequenza da `frequency-it.txt` (top-5000 / top-20000);
 *   4. Calibrazione: 2000 griglie → intervallo di parole (Tukey + rho) → 3 fasce
 *      di difficoltà (k-means) → **banda di parole per fascia**;
 *   5. Produzione **a tre secchi**: un solo flusso di candidati, ognuno nel
 *      secchio della sua fascia naturale, finché i tre non sono pieni.
 *
 * Gli ingressi (1–3) arrivano da `ale-inputs.ts`, la STESSA sorgente usata dal
 * server per la generazione dall'admin: una sola implementazione, nessuna
 * possibilità che catalogo offline e catalogo del pannello divergano.
 *
 * Uso:
 *   pnpm gen:schede:ale                          # 15 schede per fascia su 4×4, 5×5 e 6×6
 *   pnpm gen:schede:ale -- --n 5 --size 4        # 5 per fascia, una dimensione
 *   pnpm gen:schede:ale -- --append              # aggiunge senza sovrascrivere
 *   pnpm gen:schede:ale -- --samples 2000        # campione di calibrazione più grande
 *
 * Opzioni:
 *   --size 4|5|6        dimensione (default: tutte)
 *   --n <numero>        schede per fascia (default 15)
 *   --samples <numero>  griglie per la calibrazione (default 2000)
 *   --seed <numero>     seme master (default 1)
 *   --append            aggiunge alle esistenti invece di sovrascrivere le "ale"
 *   --replace           rigenera SOLO le "ale" e tiene le altre varianti
 *
 * `--difficolta` NON esiste più: la generazione è sempre per tutte e tre le
 * fasce insieme (usa `--n` per il numero per fascia).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALE_CALIBRATION_RHO,
  ALE_RARITY_RINGS,
  calibrateAle,
  DEFAULT_ALE_GUARD_RAILS,
  DIFFICULTY_ORDER,
  generateAleBuckets,
  newAleGenerationStats,
  sampleAleBoards,
  schedaFileName,
  schedaVariantOf,
  SCHEDA_FORMAT_VERSION,
  type AleCalibration,
  type Difficulty,
  type GridSize,
  type Scheda,
  type SchedaFile,
} from '@boggle/shared';
import { CALIB_PATH, loadAleInputs, OUT_DIR } from './ale-inputs.js';

const ALL_SIZES: GridSize[] = [4, 5, 6];

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

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
  if (arg('difficolta') !== undefined) {
    throw new Error('la generazione ale è a tre secchi: usa --n per il numero per fascia');
  }
  const sizes = arg('size') ? [Number(arg('size')) as GridSize] : ALL_SIZES;
  const count = Number(arg('n', '15'));
  const samples = Number(arg('samples', '2000'));
  const seed = Number(arg('seed', '1'));
  const append = hasFlag('append');
  const replace = hasFlag('replace');

  for (const s of sizes) if (!ALL_SIZES.includes(s)) throw new Error(`Dimensione non valida: ${s}`);

  const inputs = loadAleInputs();
  const { freq, trie, rings, dictPrime } = inputs;

  // La calibrazione dipende dalla DIMENSIONE: la facciamo per ogni dimensione
  // richiesta. Un file per dimensione (una 4×4 ha meno celle di una 6×6).
  const calibrations = new Map<GridSize, AleCalibration>();
  for (const size of sizes) {
    console.log(`Calibro su ${samples} griglie ${size}×${size}…`);
    const stats = sampleAleBoards(size, freq, trie, rings, samples, seed, DEFAULT_ALE_GUARD_RAILS);
    const calibration = calibrateAle(stats, {
      guardRails: DEFAULT_ALE_GUARD_RAILS,
      dictSize: dictPrime.length,
      rings: ALE_RARITY_RINGS,
      rho: ALE_CALIBRATION_RHO,
    });
    calibrations.set(size, calibration);
    const wc = calibration.provenance.wordCount;
    console.log(
      `  parole p0=${wc.min} q1=${wc.q1} med=${wc.median} q3=${wc.q3} p100=${wc.max} → range globale [${calibration.wordRange.lo}, ${calibration.wordRange.hi}]`,
    );
    for (const tier of calibration.tiers) {
      console.log(
        `  ${tier.difficulty.padEnd(9)} centro ${tier.targetDifficulty.toFixed(3)} · difficoltà [${tier.range.min.toFixed(3)}–${tier.range.max.toFixed(3)}] · parole [${tier.wordRange.lo}, ${tier.wordRange.hi}]`,
      );
    }
    console.log(
      `  k-means usato: ${calibration.provenance.usedKmeans ? 'sì' : 'no (fallback ai tertili)'}` +
        `${calibration.provenance.perTierFallback ? ' · perTierFallback ATTIVO' : ''}`,
    );
  }

  /*
   * Persistenza della calibrazione (provenienza della spec §6.4).
   *
   * Si FONDE con il file esistente: una run per una sola dimensione non deve
   * cancellare le calibrazioni delle altre.
   */
  mkdirSync(path.dirname(CALIB_PATH), { recursive: true });
  const previous = existsSync(CALIB_PATH)
    ? (JSON.parse(readFileSync(CALIB_PATH, 'utf8')) as { bySize?: Record<string, AleCalibration> })
    : {};
  const bySize = {
    ...(previous.bySize ?? {}),
    ...Object.fromEntries([...calibrations.entries()].map(([s, c]) => [String(s), c])),
  };
  writeFileSync(
    CALIB_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        seed,
        guardRails: DEFAULT_ALE_GUARD_RAILS,
        bySize,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`✓ Calibrazione scritta in ${path.relative(process.cwd(), CALIB_PATH)} (dimensioni: ${Object.keys(bySize).sort().join(', ')})`);

  mkdirSync(OUT_DIR, { recursive: true });

  for (const size of sizes) {
    const calibration = calibrations.get(size)!;

    // Le schede non-ale restano; gli id delle ale partono dopo, per non collidere.
    const keptByDifficulty = new Map<Difficulty, Scheda[]>();
    for (const difficulty of DIFFICULTY_ORDER) {
      const existing = append || replace ? loadExisting(size, difficulty) : [];
      const kept = replace ? existing.filter((s) => schedaVariantOf(s) !== 'ale') : existing;
      keptByDifficulty.set(difficulty, kept);
    }
    const idStart = Math.max(...DIFFICULTY_ORDER.map((d) => keptByDifficulty.get(d)!.length)) + 1;

    const startedAt = Date.now();
    const stats = newAleGenerationStats();
    const buckets = generateAleBuckets({
      size,
      perTier: count,
      freq,
      trie,
      rings,
      calibration,
      seed,
      idStart,
      stats,
    });

    for (const difficulty of DIFFICULTY_ORDER) {
      const kept = keptByDifficulty.get(difficulty)!;
      const fresh = buckets[difficulty];
      const schede = append || replace ? [...kept, ...fresh] : fresh;
      const file: SchedaFile = {
        version: SCHEDA_FORMAT_VERSION,
        generatedAt: new Date().toISOString(),
        size,
        difficulty,
        schede,
      };
      writeFileSync(path.join(OUT_DIR, schedaFileName(size, difficulty)), JSON.stringify(file, null, 2) + '\n');

      const tier = calibration.tiers.find((t) => t.difficulty === difficulty)!;
      const inBand = fresh.filter((s) => {
        const wc = (s.allWords ?? s.words).length;
        return (
          wc >= calibration.wordRange.lo &&
          wc <= calibration.wordRange.hi &&
          wc >= tier.wordRange.lo &&
          wc <= tier.wordRange.hi
        );
      }).length;
      const avgWords = fresh.length
        ? Math.round(fresh.reduce((a, x) => a + (x.allWords ?? x.words).length, 0) / fresh.length)
        : 0;
      console.log(
        `✓ ${size}×${size} ${difficulty} [Ale]: ${fresh.length} schede (medie ${avgWords} parole, in banda ${inBand}/${fresh.length}) · totale nel file ${schede.length}`,
      );
    }

    console.log(
      `  flusso ${size}×${size}: campioni ${stats.sampled.toLocaleString('it-IT')} · respinti ${stats.rejected.toLocaleString('it-IT')} · ` +
        `fuori range ${stats.wordCountOut.toLocaleString('it-IT')} · fuori banda fascia ${stats.tierBandOut.toLocaleString('it-IT')} · ` +
        `ripieghi ${stats.fallbacks} · ${Date.now() - startedAt}ms`,
    );
  }

  console.log(`\nSchede scritte in ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log('Ricordati di copiare il bundle: node apps/web/scripts/copy-schede.mjs');
}

main();
