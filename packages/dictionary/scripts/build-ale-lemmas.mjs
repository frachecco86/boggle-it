/**
 * LEGACY: non più usato dall'algoritmo ale, vedi IMPLEMENTATION.md §1.2.
 *
 * Costruisce `data/ale/lemmas.br`: le radici (forma → lemma) che servivano
 * all'algoritmo "ale" per contare una forma flessa come comune.
 *
 * Dalla metrica ad anelli di frequenza (`rings-v1`) la definizione di "parola
 * comune" basata su NVdB + lemmi è stata **sostituita**: NVdB, `lemmas.br` e
 * Morph-it non entrano più nella pipeline ale. Questo script e i file che
 * produce sono conservati solo come storico e non vanno più rigenerati.
 *
 * PERCHÉ NON SI VERSIONA MORPH-IT: la fonte è `morph-it_048.txt` (19 MB, in
 * ISO-8859-1, gitignored). Serviva SOLO a questa trasformazione: per stabilire se
 * una forma era "comune" bastava sapere quale LEMMA aveva, e un lemma contava solo
 * se era già in `Common` (NVdB ∩ Dict'). Si tenevano unicamente le forme il cui
 * lemma era comune.
 *
 * Uso (storico): node scripts/build-ale-lemmas.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const ALE_DIR = path.join(DATA, 'ale');
const MORPH = path.join(DATA, 'morph-it_048.txt');
const NVDB = path.join(ALE_DIR, 'nvdb.words.txt');
const WORDS = path.join(DATA, 'words.txt');
const OUT = path.join(ALE_DIR, 'lemmas.br');

/** Accenti → lettera base (identico a `foldAccents` in `schedaAle.ts`). */
function foldAccents(raw) {
  return raw
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[çć]/g, 'c')
    .replace(/ñ/g, 'n');
}

/** Pulizia di una voce (identica a `cleanAleWord` in `schedaAle.ts`). */
function clean(raw, minLength = 3) {
  const s = foldAccents(raw.trim());
  if (!/^[a-z]+$/.test(s)) return null;
  if (/q(?!u)/.test(s)) return null;
  if (s.length < minLength) return null;
  return s;
}

if (!existsSync(MORPH)) {
  console.error(`✗ Manca ${MORPH}`);
  console.error('  Scarica le fonti con: pnpm --filter @boggle/dictionary fetch');
  process.exit(1);
}
if (!existsSync(WORDS)) {
  console.error(`✗ Manca ${WORDS}. Rigenera il dizionario oppure esegui ensure-words.`);
  process.exit(1);
}

// `Dict'`: le parole giocabili, normalizzate come le pulisce l'algoritmo ale.
const dictSet = new Set();
for (const line of readFileSync(WORDS, 'utf8').split('\n')) {
  const w = clean(line);
  if (w) dictSet.add(w);
}

// `Common` = NVdB ∩ Dict'.
const common = new Set();
for (const line of readFileSync(NVDB, 'utf8').split('\n')) {
  const w = clean(line);
  if (w && dictSet.has(w)) common.add(w);
}

/*
 * Forma → lemma con la STESSA semantica di `buildAleLemmas` (in `schedaAle.ts`):
 * "prima analisi vince". Va applicata PRIMA del filtro sui lemmi comuni.
 *
 * PERCHÉ l'ordine è importante: se si filtrasse durante la scansione, una forma
 * la cui PRIMA analisi ha un lemma non comune verrebbe associata a un lemma
 * comune incontrato DOPO, risultando comune — mentre l'algoritmo ale, con
 * Morph-it intero, la considererebbe rara. È una divergenza che cambia la
 * calibrazione (verificata: confini di fascia spostati di ~0,03).
 */
const firstLemma = new Map();
const morph = readFileSync(MORPH, 'latin1');
for (const line of morph.split('\n')) {
  const parts = line.split('\t');
  if (parts.length < 2) continue;
  const form = clean(parts[0] ?? '');
  const lemma = clean(parts[1] ?? '');
  if (!form || !lemma || form === lemma) continue;
  if (!firstLemma.has(form)) firstLemma.set(form, lemma);
}

// Poi si tengono solo le forme il cui lemma (il primo) è comune.
const lemmas = new Map();
for (const [form, lemma] of firstLemma) {
  if (common.has(lemma)) lemmas.set(form, lemma);
}

const text = [...lemmas.entries()].map(([form, lemma]) => `${form}\t${lemma}`).join('\n') + '\n';
mkdirSync(ALE_DIR, { recursive: true });
const br = brotliCompressSync(Buffer.from(text, 'utf8'), {
  params: {
    [constants.BROTLI_PARAM_QUALITY]: 11,
    [constants.BROTLI_PARAM_SIZE_HINT]: text.length,
  },
});
writeFileSync(OUT, br);

console.log(`✓ lemmas.br  ${(br.length / 1024).toFixed(0)} KB  (${lemmas.size.toLocaleString('it-IT')} forme, ${(text.length / 1024 / 1024).toFixed(2)} MB non compressi)`);
console.log('  Versiona il file: la generazione ale lo usa al posto di Morph-it.');
