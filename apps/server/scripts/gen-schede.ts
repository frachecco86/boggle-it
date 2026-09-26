/**
 * Genera le schede pre-calcolate e le scrive in `packages/shared/schede/`.
 *
 * L'algoritmo è quello descritto in `packages/shared/src/schedaGen.ts`: tre trie
 * per fascia di FREQUENZA (5k / 20k / 60k parole più usate), griglia campionata
 * con la frequenza reale delle lettere della fascia, filtro a due condizioni
 * (densità + una parola lunga) e insieme accettato = dizionario intero.
 *
 * Uso:
 *   pnpm gen:schede                                     # 10 schede standard per combinazione
 *   pnpm gen:schede -- --variant full --n 5 --append     # 5 schede "full criteria"
 *   pnpm gen:schede -- --size 4 --difficolta normale --n 60
 *
 * Opzioni:
 *   --size 4|5|6          dimensione della griglia (default: tutte)
 *   --difficolta <nome>   facile|normale|difficile (default: tutte)
 *   --n <numero>          schede da generare per combinazione (default 10)
 *   --variant <nome>      standard|full: insieme di criteri (default standard)
 *   --append              aggiunge alle schede esistenti invece di sovrascrivere
 *   --replace             rigenera SOLO le schede della variante scelta e tiene
 *                         le altre (gli id ripartono dopo quelle conservate)
 *   --seed <numero>       seme del generatore (per risultati riproducibili)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acceptedWords,
  createSchedaPool,
  resolveSchedaVariant,
  SCHEDA_VARIANT_LABELS,
  schedaVariantOf,
  DIFFICULTY_ORDER,
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
const ALL_DIFFICULTIES: Difficulty[] = DIFFICULTY_ORDER;

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
  const count = Number(arg('n', '10'));
  const append = hasFlag('append');
  const replace = hasFlag('replace');
  const seed = arg('seed') ? Number(arg('seed')) : undefined;
  const rng = seed !== undefined ? mulberry32(seed) : undefined;
  // Insieme di criteri: `standard` (storico) o `full` ("full criteria").
  const variant = resolveSchedaVariant(arg('variant'));

  for (const size of sizes) {
    if (!ALL_SIZES.includes(size)) throw new Error(`Dimensione non valida: ${size}`);
  }
  for (const d of difficulties) {
    if (!ALL_DIFFICULTIES.includes(d)) throw new Error(`Difficoltà non valida: ${d}`);
  }

  console.log('Carico il dizionario…');
  const fullWords = readWords('words.txt');
  // Lista ORDINATA per frequenza: da qui si ritagliano le fasce 5k / 20k / 60k.
  const frequencyWords = readWords('frequency-it.txt');
  // Liste canoniche di giocabilità: le STESSE usate dal build del dizionario
  // (`build-words.mjs`), così dizionario e schede non possono divergere.
  const allowedConsonantEndings = readCuratedList('consonant-endings.txt');
  const abbreviations = readCuratedList('abbreviations.txt');
  console.log(`  dizionario completo: ${fullWords.length.toLocaleString('it-IT')} parole`);
  console.log(`  lista di frequenza:  ${frequencyWords.length.toLocaleString('it-IT')} parole`);
  console.log(`  finali in consonante ammessi: ${allowedConsonantEndings.length}`);
  console.log(`  abbreviazioni ammesse: ${abbreviations.length}`);

  // Parole funzionali (articoli, preposizioni, possessivi come `tua`) NON sono più
  // escluse: la lista delle parole giocabili coincide con il dizionario. Restano
  // fuori solo i troncamenti e le voci bloccate.
  const pool = createSchedaPool({
    fullWords,
    frequencyWords,
    allowedConsonantEndings,
    abbreviations,
  });
  console.log(
    `  fasce: facile ${pool.bandCounts.facile.toLocaleString('it-IT')} · ` +
      `normale ${pool.bandCounts.normale.toLocaleString('it-IT')} · ` +
      `difficile ${pool.bandCounts.difficile.toLocaleString('it-IT')}`,
  );
  mkdirSync(OUT_DIR, { recursive: true });

  for (const size of sizes) {
    for (const difficulty of difficulties) {
      const existing = append || replace ? loadExisting(size, difficulty) : [];
      /*
       * `--replace`: si RIGENERANO le schede della variante richiesta e si
       * tengono quelle delle altre. Serve quando cambiano i criteri di una sola
       * variante (es. le regole di struttura dei "full criteria"): gli id delle
       * schede sostituite ripartono subito dopo le conservate, quindi restano
       * gli stessi di prima.
       */
      const kept = replace ? existing.filter((s) => schedaVariantOf(s) !== variant) : existing;
      const startIndex = kept.length + 1;
      const startedAt = Date.now();
      const fresh = pool.generate(size, difficulty, count, { startIndex, rng, variant });
      const schede = append || replace ? [...kept, ...fresh] : fresh;
      const file: SchedaFile = {
        version: SCHEDA_FORMAT_VERSION,
        generatedAt: new Date().toISOString(),
        size,
        difficulty,
        schede,
      };
      const outPath = path.join(OUT_DIR, schedaFileName(size, difficulty));
      writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
      // Parole ACCETTATE (quelle che il giocatore può trovare): è il numero che
      // descrive la ricchezza di una scheda. `x.words` è solo la fascia attesa.
      // Le medie si calcolano sulla variante appena generata, non su tutto il file.
      const avgWords = fresh.length
        ? Math.round(fresh.reduce((s, x) => s + acceptedWords(x).length, 0) / fresh.length)
        : 0;
      const avgLongest = fresh.length
        ? (fresh.reduce((s, x) => s + x.longest, 0) / fresh.length).toFixed(1)
        : '0';
      console.log(
        `✓ ${size}×${size} ${difficulty} [${SCHEDA_VARIANT_LABELS[variant]}]: ${fresh.length} schede nuove  ` +
          `(medie: ${avgWords} parole, più lunga ${avgLongest}) · totale nel file ${schede.length}  in ${Date.now() - startedAt}ms`,
      );
    }
  }
  console.log(`\nSchede scritte in ${path.relative(ROOT, OUT_DIR)}/`);
}

main();
