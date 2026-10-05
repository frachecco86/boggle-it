/**
 * Riallinea `words` e `allWords` delle schede pre-calcolate al dizionario corrente.
 *
 * PERCHÉ SERVE
 * Le schede su disco contengono gli elenchi delle parole GIÀ RISOLTI: `allWords`
 * è l'insieme ACCETTATO in partita. In single player il client valida le parole
 * contro `acceptedWords(scheda)` (`useSoloGame.ts`), quindi una parola che sta nel
 * dizionario ma non in `allWords` viene **rifiutata dal gioco**: è la stessa classe
 * di bug documentata in `build-words.mjs` per `tua` ("una parola che sta qui ma
 * non entra in nessuna scheda è una promessa non mantenuta").
 *
 * Il dizionario cambia (nuove fonti, whitelist, filtro dei troncamenti) e le
 * schede no: senza questo strumento le due cose divergono in silenzio. Il caso
 * concreto: il `words.br` versionato conteneva 113 ETICHETTE DI MATERIA (`agg`,
 * `avv`, `anat`, `archit`) già rimosse da `consonant-endings.txt`, e l'aggiunta
 * delle parole tecniche (`setosa`, `absidale`) ha allargato l'insieme accettato.
 * Misurato prima di questo strumento: **126 schede su 270 disallineate**.
 *
 * COSA FA
 * Ricalcola `allWords`/`words` con la STESSA pipeline del generatore
 * (`createSchedaPool` + `solveGrid`, stessi limiti di `schedaGen.ts`) e riscrive
 * solo le schede che cambiano. Le GRIGLIE non vengono toccate: si aggiornano gli
 * elenchi, non le schede. Così la calibrazione delle fasce `ale` resta valida.
 *
 * Le schede `ale` hanno `words === allWords` per costruzione
 * (`schedaAle.ts`: `allWords: words`): qui l'invariante è ripristinata tale e quale,
 * mentre per `standard`/`full` `words` resta il sottoinsieme di FASCIA (frequenza).
 *
 * ATTENZIONE: `ale` NON usa la stessa pipeline delle altre. Il suo trie viene da
 * `loadAleInputs()` (`ale.ts`): `Dict'` — che è il dizionario GREZZO, quindi SENZA
 * il filtro sulle consonanti finali di `schedaPool.ts` — con `maxLength: 16`
 * invece di 14. Riprodurre `ale` col trie delle schede classiche scarterebbe le
 * parole di 15-16 lettere (componibili su una 4×4/5×5/6×6) e cambierebbe
 * l'insieme accettato: qui si usa `getAleInputs().trie`, che è quello vero.
 *
 * Uso:
 *   pnpm --filter @boggle/server sync:schede             # riscrive le schede
 *   pnpm --filter @boggle/server sync:schede -- --check   # solo diagnosi (exit 1 se c'è deriva)
 *
 * Dopo, per allineare il bundle offline dell'app:
 *   node apps/web/scripts/copy-schede.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSchedaPool,
  normalizeWord,
  rowsToGrid,
  solveGrid,
  schedaVariantOf,
  type Difficulty,
  type Scheda,
  type SchedaFile,
} from '@boggle/shared';
import { getAleInputs } from '../src/ale.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DICT_DIR = path.join(ROOT, 'packages/dictionary/data');
const SCHEDE_DIR = path.join(ROOT, 'packages/shared/schede');

/*
 * Stessi limiti di `schedaGen.ts` (`FULL_SOLVE_LIMIT` / `BAND_SOLVE_LIMIT`).
 * Se cambiano là, vanno cambiati qui: sono i valori con cui le schede sono state
 * generate, e un limite diverso produrrebbe elenchi troncati in modo diverso.
 */
const FULL_SOLVE_LIMIT = 50_000;
const BAND_SOLVE_LIMIT = 3_000;
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 14;

const check = process.argv.includes('--check');

function readList(file: string, { minLength = 1 } = {}): string[] {
  const full = path.join(DICT_DIR, file);
  if (!existsSync(full)) {
    console.error(`✗ manca ${path.relative(ROOT, full)}`);
    process.exit(1);
  }
  return readFileSync(full, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0] ?? '')
    .map(normalizeWord)
    .filter((w) => w.length >= minLength);
}

const fullWords = readList('words.txt', { minLength: MIN_WORD_LENGTH });
const allowedConsonantEndings = readList('consonant-endings.txt', { minLength: MIN_WORD_LENGTH });
const frequencyWords = (() => {
  const full = path.join(DICT_DIR, 'frequency-it.txt');
  return existsSync(full) ? readFileSync(full, 'utf8').split('\n') : [];
})();

console.log(`  dizionario: ${fullWords.length.toLocaleString('it-IT')} parole`);
const pool = createSchedaPool({
  fullWords,
  frequencyWords,
  allowedConsonantEndings,
  maxWordLength: MAX_WORD_LENGTH,
});
console.log(
  `  fasce: facile ${pool.bandCounts.facile.toLocaleString('it-IT')} · ` +
    `normale ${pool.bandCounts.normale.toLocaleString('it-IT')} · ` +
    `difficile ${pool.bandCounts.difficile.toLocaleString('it-IT')}`,
);

/*
 * Ingressi del pipeline `ale`: `Dict'` con `maxLength: 16` e senza filtro sulle
 * consonanti finali. Vedi la nota in testa al file: è la pipeline VERA di `ale`,
 * non quella classica.
 */
const aleInputs = await getAleInputs();

interface Drift {
  file: string;
  id: string;
  variant: string;
  gained: string[];
  lost: string[];
  wordsChanged: number;
}

const drifts: Drift[] = [];
if (!existsSync(SCHEDE_DIR)) {
  console.error(`✗ Schede non trovate in ${SCHEDE_DIR}`);
  process.exit(1);
}
const files = readdirSync(SCHEDE_DIR).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const full = path.join(SCHEDE_DIR, file);
  const parsed = JSON.parse(readFileSync(full, 'utf8')) as SchedaFile;
  if (!Array.isArray(parsed.schede)) continue;

  let fileChanged = false;
  const next: Scheda[] = parsed.schede.map((scheda) => {
    const grid = rowsToGrid(scheda.grid);
    const isAle = schedaVariantOf(scheda) === 'ale';
    /*
     * `ale` e le varianti classiche usano due pipeline diverse (vedi la nota in
     * testa al file): `allWords` va calcolato col trie giusto per ciascuna.
     */
    const acceptedTrie = isAle ? aleInputs.trie : pool.tries.full;
    const allWords = solveGrid(grid, acceptedTrie, {
      limit: FULL_SOLVE_LIMIT,
      minLength: MIN_WORD_LENGTH,
    });
    /*
     * `words`: parole ATTESE. Per `ale` è l'insieme stesso (invariante di
     * `schedaAle.ts`), per le altre varianti è il sottoinsieme di fascia.
     */
    const words = isAle
      ? allWords
      : solveGrid(grid, pool.tries.bands[scheda.difficulty as Difficulty], {
          limit: BAND_SOLVE_LIMIT,
          minLength: MIN_WORD_LENGTH,
        });
    const longest = allWords[0]?.length ?? 0;

    const prevAll = new Set(scheda.allWords ?? []);
    const nextAll = new Set(allWords);
    const gained = allWords.filter((w) => !prevAll.has(w));
    const lost = (scheda.allWords ?? []).filter((w) => !nextAll.has(w));
    const wordsChanged = JSON.stringify(scheda.words) !== JSON.stringify(words);
    const allChanged = gained.length > 0 || lost.length > 0;
    const longestChanged = scheda.longest !== longest;

    if (allChanged || wordsChanged || longestChanged) {
      fileChanged = true;
      drifts.push({ file, id: scheda.id, variant: schedaVariantOf(scheda), gained, lost, wordsChanged: wordsChanged ? words.length : 0 });
    }
    return { ...scheda, words, allWords, longest };
  });

  if (fileChanged && !check) {
    writeFileSync(
      full,
      JSON.stringify({ ...parsed, generatedAt: new Date().toISOString(), schede: next }, null, 2) + '\n',
    );
  }
}

const gainedTotal = drifts.reduce((a, d) => a + d.gained.length, 0);
const lostTotal = drifts.reduce((a, d) => a + d.lost.length, 0);
const byVariant = drifts.reduce<Record<string, number>>((acc, d) => {
  acc[d.variant] = (acc[d.variant] ?? 0) + 1;
  return acc;
}, {});

if (drifts.length === 0) {
  console.log('\n✓ Nessuna deriva: le schede sono allineate al dizionario.');
} else {
  console.log(`\n${check ? '⚠' : '✓'} ${drifts.length} schede ${check ? 'disallineate' : 'riallineate'} (${JSON.stringify(byVariant)})`);
  console.log(`  parole accettate in più:   ${gainedTotal.toLocaleString('it-IT')}`);
  console.log(`  parole accettate in meno:  ${lostTotal.toLocaleString('it-IT')}`);
  for (const d of drifts.slice(0, 15)) {
    const parts: string[] = [];
    if (d.gained.length) parts.push(`+${d.gained.length} [${d.gained.slice(0, 6).join(', ')}${d.gained.length > 6 ? ', …' : ''}]`);
    if (d.lost.length) parts.push(`−${d.lost.length} [${d.lost.slice(0, 6).join(', ')}${d.lost.length > 6 ? ', …' : ''}]`);
    console.log(`    ${d.id} (${d.variant}): ${parts.join('  ')}`);
  }
  if (drifts.length > 15) console.log(`    … e altre ${drifts.length - 15} schede`);
  if (!check) {
    console.log('\n  Ora allinea il bundle offline:  node apps/web/scripts/copy-schede.mjs');
    console.log('  Poi verifica i criteri:         pnpm --filter @boggle/server verify:schede');
  }
}

if (check && drifts.length > 0) process.exit(1);
