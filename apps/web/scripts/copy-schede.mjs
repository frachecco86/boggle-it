// Copia le schede di base nella cartella pubblica del web, cosi' l'app Android
// (Capacitor) può giocare in single player SENZA rete: le schede viaggiano nel
// bundle invece di essere chieste al server.
//
// Genera anche un indice minimo (`index.json`) con conteggi e id, per il
// selettore della pagina scheda offline.
//
// Uso: node scripts/copy-schede.mjs
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'packages/shared/schede');
const OUT = path.resolve(__dirname, '../public/bundled-schede');

if (!existsSync(SRC)) {
  console.error(`✗ Schede non trovate in ${SRC}`);
  console.error('  Generale con: pnpm gen:schede');
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const byKey = {};
const ids = {};
let total = 0;

for (const file of (await readdir(SRC)).filter((f) => f.endsWith('.json')).sort()) {
  const raw = await readFile(path.join(SRC, file), 'utf8');
  const parsed = JSON.parse(raw);
  await writeFile(path.join(OUT, file), raw);
  const key = `${parsed.size}-${parsed.difficulty}`;
  byKey[key] = (byKey[key] ?? 0) + parsed.schede.length;
  ids[key] = parsed.schede.map((s) => s.id);
  total += parsed.schede.length;
}

for (const key of Object.keys(ids)) ids[key].sort();

await writeFile(
  path.join(OUT, 'index.json'),
  JSON.stringify({ total, byKey, bySize: {}, ids }, null, 2) + '\n',
);

console.log(`✓ ${total} schede copiate in apps/web/public/bundled-schede/`);
