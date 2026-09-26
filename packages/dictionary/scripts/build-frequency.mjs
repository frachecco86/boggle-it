// Costruisce `data/frequency-it.txt`: le N parole italiane PIU' FREQUENTI che
// sono anche giocabili (presenti in `words.br`), in ordine di frequenza.
//
// Uso: node scripts/build-frequency.mjs [--n 60000]
//
// PERCHE' SERVE
// L'algoritmo di generazione delle schede usa tre dizionari per fascia
// (5k / 20k / 60k parole piu' frequenti): servono parole ORDINATE per frequenza
// d'uso, non in ordine alfabetico. La lista gia' in repo
// (`60000_parole_italiane.txt`, napolux) e' alfabetica, quindi non si puo'
// ritagliare a fasce: da li' non si sa quali siano le 5.000 piu' usate.
//
// FONTE: FrequencyWords (hermitdave), corpus OpenSubtitles 2018, licenza
// CC BY-SA 4.0 — ogni riga e' `parola conteggio`, dalla piu' frequente.
//   https://github.com/hermitdave/FrequencyWords
//
// Il file grezzo (~9,7 MB) NON e' versionato: si scarica con
//   pnpm --filter @boggle/dictionary fetch
// mentre l'output di questo script (~500 KB, 60k parole) E' versionato, cosi'
// la generazione delle schede e' riproducibile senza rete.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');

const RAW = path.join(DATA, 'frequency-it.raw.txt');
const OUT = path.join(DATA, 'frequency-it.txt');
const WORDS_BR = path.join(DATA, 'words.br');
const WORDS_TXT = path.join(DATA, 'words.txt');

const MIN_LEN = 3;
const MAX_LEN = 16;

/** Stessa normalizzazione di `build-words.mjs` (deve combaciare con words.br). */
function normalizeWord(raw) {
  return raw
    .toLowerCase()
    .replace(/[àáâä]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z]/g, '');
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = process.argv[i + 1];
  return value && !value.startsWith('--') ? value : fallback;
}

/**
 * Dizionario giocabile: `words.txt` se presente (piu' veloce), altrimenti
 * `words.br` decompresso. Le fasce devono contenere SOLO parole giocabili,
 * altrimenti la banda conterebbe parole che il gioco non accetta.
 */
async function loadPlayable() {
  if (existsSync(WORDS_TXT)) {
    const text = await readFile(WORDS_TXT, 'utf8');
    return new Set(text.split('\n').filter(Boolean));
  }
  if (!existsSync(WORDS_BR)) {
    throw new Error('Manca words.br (e words.txt): rigenera il dizionario con `pnpm --filter @boggle/dictionary build:full`');
  }
  const text = brotliDecompressSync(await readFile(WORDS_BR)).toString('utf8');
  return new Set(text.split('\n').filter(Boolean));
}

async function main() {
  const limit = Number(arg('n', '60000'));
  if (!existsSync(RAW)) {
    throw new Error(
      `Manca ${path.relative(process.cwd(), RAW)}: scaricalo con \`pnpm --filter @boggle/dictionary fetch\``,
    );
  }

  const playable = await loadPlayable();
  const raw = await readFile(RAW, 'utf8');

  const seen = new Set();
  const kept = [];
  let skippedShort = 0;
  let skippedUnknown = 0;
  let skippedDuplicate = 0;

  for (const line of raw.split('\n')) {
    if (!line) continue;
    // Formato: `parola conteggio` (il conteggio puo' mancare).
    const [rawWord] = line.trim().split(/\s+/);
    if (!rawWord) continue;
    const word = normalizeWord(rawWord);
    if (word.length < MIN_LEN || word.length > MAX_LEN) {
      skippedShort++;
      continue;
    }
    if (seen.has(word)) {
      skippedDuplicate++;
      continue;
    }
    seen.add(word);
    if (!playable.has(word)) {
      skippedUnknown++;
      continue;
    }
    kept.push(word);
    if (kept.length >= limit) break;
  }

  if (kept.length < limit) {
    throw new Error(`Trovate solo ${kept.length} parole giocabili su ${limit} richieste`);
  }

  await writeFile(OUT, kept.join('\n') + '\n');
  const { size } = await stat(OUT);
  console.log(`✓ ${path.relative(process.cwd(), OUT)}: ${kept.length.toLocaleString('it-IT')} parole (${(size / 1024).toFixed(0)} KB)`);
  console.log(`  prime 10: ${kept.slice(0, 10).join(', ')}`);
  console.log(`  scartate: ${skippedShort} fuori lunghezza, ${skippedUnknown} non giocabili, ${skippedDuplicate} duplicate`);
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
