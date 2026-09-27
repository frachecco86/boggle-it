/**
 * Report dell'algoritmo `ale`: cosa dicono i numeri della CALIBRAZIONE e della
 * PRIMA GENERAZIONE (quanti candidati sono stati scartati e perché).
 *
 * Uso:
 *   pnpm --filter @boggle/server report:ale                    # 5×5, 500 campioni, 15 schede per fascia
 *   pnpm --filter @boggle/server report:ale -- --samples 2000
 *   pnpm --filter @boggle/server report:ale -- --size 4 --n 5
 *   pnpm --filter @boggle/server report:ale -- --all-sizes     # tutte e tre le dimensioni
 *
 * Perché esiste: la calibrazione e le regole di scarto vivono nel codice
 * (`schedaAle.ts`) e i loro numeri finiscono in `docs/algoritmi/report/ale.md`.
 * Rigenerarli a mano era impossibile: i contatori di scarto non erano esposti.
 * Qui si riusa la STESSA pipeline della produzione (`ale-inputs.ts` carica gli
 * stessi ingressi di `gen-schede-ale.ts`) e si stampano i contatori.
 *
 * Deterministico: stessi `--seed`/`--samples`/`--n` → stessi numeri.
 */
import {
  calibrateAle,
  compositeDifficulty,
  DEFAULT_ALE_GUARD_RAILS,
  DIFFICULTY_ORDER,
  generateAleScheda,
  isAleCommon,
  newAleGenerationStats,
  percentile,
  sampleAleBoards,
  schedaFileName,
  tierForDifficulty,
  type AleBoardStats,
  type AleCalibration,
  type Difficulty,
  type GridSize,
  type Scheda,
  type SchedaFile,
} from '@boggle/shared';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CALIB_PATH, loadAleInputs, OUT_DIR } from './ale-inputs.js';

/**
 * Raggruppa i motivi di scarto dei guard rails per REGOLA.
 *
 * I messaggi di `coverageIssues`/`tokenGuardRailIssues` contengono la misura
 * (`vocali 36% fuori banda`, `2 righe senza soluzioni`), quindi presi alla
 * lettera sono decine di chiavi diverse. Per il report servono le regole.
 */
function railRule(issue: string): string {
  if (issue.startsWith('vocali')) return 'vocali fuori banda (30–60%)';
  if (issue.includes('token rari')) return 'token rari H/Z/QU (>3)';
  if (issue.includes('righe')) return 'righe senza soluzioni';
  if (issue.includes('colonne')) return 'colonne senza soluzioni';
  return issue;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : fallback;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Media e deviazione standard (per descrivere le distribuzioni). */
function meanSd(values: number[]): { mean: number; sd: number } {
  if (values.length === 0) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean, sd };
}

/** La calibrazione committata (quella usata dalla PRIMA generazione). */
function loadCommittedCalibration(size: GridSize): { calibration: AleCalibration; generatedAt: string; seed: number } | null {
  if (!existsSync(CALIB_PATH)) return null;
  const parsed = JSON.parse(readFileSync(CALIB_PATH, 'utf8')) as {
    generatedAt: string;
    seed: number;
    bySize: Record<string, AleCalibration>;
  };
  const calibration = parsed.bySize?.[String(size)];
  if (!calibration) return null;
  return { calibration, generatedAt: parsed.generatedAt, seed: parsed.seed };
}

/** Le schede ale già nel catalogo, per la verifica di riproduzione. */
function loadCatalogAle(size: GridSize, difficulty: Difficulty): Scheda[] {
  const file = path.join(OUT_DIR, schedaFileName(size, difficulty));
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as SchedaFile;
  return (parsed.schede ?? []).filter((s) => (s.variant ?? 'standard') === 'ale');
}

/** Difficoltà composita di una griglia (R e S ricavati dai suoi dati). */
function boardDifficulty(board: AleBoardStats, wordRange: { lo: number; hi: number }): number {
  return compositeDifficulty(board.rarity, board.wordCount, wordRange);
}

function reportForSize(
  size: GridSize,
  inputs: ReturnType<typeof loadAleInputs>,
  samples: number,
  count: number,
  seed: number,
  maxAttempts: number,
): void {
  const { freq, trie, common, lemmas, dictPrime } = inputs;

  console.log(`\n\n# Report algoritmo ale — ${size}×${size}, ${samples} campioni, ${count} schede per fascia, seed ${seed}\n`);

  // ------------------------------------------------------------------ ingressi
  console.log('\n## Ingressi');
  console.log(`  Dict'                 ${dictPrime.length.toLocaleString('it-IT')} parole`);
  console.log(`  Common (NVdB ∩ Dict') ${common.size.toLocaleString('it-IT')} (${pct(common.size / dictPrime.length)} di Dict')`);
  console.log(`  radici forma→lemma    ${lemmas.size.toLocaleString('it-IT')} coppie`);
  console.log(`  alfabeto              ${freq.ordered.length} token (QU unico)`);
  console.log(
    `  token più frequenti   ${freq.ordered.slice(0, 10).map((t) => `${t.token} ${(t.freq * 100).toFixed(1)}%`).join(' · ')}`,
  );
  const rails = DEFAULT_ALE_GUARD_RAILS;
  const railText = [
    rails.vowels ? `vocali ${pct(rails.vowels.min)}–${pct(rails.vowels.max)}` : 'vocali libere',
    rails.rareCap !== null ? `al più ${rails.rareCap} token rari H/Z/QU in totale` : 'nessun tetto sui token rari',
    rails.noUncoveredLines ? 'nessuna riga/colonna senza soluzioni' : 'righe/colonne libere',
  ].join(' · ');
  console.log(`  guard rails           ${railText}`);

  // -------------------------------------------------------------- calibrazione
  const calStats = newAleGenerationStats();
  const boards = sampleAleBoards(size, freq, trie, common, samples, seed, DEFAULT_ALE_GUARD_RAILS, lemmas, calStats);
  const calibration: AleCalibration = calibrateAle(boards, {
    guardRails: DEFAULT_ALE_GUARD_RAILS,
    dictSize: dictPrime.length,
    commonSize: common.size,
    rho: 0.6,
  });

  const counts = boards.map((b) => b.wordCount).sort((a, b) => a - b);
  const rarities = boards.map((b) => b.rarity).sort((a, b) => a - b);
  const comq = boards.map((b) => boardDifficulty(b, calibration.wordRange)).sort((a, b) => a - b);
  const { mean: meanWords } = meanSd(boards.map((b) => b.wordCount));
  const { mean: meanRarity, sd: sdRarity } = meanSd(boards.map((b) => b.rarity));
  const { mean: meanComq, sd: sdComq } = meanSd(comq);

  console.log('\n## Calibrazione');
  console.log(
    `  griglie campionate    ${calStats.sampled.toLocaleString('it-IT')} campioni → ${boards.length} griglie valide, ` +
      `${calStats.rejected.toLocaleString('it-IT')} respinte dai guard rails ` +
      `(${pct(calStats.rejected / Math.max(1, calStats.sampled))}), ` +
      `${calStats.noGrid} senza griglia dopo i tentativi interni`,
  );
  console.log(
    `  scarti guard rails    ${Object.entries(calStats.railRejections)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${reason}: ${n.toLocaleString('it-IT')}`)
      .join(' · ')}`,
  );
  console.log(
    `  parole per griglia    min ${counts[0]} · q1 ${percentile(counts, 25)} · mediana ${percentile(counts, 50)} · ` +
      `q3 ${percentile(counts, 75)} · max ${counts[counts.length - 1]} (media ${meanWords.toFixed(0)})`,
  );
  console.log(
    `  intervallo calibrato  [${calibration.wordRange.lo}, ${calibration.wordRange.hi}]  ` +
      `(Tukey su q1/q3, ristretto verso la mediana con rho=${calibration.provenance.rho})`,
  );
  console.log(
    `  rarità R              min ${rarities[0]?.toFixed(3)} · mediana ${percentile(rarities, 50).toFixed(3)} · ` +
      `max ${rarities[rarities.length - 1]?.toFixed(3)} (media ${meanRarity.toFixed(3)} ± ${sdRarity.toFixed(3)})`,
  );
  console.log(
    `  difficoltà composita  min ${comq[0]?.toFixed(3)} · mediana ${percentile(comq, 50).toFixed(3)} · ` +
      `max ${comq[comq.length - 1]?.toFixed(3)} (media ${meanComq.toFixed(3)} ± ${sdComq.toFixed(3)})`,
  );
  console.log(
    `  pesi usati            0.25·R + 0.75·S (R rarità, S scarsità nell'intervallo)`,
  );
  console.log(`  k-means k=3 usato: ${calibration.provenance.usedKmeans ? 'sì' : 'no (fallback ai tertili)'}`);
  for (const tier of calibration.tiers) {
    const inTier = boards.filter((b) => tierForDifficulty(boardDifficulty(b, calibration.wordRange), calibration) === tier.difficulty).length;
    console.log(
      `    ${tier.difficulty.padEnd(9)} centro ${tier.targetDifficulty.toFixed(3)} · intervallo ` +
        `[${tier.range.min.toFixed(3)}, ${tier.range.max.toFixed(3)}] · ${inTier} griglie del campione (${pct(inTier / Math.max(1, boards.length))})`,
    );
  }
  const inRange = boards.filter(
    (b) => b.wordCount >= calibration.wordRange.lo && b.wordCount <= calibration.wordRange.hi,
  ).length;
  console.log(
    `  griglie dentro l'intervallo di parole: ${inRange}/${boards.length} (${pct(inRange / Math.max(1, boards.length))})`,
  );

  // ------------------------------------------------------- prima generazione
  /*
   * La PRIMA generazione usa la `calibration.json`. Se c'è (e ha gli stessi
   * guard rails) il report misura con QUELLA, e mostra a fianco la differenza con
   * quella ricalcolata oggi; altrimenti usa quella appena calcolata.
   */
  const committed = loadCommittedCalibration(size);
  const useCommitted =
    committed !== null &&
    JSON.stringify(committed.calibration.provenance.guardRails) === JSON.stringify(DEFAULT_ALE_GUARD_RAILS);
  const generationCalibration = useCommitted ? committed!.calibration : calibration;
  console.log('\n## Prima generazione');
  if (committed) {
    if (useCommitted) {
      console.log(
        `  calibrazione usata     ${path.basename(CALIB_PATH)} (${committed.generatedAt}, seed ${committed.seed}, ` +
          `Dict' ${committed.calibration.provenance.dictSize.toLocaleString('it-IT')})`,
      );
      const fresh = calibration;
      const c = committed.calibration;
      console.log(
        `  deriva vs oggi         intervallo parole [${c.wordRange.lo}, ${c.wordRange.hi}] → ` +
          `[${fresh.wordRange.lo}, ${fresh.wordRange.hi}] · ` +
          `confini fasce ${c.tiers.map((t) => t.range.max.toFixed(3)).join('/')} → ` +
          `${fresh.tiers.map((t) => t.range.max.toFixed(3)).join('/')}`,
      );
    } else {
      console.log('  calibrazione usata     ricalcolata ora (quella committata usa guard rails diversi)');
    }
  } else {
    console.log('  calibrazione usata     ricalcolata ora (nessuna calibration.json per questa dimensione)');
  }

  console.log('');
  for (const difficulty of DIFFICULTY_ORDER as Difficulty[]) {
    const genStats = newAleGenerationStats();
    const attemptsUsed: number[] = [];
    const produced: AleBoardStats[] = [];
    /** Griglie prodotte, in ordine: per la verifica contro il catalogo. */
    const freshGrids: string[] = [];
    for (let i = 0; i < count; i++) {
      // Stesso calcolo del seme di `gen-schede-ale.ts`: il report descrive la
      // produzione reale, non una simulazione diversa.
      const boardSeed = seed * 1_000_003 + 7919 + i * 104_729;
      const stats = newAleGenerationStats();
      const scheda = generateAleScheda({
        size,
        difficulty,
        freq,
        trie,
        common,
        lemmas,
        calibration: generationCalibration,
        seed: boardSeed,
        idPrefix: `${size}-${difficulty}`,
        idStart: 1,
        idIndex: i,
        maxAttempts,
        stats,
      });
      attemptsUsed.push(stats.acceptedAttempt ?? maxAttempts);
      for (const [k, v] of Object.entries(stats.railRejections)) {
        genStats.railRejections[k] = (genStats.railRejections[k] ?? 0) + v;
      }
      genStats.sampled += stats.sampled;
      genStats.rejected += stats.rejected;
      genStats.noGrid += stats.noGrid;
      genStats.wordCountOut += stats.wordCountOut;
      genStats.difficultyOut += stats.difficultyOut;
      const words = scheda.allWords ?? scheda.words;
      freshGrids.push(scheda.grid);
      produced.push({
        words,
        wordCount: words.length,
        commonCount: 0,
        // Come in produzione: una parola è comune se lo è lei o la sua RADICE.
        rarity: 1 - words.filter((w) => isAleCommon(w, common, lemmas)).length / Math.max(1, words.length),
        score: words.reduce((a, w) => a + Math.max(0, w.length - 2), 0),
        longest: scheda.longest,
      });
    }

    const wc = produced.map((p) => p.wordCount);
    const df = produced.map((p) => boardDifficulty(p, generationCalibration.wordRange));
    // Scarti aggregati per REGOLA (i messaggi contengono la misura).
    const byRule = new Map<string, number>();
    for (const [reason, n] of Object.entries(genStats.railRejections)) {
      const rule = railRule(reason);
      byRule.set(rule, (byRule.get(rule) ?? 0) + n);
    }
    const railTotal = [...byRule.values()].reduce((a, b) => a + b, 0);
    console.log(`\n  ${difficulty.toUpperCase()} — ${count} schede`);
    console.log(
      `    tentativi per scheda   media ${(attemptsUsed.reduce((a, b) => a + b, 0) / count).toFixed(1)} · ` +
        `max ${Math.max(...attemptsUsed)} (su ${maxAttempts})  → accettate al primo tentativo utile: ` +
        `${attemptsUsed.filter((a) => a === 1).length}/${count}`,
    );
    console.log(
      `    reiezioni              fuori intervallo parole ${genStats.wordCountOut.toLocaleString('it-IT')} · ` +
        `difficoltà fuori fascia ${genStats.difficultyOut.toLocaleString('it-IT')} · ` +
        `nessuna griglia dai guard rails ${genStats.noGrid.toLocaleString('it-IT')}`,
    );
    console.log(
      `    campioni guard rails   ${genStats.sampled.toLocaleString('it-IT')} · respinti ` +
        `${genStats.rejected.toLocaleString('it-IT')} (${pct(genStats.rejected / Math.max(1, genStats.sampled))}) · ` +
        `violazioni ${railTotal.toLocaleString('it-IT')} (un campione può violarne più di una)`,
    );
    for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`      ${rule.padEnd(34)} ${n.toLocaleString('it-IT').padStart(8)}  (${pct(n / Math.max(1, genStats.sampled))} dei campioni)`);
    }
    console.log(
      `    schede prodotte        parole ${Math.min(...wc)}–${Math.max(...wc)} (media ${(wc.reduce((a, b) => a + b, 0) / count).toFixed(0)}) · ` +
        `difficoltà ${Math.min(...df).toFixed(3)}–${Math.max(...df).toFixed(3)} ` +
        `(centro fascia ${generationCalibration.tiers.find((t) => t.difficulty === difficulty)!.targetDifficulty.toFixed(3)})`,
    );
    // Verifica di riproduzione: le griglie prodotte ci sono già nel catalogo?
    const catalog = loadCatalogAle(size, difficulty);
    if (catalog.length > 0) {
      const catalogGrids = new Set(catalog.map((s) => s.grid));
      const same = freshGrids.filter((g) => catalogGrids.has(g)).length;
      const catalogWords = catalog.map((s) => (s.allWords ?? s.words).length).sort((a, b) => a - b);
      console.log(
        `    catalogo               ${catalog.length} schede ale, parole ${catalogWords[0]}–${catalogWords[catalogWords.length - 1]} ` +
          `(media ${(catalogWords.reduce((a, b) => a + b, 0) / catalog.length).toFixed(0)}) · griglie identiche a questa run: ${same}/${count}`,
      );
    }
  }
}

function main(): void {
  const allSizes = hasFlag('all-sizes');
  const sizes: GridSize[] = allSizes
    ? [4, 5, 6]
    : [Number(arg('size', '5')) as GridSize];
  const samples = Number(arg('samples', '500'));
  const count = Number(arg('n', '15'));
  const seed = Number(arg('seed', '1'));
  const maxAttempts = Number(arg('attempts', '500'));

  const inputs = loadAleInputs();
  for (const size of sizes) {
    reportForSize(size, inputs, samples, count, seed, maxAttempts);
  }
  console.log(
    `\nRiproduci con: pnpm --filter @boggle/server report:ale -- ${allSizes ? '--all-sizes' : `--size ${sizes[0]}`} --samples ${samples} --n ${count} --seed ${seed}`,
  );
}

main();
