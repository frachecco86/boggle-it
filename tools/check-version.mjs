// Verifica che la versione dell'app sia avanzata come richiesto.
//
// REGOLA: ogni commit porta la versione almeno +0.1, cioè fa avanzare il MINOR
// di almeno un passo (0.41.0 → 0.42.0). I salti di sola patch (0.41.1) non
// contano: la versione deve essere leggibile come "una release in più", e ogni
// release è una voce della pagina Novità.
//
// In più, la versione corrente deve avere la sua voce in `RELEASES` (niente
// numero nuovo senza changelog).
//
// Uso: node tools/check-version.mjs [--base <ref>] [--file <percorso>] [--allow-patch]
//   --base   con cosa confrontarsi (default: origin/master se esiste, altrimenti HEAD~1)
//   --base-version  confronta con questa versione, senza passare da git (utile in CI senza storia)
//   --file   file della versione (default: apps/web/src/version.ts) — utile per i test
//   --allow-patch  accetta anche un salto di sola patch
//
// Esce con codice 1 se la regola non è rispettata.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILE = 'apps/web/src/version.ts';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const FILE = arg('file', DEFAULT_FILE);
const FILE_PATH = path.isAbsolute(FILE) ? FILE : path.join(ROOT, FILE);
const BASE_VERSION = arg('base-version', null);
const ALLOW_PATCH = hasFlag('allow-patch');

/** `0.41.0` → { major, minor, patch } */
function parseVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Versione e numero di voci di changelog da un sorgente di `version.ts`. */
function readVersionFile(text) {
  const version = /APP_VERSION\s*=\s*'([^']+)'/.exec(text)?.[1];
  const releases = [...text.matchAll(/^\s{4}version: '([^']+)'/gm)].map((m) => m[1]);
  return { version, releases };
}

/** Il sorgente di `version.ts` in un ref git, o null se non c'è. */
function readFromGit(ref) {
  try {
    return execFileSync('git', ['show', `${ref}:${FILE}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function refExists(ref) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const baseRef = arg('base', null) ?? (refExists('origin/master') ? 'origin/master' : 'HEAD~1');

let currentText;
try {
  currentText = readFileSync(FILE_PATH, 'utf8');
} catch {
  console.error(`✗ ${FILE} non trovato: lo script va lanciato dalla root del repo.`);
  process.exit(1);
}

const current = readVersionFile(currentText);
const currentParsed = parseVersion(current.version);
if (!current.version || !currentParsed) {
  console.error(`✗ APP_VERSION mancante o non valida in ${FILE}`);
  process.exit(1);
}

const problems = [];

// La versione corrente deve avere la sua voce di changelog, come prima voce.
if (current.releases[0] !== current.version) {
  problems.push(
    `la versione ${current.version} non ha la sua voce in RELEASES ` +
      `(prima voce: ${current.releases[0] ?? 'nessuna'}) — aggiungi la release, non solo il numero`,
  );
}

const baseText = BASE_VERSION ? null : readFromGit(baseRef);
const base = BASE_VERSION ? { version: BASE_VERSION } : baseText ? readVersionFile(baseText) : null;
const baseParsed = base ? parseVersion(base.version) : null;

console.log(`versione corrente  ${current.version}`);
console.log(
  `confronto con      ${BASE_VERSION ? `--base-version (${BASE_VERSION})` : baseRef}` +
    `${baseParsed ? ` → ${base.version}` : ' — non disponibile'}`,
);

if (!baseParsed) {
  console.log('· riferimento non disponibile: salto il confronto (probabile primo commit o repo shallow)');
} else {
  const minorDelta = (currentParsed.minor - baseParsed.minor) + (currentParsed.major - baseParsed.major) * 1000;
  const isNewer =
    currentParsed.major > baseParsed.major ||
    (currentParsed.major === baseParsed.major &&
      (currentParsed.minor > baseParsed.minor ||
        (currentParsed.minor === baseParsed.minor && currentParsed.patch > baseParsed.patch)));

  if (!isNewer) {
    problems.push(`la versione non è avanzata: ${base.version} → ${current.version}`);
  } else if (minorDelta < 1 && !ALLOW_PATCH) {
    problems.push(
      `salto troppo piccolo: ${base.version} → ${current.version} è un salto di sola patch, ` +
        'la regola è almeno +0.1 (minor avanti di uno)',
    );
  } else {
    console.log(`✓ versione avanzata di ${minorDelta >= 1 ? `+0.${minorDelta}` : 'una patch (--allow-patch)'}`);
  }
}

if (problems.length > 0) {
  console.error('\n✗ Versione non conforme:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nCome si sistema: in ${FILE} porta APP_VERSION almeno al minor successivo ` +
      '(es. 0.41.0 → 0.42.0) e aggiungi la voce in RELEASES con data, titolo e changes.',
  );
  process.exit(1);
}

console.log('✓ versione ok');
