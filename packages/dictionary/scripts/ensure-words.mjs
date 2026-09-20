// Garantisce che `words.txt` esista, ricavandolo da `words.br` se necessario.
//
// Perche': il build di deploy non deve dipendere dalla rete ne' dalla disponibilita'
// del sito UniBO (che risponde intermittentemente 402). Il repo contiene `words.br`
// (616 KB, derivato da Morph-it! CC BY-SA 2.0): questo script lo decomprime.
//
// Uso: node scripts/ensure-words.mjs [--force]
import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const TXT = path.join(DATA, 'words.txt');
const BR = path.join(DATA, 'words.br');
const force = process.argv.includes('--force');

if (existsSync(TXT) && !force) {
  const { size } = await stat(TXT);
  const lines = (await readFile(TXT, 'utf8')).split('\n').filter(Boolean).length;
  console.log(`✓ words.txt già presente: ${lines.toLocaleString('it-IT')} parole (${(size / 1024).toFixed(0)} KB)`);
  process.exit(0);
}

if (!existsSync(BR)) {
  console.error('✗ Né words.txt né words.br sono presenti in packages/dictionary/data/.');
  console.error('  Rigenera il dizionario con: pnpm --filter @boggle/dictionary build:full');
  process.exit(1);
}

const compressed = await readFile(BR);
const text = brotliDecompressSync(compressed).toString('utf8');
await writeFile(TXT, text);
const lines = text.split('\n').filter(Boolean).length;
console.log(`✓ words.txt ricreato da words.br: ${lines.toLocaleString('it-IT')} parole (${(text.length / 1024).toFixed(0)} KB)`);
