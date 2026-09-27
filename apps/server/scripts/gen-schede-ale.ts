/**
 * Genera le schede "ale" e le aggiunge al catalogo.
 *
 * Pipeline (spec *algoritmo schede "ale"*):
 *   1. Pre-processing: `words.txt` → `Dict'` (pulizia, accenti piegati, niente `q`
 *      non seguita da `u`);
 *   2. Frequenza dei token su `Dict'` (`QU` = un token);
 *   3. `Common` = NVdB ∩ `Dict'`;
 *   4. Calibrazione: 500 griglie → intervallo di parole (Tukey + rho) → 3 fasce
 *      di difficoltà (k-means, con fallback ai tertili);
 *   5. Produzione: cicli di reiezione con seme, con targeting per fascia.
 *
 * Gli ingressi (1–3) arrivano da `ale-inputs.ts`, la STESSA sorgente usata dal
 * server per la generazione dall'admin: una sola implementazione, nessuna
 * possibilità che catalogo offline e catalogo del pannello divergano.
 *
 * Uso:
 *   pnpm gen:schede:ale                          # 15 schede per fascia su 4×4, 5×5 e 6×6
 *   pnpm gen:schede:ale -- --n 5 --size 4        # 5 per fascia, tutte le dimensioni
 *   pnpm gen:schede:ale -- --append              # aggiunge senza sovrascrivere
 *   pnpm gen:schede:ale -- --samples 2000        # campione di calibrazione più grande
 *
 * Opzioni:
 *   --size 4|5|6        dimensione (default: tutte)
 *   --difficolta <n>    facile|normale|difficile (default: tutte)
 *   --n <numero>        schede per fascia (default 15)
 *   --samples <numero>  griglie per la calibrazione (default 500)
 *   --seed <numero>     seme master (default 1)
 *   --append            aggiunge alle esistenti invece di sovrascrivere le "ale"
 *   --replace           rigenera SOLO le "ale" e tiene le altre varianti
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  calibrateAle,
  DEFAULT_ALE_GUARD_RAILS,
  DIFFICULTY_ORDER,
  generateAleScheda,
  sampleAleBoards,
  schedaFileName,
  schedaKey,
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
  const sizes = arg('size') ? [Number(arg('size')) as GridSize] : ALL_SIZES;
  const difficulties = arg('difficolta') ? [arg('difficolta') as Difficulty] : DIFFICULTY_ORDER;
  const count = Number(arg('n', '15'));
  const samples = Number(arg('samples', '500'));
  const seed = Number(arg('seed', '1'));
  const append = hasFlag('append');
  const replace = hasFlag('replace');

  for (const s of sizes) if (!ALL_SIZES.includes(s)) throw new Error(`Dimensione non valida: ${s}`);
  for (const d of difficulties) if (!DIFFICULTY_ORDER.includes(d)) throw new Error(`Difficoltà non valida: ${d}`);

  const inputs = loadAleInputs();
  const { freq, trie, common, lemmas, dictPrime } = inputs;

  // La calibrazione dipende dalla DIMENSIONE: la facciamo per ogni dimensione
  // richiesta. Un file per dimensione (una 4×4 ha meno celle di una 6×6).
  const calibrations = new Map<GridSize, AleCalibration>();
  for (const size of sizes) {
    console.log(`Calibro su ${samples} griglie ${size}×${size}…`);
    const stats = sampleAleBoards(size, freq, trie, common, samples, seed, DEFAULT_ALE_GUARD_RAILS, lemmas);
    const calibration = calibrateAle(stats, {
      guardRails: DEFAULT_ALE_GUARD_RAILS,
      dictSize: dictPrime.length,
      commonSize: common.size,
      rho: 0.6,
    });
    calibrations.set(size, calibration);
    const wc = calibration.provenance.wordCount;
    console.log(
      `  parole p0=${wc.min} q1=${wc.q1} med=${wc.median} q3=${wc.q3} p100=${wc.max} → range [${calibration.wordRange.lo}, ${calibration.wordRange.hi}]`,
    );
    console.log(
      `  fasce: ${calibration.tiers.map((t) => `${t.difficulty}(d=${t.targetDifficulty.toFixed(2)} [${t.range.min.toFixed(2)}–${t.range.max.toFixed(2)}])`).join('  ')}`,
    );
    console.log(`  k-means usato: ${calibration.provenance.usedKmeans ? 'sì' : 'no (fallback ai tertili)'}`);
  }

  /*
   * Persistenza della calibrazione (provenienza della spec §6.4).
   *
   * Si FONDE con il file esistente: una run per una sola dimensione non deve
   * cancellare le calibrazioni delle altre. Il file contiene `bySize` con una
   * voce per dimensione (una 4×4 ha meno celle di una 6×6).
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
    for (const difficulty of difficulties) {
      const existing = append || replace ? loadExisting(size, difficulty) : [];
      const kept = replace ? existing.filter((s) => schedaVariantOf(s) !== 'ale') : existing;
      /*
       * Gli id delle schede "ale" partono DOPO quelli già presenti nello stesso
       * file: standard/full usano già `5-facile-001..015`, quindi le "ale"
       * prendono i numeri successivi. Il formato `size-difficulty-NNN` resta
       * valido per `schedaFileFor`.
       */
      const idPrefix = schedaKey(size, difficulty);
      const idStart = kept.length + 1;
      const startedAt = Date.now();
      const fresh: Scheda[] = [];
      for (let i = 0; i < count; i++) {
        const boardSeed = seed * 1_000_003 + 7919 + i * 104_729;
        fresh.push(
          generateAleScheda({
            size,
            difficulty,
            freq,
            trie,
            common,
            lemmas,
            calibration,
            seed: boardSeed,
            idPrefix,
            idStart,
            idIndex: i,
            maxAttempts: 500,
          }),
        );
      }
      const schede = append || replace ? [...kept, ...fresh] : fresh;
      const file: SchedaFile = {
        version: SCHEDA_FORMAT_VERSION,
        generatedAt: new Date().toISOString(),
        size,
        difficulty,
        schede,
      };
      writeFileSync(path.join(OUT_DIR, schedaFileName(size, difficulty)), JSON.stringify(file, null, 2) + '\n');

      // Diagnostica: quante sono davvero nella fascia richiesta?
      const inTier = fresh.filter((s) => {
        const wc = (s.allWords ?? s.words).length;
        return wc >= calibration.wordRange.lo && wc <= calibration.wordRange.hi;
      }).length;
      const avgWords = Math.round(fresh.reduce((a, x) => a + (x.allWords ?? x.words).length, 0) / fresh.length);
      console.log(
        `✓ ${size}×${size} ${difficulty} [Ale]: ${fresh.length} schede (medie ${avgWords} parole, in banda ${inTier}/${fresh.length}) · totale nel file ${schede.length}  in ${Date.now() - startedAt}ms`,
      );
    }
  }
  console.log(`\nSchede scritte in ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.log('Ricordati di copiare il bundle: node apps/web/scripts/copy-schede.mjs');
}

main();
