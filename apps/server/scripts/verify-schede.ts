/**
 * Verifica le schede generate rispetto ai CRITERI dichiarati.
 *
 * A cosa serve: i criteri di qualità (densità di parole accettate, parola lunga,
 * coerenza fra parole attese e accettate) vivono in
 * `packages/shared/src/schedaGen.ts`. Questo script legge le schede su disco e
 * controlla che OGNI scheda li rispetti, segnalando le violazioni. Serve dopo una
 * rigenerazione, dopo aver cambiato una soglia, o per capire perché una categoria
 * si comporta diversamente dalle altre.
 *
 * Uso:
 *   pnpm --filter @boggle/server verify:schede              # tutte le categorie
 *   pnpm --filter @boggle/server verify:schede -- --size 5  # solo una dimensione
 *   … -- --difficolta facile                                # solo una difficoltà
 *   … -- --verbose                                          # elenca ogni scheda
 *   … -- --measure 200                                      # genera N schede fresche
 *                                                           # (invece di leggere il disco)
 *
 * Esce con codice 1 se trova violazioni: utilizzabile in CI.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  anchorFor,
  createSchedaPool,
  DIFFICULTY_ORDER,
  densityBandFor,
  normalizeWord,
  SCHEDA_CRITERIA,
  schedaFileName,
  schedaVariantOf,
  SCHEDA_VARIANT_LABELS,
  SPECS,
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

/** Una violazione di un criterio, con il contesto per capirla. */
interface Violation {
  schedaId: string;
  criterion: string;
  detail: string;
}

interface SchedaSummary {
  id: string;
  /** Criteri con cui è stata generata (standard / full criteria). */
  variant: string;
  words: number;
  score: number;
  longest: number;
  meanLength: number;
}

/**
 * Controlla una scheda contro i criteri. Ritorna l'elenco delle violazioni.
 *
 * I criteri sono gli stessi usati dal generatore: qui li rileggiamo da
 * `SCHEDA_CRITERIA`, così non possono disallinearsi.
 *
 * La densità si misura sull'insieme ACCETTATO (`allWords`, dizionario intero):
 * è il numero di parole che il giocatore può trovare, ed è l'unica misura che
 * separa davvero i livelli (contando le parole della fascia il numero si
 * invertiva fra facile e difficile).
 *
 * Il verificatore usa una TOLLERANZA sui confini di densità (`densityTolerance`):
 * le schede sono state generate con un dizionario preciso, e una ricostruzione
 * leggermente diversa può spostare di poco il conteggio. Senza tolleranza si
 * segnalerebbero differenze di una o due parole.
 */
function checkScheda(
  scheda: Scheda,
  dictionary: Set<string>,
): { violations: Violation[]; stats: SchedaSummary } {
  const violations: Violation[] = [];
  // I criteri dipendono dalla VARIANTE della scheda (standard / full criteria).
  const variant = schedaVariantOf(scheda);
  const spec = SPECS[variant];
  const band = densityBandFor(scheda.size, scheda.difficulty, variant);
  const anchor = anchorFor(scheda.size, scheda.difficulty, variant);
  const meanBand = spec.meanLength?.[scheda.size]?.[scheda.difficulty];
  const tol = SCHEDA_CRITERIA.densityTolerance;
  const minWords = Math.floor(band.min * (1 - tol));
  const maxWords = Math.ceil(band.max * (1 + tol));

  /*
   * L'insieme accettato in partita. Le schede di formato 1 non hanno `allWords`:
   * allora valgono le sole `words`, e la scheda va segnalata perché con
   * l'algoritmo nuovo la densità si misura sull'insieme accettato.
   */
  const accepted = Array.isArray(scheda.allWords) ? scheda.allWords : [];
  if (accepted.length === 0) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'formato',
      detail: 'manca allWords (scheda di formato 1?): rigenera con pnpm gen:schede',
    });
  }

  // Statistiche e coerenza: le parole accettate devono esistere nel dizionario,
  // altrimenti la scheda è stata generata con un lessico diverso (stale).
  const acceptedSet = new Set(accepted);
  let notInDictionary = 0;
  let score = 0;
  let longest = 0;
  let anchors = 0;
  let totalLength = 0;
  for (const w of accepted) {
    score += w.length - 2;
    if (w.length > longest) longest = w.length;
    if (w.length >= anchor.length) anchors++;
    totalLength += w.length;
    if (dictionary.size > 0 && !dictionary.has(w)) notInDictionary++;
  }
  const meanLength = accepted.length > 0 ? totalLength / accepted.length : 0;

  // 1. Densità: quante parole si possono trovare, nella banda della difficoltà.
  if (accepted.length < minWords || accepted.length > maxWords) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'densità',
      detail: `${accepted.length} parole accettate fuori banda [${band.min}, ${band.max}]`,
    });
  }

  // 2. Parole ancora: almeno N parole di almeno L lettere.
  if (anchors < anchor.count) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'parole ancora',
      detail: `${anchors} parole da ${anchor.length}+ lettere, minimo ${anchor.count}`,
    });
  }

  // 3. Lunghezza media (solo "full criteria").
  if (meanBand && (meanLength < meanBand.min || meanLength > meanBand.max)) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'lunghezza media',
      detail: `${meanLength.toFixed(2)} fuori banda [${meanBand.min}, ${meanBand.max}]`,
    });
  }

  // 4. Il campo `longest` deve descrivere la scheda.
  if (scheda.longest !== longest) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'metadati',
      detail: `longest=${scheda.longest} ma la più lunga accettata è di ${longest} lettere`,
    });
  }

  // 5. Le parole ATTESE (fascia) devono essere un sottoinsieme delle accettate.
  const notAccepted = scheda.words.filter((w) => !acceptedSet.has(w));
  if (notAccepted.length > 0) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'coerenza',
      detail: `${notAccepted.length} parole attese non sono nell'insieme accettato (es. ${notAccepted[0]})`,
    });
  }

  // 6. Coerenza con il dizionario.
  if (notInDictionary > 0) {
    violations.push({
      schedaId: scheda.id,
      criterion: 'dizionario',
      detail: `${notInDictionary} parole accettate non sono nel dizionario (schede stale?)`,
    });
  }

  return {
    violations,
    stats: {
      id: scheda.id,
      variant,
      words: accepted.length,
      score,
      longest,
      meanLength,
    },
  };
}

function summarize(label: string, summaries: SchedaSummary[], violations: Violation[], ms: number): void {
  if (summaries.length === 0) {
    console.log(`${label.padEnd(22)} —  nessuna scheda`);
    return;
  }
  const scores = summaries.map((s) => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  const words = summaries.reduce((a, b) => a + b.words, 0) / summaries.length;
  const meanLen = summaries.reduce((a, b) => a + b.meanLength, 0) / summaries.length;
  // Varianti presenti nel gruppo: il catalogo mescola standard e "full criteria".
  const byVariant = new Map<string, number>();
  for (const s of summaries) byVariant.set(s.variant, (byVariant.get(s.variant) ?? 0) + 1);
  const variantLabel = [...byVariant.entries()]
    .map(([v, n]) => `${SCHEDA_VARIANT_LABELS[v as keyof typeof SCHEDA_VARIANT_LABELS] ?? v} ${n}`)
    .join(' + ');
  const flag = violations.length === 0 ? '✓' : '✗';
  console.log(
    `${flag} ${label.padEnd(20)} n=${String(summaries.length).padStart(3)}  [${variantLabel}]  ` +
      `punteggio max ${Math.min(...scores)}–${Math.max(...scores)} (μ${mean.toFixed(0)} σ${sd.toFixed(0)} CV${((sd / mean) * 100).toFixed(0)}%)  ` +
      `parole~${words.toFixed(0)}  media ${meanLen.toFixed(2)}  ${ms}ms`,
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

  /*
   * Due modalità:
   *  - `--measure N`: genera N schede FRESCHE con il pool e le controlla. Serve
   *    a valutare l'effetto di una modifica ai criteri senza toccare il catalogo.
   *  - default: legge le schede su disco e le controlla. È la verifica del
   *    catalogo che verrà effettivamente giocato.
   */
  let pool: ReturnType<typeof createSchedaPool> | null = null;
  if (measureCount !== undefined) {
    console.log(`Modalità misura: ${measureCount} schede fresche per categoria`);
    console.log('  (leggo dizionario e fasce di frequenza, servono per risolvere)\n');
    pool = createSchedaPool({
      fullWords: readWords('words.txt'),
      frequencyWords: readWords('frequency-it.txt'),
      allowedConsonantEndings: readCuratedList('consonant-endings.txt'),
      abbreviations: readCuratedList('abbreviations.txt'),
    });
  }

  // Dizionario: serve al controllo di coerenza (schede stale).
  const dictionary = new Set(readWords('words.txt'));
  console.log(`  dizionario: ${dictionary.size.toLocaleString('it-IT')} parole\n`);

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
        const res = checkScheda(scheda, dictionary);
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
    console.log(
      `✓ Nessuna violazione: ${measureCount === undefined ? 'le schede su disco' : 'le schede misurate'} rispettano i criteri.`,
    );
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
  console.log('  e rigenera con: pnpm gen:schede');
  process.exit(1);
}

main();
