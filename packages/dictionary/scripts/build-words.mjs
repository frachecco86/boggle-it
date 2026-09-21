// Costruisce data/words.txt (lista ordinata, deduplicata) e data/words.br (brotli).
// Uso: node scripts/build-words.mjs
//
// Fonti:
//  - Morph-it! 0.48 (UniBO)   — forme flesse incl. coniugazioni verbali — CC BY-SA 2.0 / LGPL
//  - paroleitaliane (napolux) — lessico comune per colmare lacune di Morph-it
//  - abbreviazioni.txt        — abbreviazioni da dizionario (Wikizionario, CC BY-SA 3.0)
//
// Regole di normalizzazione:
//  - minuscolo, accenti -> vocale base, rimozione apostrofi/simboli
//  - accettate solo [a-z]{3,16}
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');

const MIN_LEN = 3;
const MAX_LEN = 16;

export function normalizeWord(raw) {
  return raw
    .toLowerCase()
    .replace(/[àáâä]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z]/g, '');
}

const isUsable = (w) => w.length >= MIN_LEN && w.length <= MAX_LEN;

async function findMorphIt() {
  const preferred = path.join(DATA, 'morph-it_048.txt');
  if (existsSync(preferred)) return preferred;
  const entries = await readdir(DATA).catch(() => []);
  const match = entries.find((f) => /^morph-it.*\.txt$/.test(f));
  return match ? path.join(DATA, match) : null;
}

/**
 * Rigenera `words.br` da una lista di parole normalizzate e ordinate.
 */
async function writeOutputs(sorted) {
  const txt = sorted.join('\n') + '\n';
  const wordsTxt = path.join(DATA, 'words.txt');
  const wordsBr = path.join(DATA, 'words.br');
  await writeFile(wordsTxt, txt);
  const br = brotliCompressSync(Buffer.from(txt, 'utf8'), {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: txt.length,
    },
  });
  await writeFile(wordsBr, br);
  return { txt, br };
}

/**
 * Caso offline: le fonti grezze non ci sono, ma `words.txt` esiste.
 * Il dizionario e' gia' generato: normalizziamo e riscriviamo l'output, senza rete.
 * E' il percorso usato nei build di deploy (Netlify, Docker).
 */
async function buildFromExistingWords() {
  const existing = path.join(DATA, 'words.txt');
  const words = new Set();
  for (const line of (await readFile(existing, 'utf8')).split('\n')) {
    const w = normalizeWord(line.trim());
    if (isUsable(w)) words.add(w);
  }
  const sorted = [...words].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const { txt, br } = await writeOutputs(sorted);
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`✓ words.txt  ${sorted.length.toLocaleString('it-IT')} parole  (${kb(txt.length)})  [da lista gia' generata]`);
  console.log(`✓ words.br   ${kb(br.length)}  (ratio ${((br.length / txt.length) * 100).toFixed(1)}%)`);
  console.log('  (fonti grezze assenti: salto il merge. Usa `build:full` per rigenerare da Morph-it!)');
}

async function main() {
  const morphPath = await findMorphIt();

  // Nessuna fonte grezza ma dizionario presente: build offline.
  if (!morphPath) {
    if (existsSync(path.join(DATA, 'words.txt'))) {
      await buildFromExistingWords();
      return;
    }
    throw new Error(
      'Nessuna fonte disponibile. Esegui `pnpm --filter @boggle/dictionary build:full` per scaricare le fonti.',
    );
  }

  const words = new Set();

  /*
   * 1. Morph-it: la prima colonna e' la forma flessa.
   *
   * ATTENZIONE ALL'ENCODING: Morph-it e' in ISO-8859-1 (Latin-1), NON UTF-8.
   * Leggendolo come UTF-8 gli accenti si corrompono e le forme accentate si
   * perdono: mancavano `fruirà`, `città`, `verità` e tutti i futuri in -erà/-irà
   * (2.433 parole). Decodifichiamo esplicitamente come Latin-1.
   */
  const morphRaw = new TextDecoder('latin1').decode(await readFile(morphPath));
  let morphCount = 0;
  for (const line of morphRaw.split('\n')) {
    if (!line) continue;
    const form = line.split('\t')[0];
    if (!form) continue;
    const w = normalizeWord(form);
    if (isUsable(w)) {
      words.add(w);
      morphCount++;
    }
  }

  // 2. paroleitaliane: lessico comune.
  const commonPath = path.join(DATA, '60000_parole_italiane.txt');
  let commonCount = 0;
  if (existsSync(commonPath)) {
    const commonRaw = await readFile(commonPath, 'utf8');
    for (const line of commonRaw.split('\n')) {
      const w = normalizeWord(line.trim());
      if (isUsable(w)) {
        if (!words.has(w)) commonCount++;
        words.add(w);
      }
    }
  } else {
    console.warn('⚠ 60000_parole_italiane.txt assente: salto l\'integrazione');
  }

  /*
   * 3. Composti e neologismi curati.
   *
   * Morph-it analizza `dona` e `la` separatamente, quindi `donala` non esiste
   * come forma unica in nessuna fonte; lo stesso per i neologismi (`googlare`,
   * `taggare`). Queste liste li aggiungono a mano.
   */
  const modernPath = path.join(DATA, 'modern-words.txt');
  let modernCount = 0;
  if (existsSync(modernPath)) {
    const modernRaw = await readFile(modernPath, 'utf8');
    for (const line of modernRaw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const w = normalizeWord(trimmed);
      if (isUsable(w)) {
        if (!words.has(w)) modernCount++;
        words.add(w);
      }
    }
  }

  // 4. Abbreviazioni curate.
  const abbrPath = path.join(DATA, 'abbreviations.txt');
  let abbrCount = 0;
  if (existsSync(abbrPath)) {
    const abbrRaw = await readFile(abbrPath, 'utf8');
    for (const line of abbrRaw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const w = normalizeWord(trimmed);
      if (isUsable(w)) {
        if (!words.has(w)) abbrCount++;
        words.add(w);
      }
    }
  }

  const sorted = [...words].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const { txt, br } = await writeOutputs(sorted);

  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`✓ words.txt  ${sorted.length.toLocaleString('it-IT')} parole  (${kb(txt.length)})`);
  console.log(`✓ words.br   ${kb(br.length)}  (ratio ${((br.length / txt.length) * 100).toFixed(1)}%)`);
  console.log(`  da Morph-it: ${morphCount.toLocaleString('it-IT')}`);
  console.log(`  da comuni:   +${commonCount.toLocaleString('it-IT')}`);
  console.log(`  abbreviazioni: +${abbrCount}`);
  console.log(`  composti e neologismi: +${modernCount}`);
}

// Eseguito direttamente?
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('✗', err.message);
    process.exit(1);
  });
}
