/**
 * Report dell'algoritmo `ale`: cosa dicono i numeri della CALIBRAZIONE e della
 * PRIMA GENERAZIONE a tre secchi (quanti candidati sono stati scartati e perché).
 *
 * Uso:
 *   pnpm --filter @boggle/server report:ale                    # 5×5, 2000 campioni, 15 schede per fascia
 *   pnpm --filter @boggle/server report:ale -- --samples 2000
 *   pnpm --filter @boggle/server report:ale -- --size 4 --n 5
 *   pnpm --filter @boggle/server report:ale -- --all-sizes     # tutte e tre le dimensioni
 *
 * Deterministico: stessi `--seed`/`--samples`/`--n` → stessi numeri.
 */
import {
  ALE_CALIBRATION_RHO,
  ALE_RARITY_RINGS,
  aleRarityRings,
  calibrateAle,
  compositeDifficulty,
  DEFAULT_ALE_GUARD_RAILS,
  DIFFICULTY_ORDER,
  generateAleBuckets,
  newAleGenerationStats,
  percentile,
  richnessFor,
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

/** Raggruppa i motivi di scarto dei guard rails per REGOLA. */
function railRule(issue: string): string {
  if (issue.includes('senza vocali')) return 'struttura: righe/colonne senza vocali';
  if (issue.includes('lontane da ogni vocale')) return 'struttura: consonanti lontane da una vocale';
  if (issue.includes('h senza c/g')) return 'struttura: h senza c/g vicini';
  if (issue.includes('non italiane')) return 'struttura: lettere non italiane';
  if (issue.startsWith('vocali')) return 'vocali fuori banda (30–60%)';
  if (issue.includes('token rari')) return 'token rari H/Z/QU (>3)';
  if (issue.includes('righe') || issue.includes('colonne')) return 'righe/colonne senza soluzioni';
  if (issue.startsWith('nessuna parola')) return 'ancora: nessuna parola lunga';
  return issue;
}

/** Aggrega i motivi di scarto per regola. */
function groupRailRejections(rejections: Record<string, number>): Map<string, number> {
  const byRule = new Map<string, number>();
  for (const [reason, n] of Object.entries(rejections)) {
    const rule = railRule(reason);
    byRule.set(rule, (byRule.get(rule) ?? 0) + n);
  }
  return byRule;
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

/** Difficoltà composita di una griglia (R e M ricavati dai suoi dati). */
function boardDifficulty(board: AleBoardStats): number {
  return compositeDifficulty(board.rarity, board.wordCount, board.score);
}

function reportForSize(
  size: GridSize,
  inputs: ReturnType<typeof loadAleInputs>,
  samples: number,
  count: number,
  seed: number,
  maxAttempts: number,
): void {
  const { freq, trie, rings, dictPrime } = inputs;

  console.log(`\n\n# Report algoritmo ale — ${size}×${size}, ${samples} campioni, ${count} schede per fascia, seed ${seed}\n`);

  // ------------------------------------------------------------------ ingressi
  console.log('\n## Ingressi');
  console.log(`  Dict'                 ${dictPrime.length.toLocaleString('it-IT')} parole`);
  console.log(
    `  anelli easy/medium    ${rings.easy.size.toLocaleString('it-IT')} / ${rings.medium.size.toLocaleString('it-IT')} (da frequency-it.txt)`,
  );
  console.log(`  alfabeto              ${freq.ordered.length} token (QU unico)`);
  console.log(
    `  token più frequenti   ${freq.ordered.slice(0, 10).map((t) => `${t.token} ${(t.freq * 100).toFixed(1)}%`).join(' · ')}`,
  );
  const rails = DEFAULT_ALE_GUARD_RAILS;
  const railText = [
    rails.vowels ? `vocali ${pct(rails.vowels.min)}–${pct(rails.vowels.max)}` : 'vocali libere',
    rails.rareCap !== null ? `al più ${rails.rareCap} token rari H/Z/QU in totale` : 'nessun tetto sui token rari',
    rails.structure ? 'struttura giocabile' : 'struttura libera',
    rails.noUncoveredLines ? 'nessuna riga/colonna senza soluzioni' : 'righe/colonne libere',
    rails.anchorMinLength
      ? `ancora ≥ ${rails.anchorMinLength[4]}/${rails.anchorMinLength[5]}/${rails.anchorMinLength[6]} lettere (4/5/6)`
      : 'nessuna ancora',
  ].join(' · ');
  console.log(`  guard rails           ${railText}`);

  // -------------------------------------------------------------- calibrazione
  const calStats = newAleGenerationStats();
  const boards = sampleAleBoards(size, freq, trie, rings, samples, seed, DEFAULT_ALE_GUARD_RAILS, calStats);
  const calibration: AleCalibration = calibrateAle(boards, {
    guardRails: DEFAULT_ALE_GUARD_RAILS,
    dictSize: dictPrime.length,
    rings: ALE_RARITY_RINGS,
    rho: ALE_CALIBRATION_RHO,
  });

  const counts = boards.map((b) => b.wordCount).sort((a, b) => a - b);
  const rarities = boards.map((b) => b.rarity).sort((a, b) => a - b);
  const richnesses = boards.map((b) => richnessFor(b.wordCount, b.score)).sort((a, b) => a - b);
  const comq = boards.map((b) => boardDifficulty(b)).sort((a, b) => a - b);
  const { mean: meanWords } = meanSd(boards.map((b) => b.wordCount));
  const { mean: meanRarity, sd: sdRarity } = meanSd(boards.map((b) => b.rarity));
  const { mean: meanRich, sd: sdRich } = meanSd(richnesses);
  const { mean: meanComq, sd: sdComq } = meanSd(comq);

  // Quote medie per anello (f0/f1/f2): 0 = top-5k, 1 = 5–20k, 2 = oltre.
  const shareSum = [0, 0, 0];
  let shareN = 0;
  for (const b of boards) {
    if (b.wordCount === 0) continue;
    shareN++;
    for (let i = 0; i < 3; i++) shareSum[i]! += b.ringCounts[i]! / b.wordCount;
  }
  const shares = shareSum.map((s) => (shareN > 0 ? s / shareN : 0));

  console.log('\n## Calibrazione');
  console.log(
    `  griglie campionate    ${calStats.sampled.toLocaleString('it-IT')} campioni → ${boards.length} griglie valide, ` +
      `${calStats.rejected.toLocaleString('it-IT')} respinte dai guard rails ` +
      `(${pct(calStats.rejected / Math.max(1, calStats.sampled))}), ` +
      `${calStats.noGrid} senza griglia dopo i tentativi interni`,
  );
  console.log(
    `  scarti guard rails    ${[...groupRailRejections(calStats.railRejections).entries()]
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
    `  quote per anello      f0 ${shares[0]!.toFixed(3)} · f1 ${shares[1]!.toFixed(3)} · f2 ${shares[2]!.toFixed(3)} (medie)`,
  );
  console.log(
    `  rarità R              min ${rarities[0]?.toFixed(3)} · mediana ${percentile(rarities, 50).toFixed(3)} · ` +
      `max ${rarities[rarities.length - 1]?.toFixed(3)} (media ${meanRarity.toFixed(3)} ± ${sdRarity.toFixed(3)})`,
  );
  console.log(
    `  ricchezza M           min ${richnesses[0]?.toFixed(3)} · mediana ${percentile(richnesses, 50).toFixed(3)} · ` +
      `max ${richnesses[richnesses.length - 1]?.toFixed(3)} (media ${meanRich.toFixed(3)} ± ${sdRich.toFixed(3)})`,
  );
  console.log(
    `  difficoltà composita  min ${comq[0]?.toFixed(3)} · mediana ${percentile(comq, 50).toFixed(3)} · ` +
      `max ${comq[comq.length - 1]?.toFixed(3)} (media ${meanComq.toFixed(3)} ± ${sdComq.toFixed(3)})`,
  );
  console.log(`  k-means k=3 usato: ${calibration.provenance.usedKmeans ? 'sì' : 'no (fallback ai tertili)'}`);
  console.log(`  perTierFallback: ${calibration.provenance.perTierFallback ? 'sì' : 'no'}`);
  for (const tier of calibration.tiers) {
    const inTier = boards.filter((b) => tierForDifficulty(boardDifficulty(b), calibration) === tier.difficulty).length;
    console.log(
      `    ${tier.difficulty.padEnd(9)} centro ${tier.targetDifficulty.toFixed(3)} · difficoltà ` +
        `[${tier.range.min.toFixed(3)}, ${tier.range.max.toFixed(3)}] · parole fascia ` +
        `[${tier.wordRange.lo}, ${tier.wordRange.hi}] · ${inTier} griglie del campione (${pct(inTier / Math.max(1, boards.length))})`,
    );
  }
  const inRange = boards.filter(
    (b) => b.wordCount >= calibration.wordRange.lo && b.wordCount <= calibration.wordRange.hi,
  ).length;
  console.log(
    `  griglie dentro l'intervallo di parole: ${inRange}/${boards.length} (${pct(inRange / Math.max(1, boards.length))})`,
  );

  // ------------------------------------------------------- prima generazione
  const committed = loadCommittedCalibration(size);
  const useCommitted =
    committed !== null &&
    JSON.stringify(committed.calibration.provenance.guardRails) === JSON.stringify(DEFAULT_ALE_GUARD_RAILS) &&
    committed.calibration.provenance.metric === 'rings-v1';
  const generationCalibration = useCommitted ? committed!.calibration : calibration;
  console.log('\n## Prima generazione (a tre secchi)');
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
      console.log('  calibrazione usata     ricalcolata ora (quella committata non è valida per i rails/metrica attuali)');
    }
  } else {
    console.log('  calibrazione usata     ricalcolata ora (nessuna calibration.json per questa dimensione)');
  }

  const genStats = newAleGenerationStats();
  const buckets = generateAleBuckets({
    size,
    perTier: count,
    freq,
    trie,
    rings,
    calibration: generationCalibration,
    seed,
    idStart: 1,
    maxAttempts,
    stats: genStats,
  });

  const byRule = groupRailRejections(genStats.railRejections);
  const railTotal = [...byRule.values()].reduce((a, b) => a + b, 0);
  console.log(
    `  flusso                tentativi ${genStats.attempts.toLocaleString('it-IT')} · campioni guard rails ` +
      `${genStats.sampled.toLocaleString('it-IT')} · respinti ${genStats.rejected.toLocaleString('it-IT')} ` +
      `(${pct(genStats.rejected / Math.max(1, genStats.sampled))}) · nessuna griglia ${genStats.noGrid}`,
  );
  console.log(
    `  reiezioni esterne     fuori range globale ${genStats.wordCountOut.toLocaleString('it-IT')} · ` +
      `fuori banda fascia ${genStats.tierBandOut.toLocaleString('it-IT')} · ripieghi ${genStats.fallbacks}`,
  );
  console.log(`  violazioni guard rails ${railTotal.toLocaleString('it-IT')} (un campione può violarne più di una)`);
  for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(
      `    ${rule.padEnd(42)} ${n.toLocaleString('it-IT').padStart(8)}  (${pct(n / Math.max(1, genStats.sampled))} dei campioni)`,
    );
  }

  for (const difficulty of DIFFICULTY_ORDER) {
    const schede = buckets[difficulty];
    const tier = generationCalibration.tiers.find((t) => t.difficulty === difficulty)!;
    const words = schede.map((s) => s.allWords ?? s.words);
    const wordCounts = words.map((w) => w.length);
    const rarities = words.map((w) => aleRarityRings(w, rings).rarity);
    const diffs = schede.map((s, i) => {
      const wc = wordCounts[i]!;
      const score = words[i]!.reduce((a, w) => a + Math.max(0, w.length - 2), 0);
      return compositeDifficulty(rarities[i]!, wc, score);
    });
    const inBand = schede.filter((s, i) => {
      const wc = wordCounts[i]!;
      return (
        wc >= generationCalibration.wordRange.lo &&
        wc <= generationCalibration.wordRange.hi &&
        wc >= tier.wordRange.lo &&
        wc <= tier.wordRange.hi
      );
    }).length;
    const meanRarity = rarities.reduce((a, b) => a + b, 0) / Math.max(1, rarities.length);
    console.log(`\n  ${difficulty.toUpperCase()} — ${schede.length} schede`);
    console.log(
      `    parole                ${Math.min(...wordCounts)}–${Math.max(...wordCounts)} (media ${(wordCounts.reduce((a, b) => a + b, 0) / Math.max(1, wordCounts.length)).toFixed(0)}) · ` +
        `banda fascia [${tier.wordRange.lo}, ${tier.wordRange.hi}] · in banda ${inBand}/${schede.length}`,
    );
    console.log(
      `    difficoltà            ${Math.min(...diffs).toFixed(3)}–${Math.max(...diffs).toFixed(3)} (centro ${tier.targetDifficulty.toFixed(3)}) · ` +
        `R media ${meanRarity.toFixed(3)}`,
    );
    const ids = schede.map((s) => s.id);
    console.log(`    id                    ${ids[0]} … ${ids[ids.length - 1]}`);

    const catalog = loadCatalogAle(size, difficulty);
    if (catalog.length > 0) {
      const catalogGrids = new Set(catalog.map((s) => s.grid));
      const same = schede.filter((s) => catalogGrids.has(s.grid)).length;
      const catalogWords = catalog.map((s) => (s.allWords ?? s.words).length).sort((a, b) => a - b);
      console.log(
        `    catalogo              ${catalog.length} schede ale, parole ${catalogWords[0]}–${catalogWords[catalogWords.length - 1]} ` +
          `(media ${(catalogWords.reduce((a, b) => a + b, 0) / catalog.length).toFixed(0)}) · griglie identiche a questa run: ${same}/${schede.length}`,
      );
    }
  }
}

function main(): void {
  const allSizes = hasFlag('all-sizes');
  const sizes: GridSize[] = allSizes ? [4, 5, 6] : [Number(arg('size', '5')) as GridSize];
  const samples = Number(arg('samples', '2000'));
  const count = Number(arg('n', '15'));
  const seed = Number(arg('seed', '1'));
  const maxAttempts = Number(arg('attempts', String(500 * count)));

  const inputs = loadAleInputs();
  for (const size of sizes) {
    reportForSize(size, inputs, samples, count, seed, maxAttempts);
  }
  console.log(
    `\nRiproduci con: pnpm --filter @boggle/server report:ale -- ${allSizes ? '--all-sizes' : `--size ${sizes[0]}`} --samples ${samples} --n ${count} --seed ${seed}`,
  );
}

main();
