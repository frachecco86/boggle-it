// Scarica le fonti grezze del dizionario in data/.
// Uso: node scripts/fetch-sources.mjs

import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');

const MORPH_IT_URL = 'https://docs.sslmit.unibo.it/lib/exe/fetch.php?media=resources:morph-it.tgz';
const PAROLE_IT_URL =
  'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/60000_parole_italiane.txt';
/*
 * Lista estesa (280k): sostantivi e aggettivi che Morph-it non copre.
 *
 * Perché serve: Morph-it è un analizzatore MORFOLOGICO (391k verbi, 35k
 * sostantivi), quindi nomi comuni come `anta`, `broccoli`, `spinaci` non
 * esistono in nessuna delle altre fonti. Vedi `build-words.mjs` per i dettagli.
 */
const EXTENDED_IT_URL =
  'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/280000_parole_italiane.txt';
/*
 * Volgarità da escludere. Il gioco è per famiglie: la lista pubblica le contiene,
 * quindi vanno filtrate in fase di build (una parola volgare in griglia è
 * visibile a chiunque, non è un'impostazione che si può nascondere).
 */
const BLOCKED_URL =
  'https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane/lista_badwords.txt';

/**
 * Download robusto basato su curl.
 * Il sito UniBO a volte risponde 402 con User-Agent personalizzati: usiamo i default
 * di curl e ritentiamo con backoff.
 */
async function download(url, dest, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await execFileAsync('curl', ['-fsSL', '--retry', '2', '--max-time', '180', '-o', dest, url], {
        maxBuffer: 1024 * 1024,
      });
      const info = await stat(dest);
      if (info.size > 0) return;
      throw new Error('file vuoto');
    } catch (err) {
      lastErr = err;
      const waitMs = 1500 * attempt;
      console.warn(`   tentativo ${attempt}/${retries} fallito, riprovo tra ${waitMs}ms…`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error(`Download fallito ${url}: ${String(lastErr)}`);
}

async function fetchMorphIt() {
  const tgz = path.join(DATA, 'morph-it.tgz');
  console.log('→ Morph-it! …');
  await download(MORPH_IT_URL, tgz);
  await execFileAsync('tar', ['xzf', tgz, '-C', DATA]);
  await rm(tgz, { force: true });
  const { stdout } = await execFileAsync('bash', [
    '-lc',
    `find ${JSON.stringify(DATA)} -name 'morph-it_*.txt' | head -1`,
  ]);
  const found = stdout.trim();
  if (!found) throw new Error('Nessun file morph-it_*.txt trovato nell archivio');
  console.log(`   trovato: ${path.relative(DATA, found)}`);
  return found;
}

async function fetchParole() {
  console.log('→ paroleitaliane (60k) …');
  const dest = path.join(DATA, '60000_parole_italiane.txt');
  await download(PAROLE_IT_URL, dest);
  return dest;
}

async function fetchExtended() {
  console.log('→ paroleitaliane (280k, sostantivi) …');
  const dest = path.join(DATA, '280000_parole_italiane.txt');
  await download(EXTENDED_IT_URL, dest);
  return dest;
}

async function fetchBlocked() {
  console.log('→ paroleitaliane (volgarità da escludere) …');
  const dest = path.join(DATA, 'blocked-words.txt');
  await download(BLOCKED_URL, dest);
  return dest;
}
async function main() {
  await mkdir(DATA, { recursive: true });
  const [morph, parole, extended, blocked] = await Promise.all([
    fetchMorphIt(),
    fetchParole(),
    fetchExtended(),
    fetchBlocked(),
  ]);
  const target = path.join(DATA, 'morph-it_048.txt');
  if (path.resolve(morph) !== path.resolve(target)) {
    await execFileAsync('cp', [morph, target]);
  }
  void parole;
  void extended;
  void blocked;
  await writeFile(
    path.join(DATA, '.sources.json'),
    JSON.stringify(
      {
        morphIt: 'morph-it_048.txt',
        parole: '60000_parole_italiane.txt',
        extended: '280000_parole_italiane.txt',
        blocked: 'blocked-words.txt',
      },
      null,
      2,
    ),
  );
  console.log('✓ Fonti scaricate in data/');
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
