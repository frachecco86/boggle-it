// Copia il dizionario generato nella cartella pubblica del web,
// cosi' Netlify (o qualsiasi CDN) puo' servirlo senza passare dal server.
//
// Uso: node scripts/prepare-public.mjs
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICT_DIR = path.resolve(__dirname, '../../../packages/dictionary/data');
const PUBLIC_DIR = path.resolve(__dirname, '../public/dictionary');

// Solo words.txt: Netlify/CDN lo comprimono automaticamente (Brotli) in transito.
// words.br NON va copiato: il browser non puo' decomprimere brotli senza header
// (DecompressionStream supporta solo gzip/deflate), quindi sarebbe inutile.
const FILES = ['words.txt'];

await mkdir(PUBLIC_DIR, { recursive: true });

let copied = 0;
for (const file of FILES) {
  const src = path.join(DICT_DIR, file);
  if (!existsSync(src)) {
    console.warn(`⚠ ${file} non trovato in packages/dictionary/data/`);
    continue;
  }
  await copyFile(src, path.join(PUBLIC_DIR, file));
  const { size } = await stat(src);
  console.log(`✓ ${file} → public/dictionary/ (${(size / 1024).toFixed(0)} KB)`);
  copied++;
}

if (copied === 0) {
  console.error('✗ Nessun file copiato. Esegui prima: pnpm --filter @boggle/dictionary build:full');
  process.exit(1);
}
