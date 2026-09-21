/**
 * Verifica le schede generate rispetto ai CRITERI dichiarati.
 *
 * A cosa serve: i criteri di qualità (lessico, quantità, lunghezza, rarità, banda
 * di punteggio) vivono in `packages/shared/src/schedaGen.ts`. Questo script legge
 * le schede su disco e controlla che OGNI scheda li rispetti, segnalando le
 * violazioni. Serve dopo una rigenerazione, dopo aver cambiato una soglia, o per
 * capire perché una categoria si comporta diversamente dalle altre.
 *
 * Uso:
 *   pnpm --filter @boggle/server verify:schede              # tutte le categorie
 *   pnpm --filter @boggle/server verify:schede -- --size 5  # solo una dimensione
 *   … -- --difficolta facile                                # solo una difficoltà
 *   … -- --verbose                                          # elenca ogni scheda
 *   … -- --measure 200                                      # misura N griglie fresche
 *                                                           # (invece di leggere il disco)
 *
 * Esce con codice 1 se trova violazioni: utilizzabile in CI.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSchedaPool,
  DIFFICULTY_ORDER,
  minByLengthFor,
  normalizeWord,
  requiredLengthsFor,
  SCHEDA_CRITERIA,
  schedaFileName,
  scoreBandFor,
  type Difficulty,
  type GridSize,
  type Scheda,
} from '@boggle/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DICT_DIR = path.join(ROOT, 'packages/dictionary/data');
const SCHEDE_DIR = path.join(ROOT, 'packages/shared/schede');

const ALL_SIZES: GridSize[] = [4, 5, 6];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function readWords(file: string): string[] {
  const full = path.join(DICT_DIR, file);
  if (!existsSync(full)) return [];
  return readFileSync(full, 'utf8')
    .split('\n')
    .map((l) => normalizeWord(l.trim()))
    .filter((w) => w.length >= 3);
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

/**
 * Lessico "comune" per il criterio di rarità.
 *
 * DEVE coincidere con quello usato da `createSchedaPool`: i 60k PIÙ i prestiti in
 * consonante della lista bianca (`film`, `gol`, `computer`), che il pool aggiunge
 * al lessico comune. Leggendo solo i 60k il verificatore segnalava come "rare"
 * parole che il generatore considera comuni, producendo falsi positivi.
 */
function commonLexicon(): Set<string> {
  return new Set([...readWords('60000_parole_italiane.txt'), ...readCuratedList('consonant-endings.txt')]);
}

/** Una violazione di un criterio, con il contesto per capirla. */
interface Violation {
  schedaId: string;
  criterion: string;
  detail: string;
}

/**
 * Controlla una scheda contro i criteri. Ritorna l'elenco delle violazioni.
 *
 * I criteri sono gli stessi usati dal generatore: qui li rileggiamo da
 * `SCHEDA_CRITERIA`, così non possono disallinearsi.
 */
function checkScheda(
  scheda: Scheda,
  commonSet: Set<string>,
): { violations: Violation[]; stats: SchedaSummary } {
  const violations: Violation[] = [];
  const shape = SCHEDA_CRITERIA.shape[scheda.size];
  const band = SCHEDA_CRITERIA.band[scheda.difficulty];
  const { min: minScore, max: maxScore } = scoreBandFor(scheda.size, scheda.difficulty);

  const byLength = new Map<number, number>();
  let score = 0;
  let rare = 0;
  for (const w of scheda.words) {
    byLength.set(w.length, (byLength.get(w.length) ?? 0) + 1);
    score += w.length - 2;
    if (!commonSet.has(w)) rare++;
  }

  // 1. Quantità.
  if (scheda.words.length < shape.minWords) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'quantità',
      detail: `${scheda.words.length} parole < minimo ${shape.minWords}`,
    });
  }

  // 2. Scala di lunghezze (già scalata per la difficoltà).
  for (const len of requiredLengthsFor(scheda.size, scheda.difficulty)) {
    if (!byLength.has(len)) {
      violations.push({
        schedaId: scheda.id,
        criterion: 'lunghezza',
        detail: `nessuna parola di ${len} lettere (richiesta dalla scala)`,
      });
    }
  }

  // 3. Soglie per fascia (già scalate per la difficoltà).
  for (const rule of minByLengthFor(scheda.size, scheda.difficulty)) {
    let count = 0;
    for (const [len, n] of byLength) if (len >= rule.length) count += n;
    if (count < rule.count) {
      violations.push({
        schedaId: scheda.id,
        criterion: 'lunghezza',
        detail: `${count} parole da ${rule.length}+ lettere < minimo ${rule.count}`,
      });
    }
  }

  // 4. Rarità: il generatore confronta le parole rare con un budget derivato dal
  // minimo della dimensione, non dal totale: qui usiamo la STESSA formula, così il
  // verificatore accetta esattamente ciò che il generatore accetta.
  const rarityBudget = Math.max(0, Math.floor(shape.minWords * band.maxRareRatio));
  if (rare > rarityBudget) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'rarità',
      detail: `${rare} parole rare > budget ${rarityBudget} (lessico ${band.lexicon})`,
    });
  }

  // 5. Banda di punteggio.
  if (score < minScore || score > maxScore) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'punteggio',
      detail: `${score} fuori banda [${minScore}, ${maxScore}]`,
    });
  }

  return {
    violations,
    stats: {
      id: scheda.id,
      words: scheda.words.length,
      score,
      rare,
      commonRatio: scheda.words.length ? 1 - rare / scheda.words.length : 0,
      longest: scheda.longest,
    },
  };
}

interface SchedaSummary {
  id: string;
  words: number;
  score: number;
  rare: number;
  commonRatio: number;
  longest: number;
}

function summarize(label: string, summaries: SchedaSummary[], violations: Violation[], ms: number): void {
  if (summaries.length === 0) {
    console.log(`${label.padEnd(22)} —  nessuna scheda`);
    return;
  }
  const scores = summaries.map((s) => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  const common = summaries.reduce((a, b) => a + b.commonRatio, 0) / summaries.length;
  const words = summaries.reduce((a, b) => a + b.words, 0) / summaries.length;
  const flag = violations.length === 0 ? '✓' : '✗';
  console.log(
    `${flag} ${label.padEnd(20)} n=${String(summaries.length).padStart(3)}  ` +
      `score ${Math.min(...scores)}–${Math.max(...scores)} (μ${mean.toFixed(0)} σ${sd.toFixed(0)} CV${((sd / mean) * 100).toFixed(0)}%)  ` +
      `parole~${words.toFixed(0)}  comuni ${(common * 100).toFixed(0)}%  ${ms}ms`,
  );
}

function main(): void {
  const onlySize = arg('size') ? (Number(arg('size')) as GridSize) : undefined;
  const onlyDiff = arg('difficolta') as Difficulty | undefined;
  const verbose = hasFlag('verbose');
  const measureCount = arg('measure') ? Number(arg('measure')) : undefined;

  const sizes = onlySize ? [onlySize] : ALL_SIZES;
  const difficulties = onlyDiff ? [onlyDiff] : DIFFICULTY_ORDER;
  for (const s of sizes) if (!ALL_SIZES.includes(s)) throw new Error(`Dimensione non valida: ${s}`);
  for (const d of difficulties) if (!DIFFICULTY_ORDER.includes(d)) throw new Error(`Difficoltà non valida: ${d}`);

  console.log('Carico il lessico comune…');
  const commonSet = commonLexicon();
  console.log(`  lessico comune: ${commonSet.size.toLocaleString('it-IT')} parole\n`);

  /*
   * Due modalità:
   *  - `--measure N`: genera N griglie FRESCHE con il pool e le controlla. Serve
   *    a valutare l'effetto di una modifica ai criteri senza toccare le schede.
   *  - default: legge le schede su disco e le controlla. È la verifica del
   *    catalogo che verrà effettivamente giocato.
   */
  let pool: ReturnType<typeof createSchedaPool> | null = null;
  if (measureCount !== undefined) {
    console.log(`Modalità misura: ${measureCount} griglie fresche per categoria`);
    console.log('  (leggo il dizionario completo, serve per risolvere)\n');
    pool = createSchedaPool({
      fullWords: readWords('words.txt'),
      commonWords: [...commonSet],
    });
  }

  const allViolations: Violation[] = [];
  for (const size of sizes) {
    for (const difficulty of difficulties) {
      const label = `${size}×${size} ${difficulty}`;
      const t0 = Date.now();
      let schede: Scheda[];
      if (pool) {
        schede = pool.generate(size, difficulty, measureCount!);
      } else {
        const file = path.join(SCHEDE_DIR, schedaFileName(size, difficulty));
        if (!existsSync(file)) {
          console.log(`— ${label.padEnd(20)} file assente (${schedaFileName(size, difficulty)})`);
          continue;
        }
        schede = (JSON.parse(readFileSync(file, 'utf8')) as { schede?: Scheda[] }).schede ?? [];
      }

      const summaries: SchedaSummary[] = [];
      const violations: Violation[] = [];
      for (const scheda of schede) {
        const res = checkScheda(scheda, commonSet);
        summaries.push(res.stats);
        violations.push(...res.violations);
        if (verbose && res.violations.length > 0) {
          for (const v of res.violations) console.log(`    ${v.schedaId}: ${v.criterion} — ${v.detail}`);
        }
      }
      summarize(label, summaries, violations, Date.now() - t0);
      allViolations.push(...violations);
    }
  }

  console.log('');
  if (allViolations.length === 0) {
    console.log(`✓ Nessuna violazione: ${measureCount === undefined ? 'le schede su disco' : 'le griglie misurate'} rispettano i criteri.`);
    process.exit(0);
  }

  // Riepilogo per criterio: dice subito quale soglia è fuori portata.
  const byCriterion = new Map<string, number>();
  for (const v of allViolations) byCriterion.set(v.criterion, (byCriterion.get(v.criterion) ?? 0) + 1);
  console.log(`✗ ${allViolations.length} violazioni:`);
  for (const [criterion, n] of [...byCriterion.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${criterion}: ${n}`);
  }
  console.log('\n  Usa --verbose per l\'elenco dettagliato (scheda per scheda).');
  console.log('  Se una soglia è troppo stretta, regolala in packages/shared/src/schedaGen.ts');
  console.log('  e rigenera con: pnpm gen:schede -- --n 50');
  process.exit(1);
}

main();
