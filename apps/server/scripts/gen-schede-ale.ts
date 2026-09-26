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
 * Uso:
 *   pnpm gen:schede:ale                          # 15 schede per fascia su 5×5
 *   pnpm gen:schede:ale -- --n 5 --size 4        # 5 per fascia, tutte le dimensioni
 *   pnpm gen:schede:ale -- --append              # aggiunge senza sovrascrivere
 *   pnpm gen:schede:ale -- --samples 2000        # campione di calibrazione più grande
 *
 * Opzioni:
 *   --size 4|5|6        dimensione (default 5)
 *   --difficolta <n>    facile|normale|difficile (default: tutte)
 *   --n <numero>        schede per fascia (default 15)
 *   --samples <numero>  griglie per la calibrazione (default 500)
 *   --seed <numero>     seme master (default 1)
 *   --append            aggiunge alle esistenti invece di sovrascrivere le "ale"
 *   --replace           rigenera SOLO le "ale" e tiene le altre varianti
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAleCommon,
  buildAleLemmas,
  buildTrie,
  calibrateAle,
  cleanAleWord,
  computeAleFrequency,
  DIFFICULTY_ORDER,
  DEFAULT_ALE_GUARD_RAILS,
  generateAleScheda,
  mulberry32,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DICT_DIR = path.join(ROOT, 'packages/dictionary/data');
const ALE_DIR = path.join(DICT_DIR, 'ale');
const NVDB_PATH = path.join(ALE_DIR, 'nvdb.words.txt');
const CALIB_PATH = path.join(ALE_DIR, 'calibration.json');
const OUT_DIR = path.join(ROOT, 'packages/shared/schede');

const ALL_SIZES: GridSize[] = [4, 5, 6];

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function readLines(file: string): string[] {
  if (!existsSync(file)) throw new Error(`Manca ${file}`);
  return readFileSync(file, 'utf8').split('\n');
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
  const sizes = arg('size') ? [Number(arg('size')) as GridSize] : [5 as GridSize];
  const difficulties = arg('difficolta') ? [arg('difficolta') as Difficulty] : DIFFICULTY_ORDER;
  const count = Number(arg('n', '15'));
  const samples = Number(arg('samples', '500'));
  const seed = Number(arg('seed', '1'));
  const append = hasFlag('append');
  const replace = hasFlag('replace');

  for (const s of sizes) if (!ALL_SIZES.includes(s)) throw new Error(`Dimensione non valida: ${s}`);
  for (const d of difficulties) if (!DIFFICULTY_ORDER.includes(d)) throw new Error(`Difficoltà non valida: ${d}`);

  console.log('Carico il dizionario e lo pulisco (Dict → Dict’)…');
  const rawDict = readLines(path.join(DICT_DIR, 'words.txt'));
  const dictPrime: string[] = [];
  const dictSet = new Set<string>();
  for (const raw of rawDict) {
    const w = cleanAleWord(raw);
    if (!w || dictSet.has(w)) continue;
    dictSet.add(w);
    dictPrime.push(w);
  }
  console.log(`  Dict  ${rawDict.length.toLocaleString('it-IT')} voci → Dict' ${dictPrime.length.toLocaleString('it-IT')}`);

  console.log('Calcolo la frequenza dei token…');
  const freq = computeAleFrequency(dictPrime);
  console.log(
    `  top token: ${freq.ordered.slice(0, 8).map((t) => `${t.token}:${(t.freq * 100).toFixed(1)}%`).join(' ')}`,
  );

  console.log('Costruisco `Common` (NVdB ∩ Dict’)…');
  const nvdb = readLines(NVDB_PATH);
  const common = buildAleCommon(nvdb, dictSet);
  console.log(`  NVdB ${nvdb.length.toLocaleString('it-IT')} → Common ${common.size.toLocaleString('it-IT')} (${((common.size / dictPrime.length) * 100).toFixed(1)}% di Dict')`);

  /*
   * Radici (forma → lemma) da Morph-it: NVdB contiene i LEMMI (`amare`), non
   * tutte le forme flesse. Senza la radice `amo` risulterebbe "rara". Morph-it è
   * in ISO-8859-1: si decodifica esplicitamente (come fa `build-words.mjs`).
   */
  console.log('Costruisco le radici (forma → lemma) da Morph-it…');
  const morphPath = path.join(DICT_DIR, 'morph-it_048.txt');
  if (!existsSync(morphPath)) {
    throw new Error(
      `Manca ${morphPath}: serve per le radici (le forme flesse contate come comuni).\n` +
        'Non è nell\u2019immagine Docker (è gitignored per dimensione): la rigenerazione delle schede ale si fa in locale.',
    );
  }
  const morphRaw = new TextDecoder('latin1').decode(readFileSync(morphPath));
  const lemmas = buildAleLemmas(morphRaw);
  console.log(`  coppie forma→lemma: ${lemmas.size.toLocaleString('it-IT')}`);

  console.log('Costruisco il trie del solver (Dict’)…');
  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });

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

  // Persistenza della calibrazione (provenienza della spec §6.4).
  mkdirSync(ALE_DIR, { recursive: true });
  writeFileSync(
    CALIB_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        seed,
        guardRails: DEFAULT_ALE_GUARD_RAILS,
        bySize: Object.fromEntries([...calibrations.entries()].map(([s, c]) => [String(s), c])),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`✓ Calibrazione scritta in ${path.relative(ROOT, CALIB_PATH)}`);

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
  console.log(`\nSchede scritte in ${path.relative(ROOT, OUT_DIR)}/`);
  console.log('Ricordati di copiare il bundle: node apps/web/scripts/copy-schede.mjs');
}

main();
