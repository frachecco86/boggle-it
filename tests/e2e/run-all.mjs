// Esegue gli smoke test end-to-end del multiplayer (richiede il server su :3001).
// Uso: pnpm test:e2e
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3001';

async function serverAlive() {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const alive = await serverAlive();
if (!alive) {
  console.error(`✗ Server non raggiungibile su ${SERVER_URL}.`);
  console.error('  Avvia prima il server: pnpm dev:server');
  process.exit(1);
}
console.log(`✓ Server attivo su ${SERVER_URL}\n`);

const suites = [
  'multiplayer-basic.mjs',
  'multiplayer-fullgame.mjs',
  'multiplayer-reconnect.mjs',
  'multiplayer-rejoin.mjs',
  'opponent-privacy.mjs',
  'voice.mjs',
];
let failed = 0;
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const code = await run(suite);
  if (code !== 0) failed++;
}
console.log(failed === 0 ? '\n✓ Tutti gli smoke test passati' : `\n✗ ${failed} suite fallite`);
process.exit(failed === 0 ? 0 : 1);
