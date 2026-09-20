// Verifica che il contesto di build contenga tutto il necessario.
//
// Perche': il dizionario generato dipende da `words.br` (versionato). Se un
// `.dockerignore` lo esclude, il build Docker/CI fallisce in modo poco chiaro
// ("Né words.txt né words.br sono presenti"). Questo script lo rileva prima.
//
// Uso: node scripts/check-context.mjs   (dalla root del repo)
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'packages/dictionary/data');

const REQUIRED = [
  // words.txt è generato, words.br è la fonte versionata: ne basta una.
  { name: 'words.txt o words.br', anyOf: ['words.txt', 'words.br'] },
  { name: 'abbreviations.txt', anyOf: ['abbreviations.txt'] },
];

const MIN_WORDS_BR_BYTES = 100 * 1024; // il file reale è ~616 KB

const problems = [];

for (const entry of REQUIRED) {
  const found = entry.anyOf.find((f) => existsSync(path.join(DATA, f)));
  if (!found) {
    problems.push(`manca ${entry.name} in packages/dictionary/data/ (escluso dal .dockerignore?)`);
    continue;
  }
  const size = statSync(path.join(DATA, found)).size;
  console.log(`✓ ${found} (${(size / 1024).toFixed(0)} KB)`);
  if (found === 'words.br' && size < MIN_WORDS_BR_BYTES) {
    problems.push(`words.br sembra troncato (${size} byte): atteso > ${MIN_WORDS_BR_BYTES}`);
  }
}

// Controllo specifico: words.br è escluso dal .dockerignore?
const dockerignore = path.join(ROOT, '.dockerignore');
if (existsSync(dockerignore)) {
  const content = await import('node:fs').then((fs) => fs.readFileSync(dockerignore, 'utf8'));
  const excludesWordsBr = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .some((l) => l === 'packages/dictionary/data/words.br' || l === '**/words.br' || l === 'words.br' || l === 'packages/dictionary/data/*');
  if (excludesWordsBr) {
    problems.push(
      ".dockerignore esclude words.br, che è la fonte versionata del dizionario: il build Docker fallirà",
    );
  } else {
    console.log('✓ .dockerignore non esclude words.br');
  }
}

if (problems.length > 0) {
  console.error('\n✗ Contesto di build non valido:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nNota: words.br (616 KB) È versionato proprio per rendere il build offline.');
  process.exit(1);
}

console.log('\n✓ Contesto di build valido');
