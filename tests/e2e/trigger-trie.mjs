/**
 * Prova minima: un round parte e finisce, e il server manda le parole mancate.
 *
 * Uso: dalla root, con il server attivo su :3001 → `node tests/e2e/trigger-trie.mjs`
 *
 * Nota sulla durata: il server accetta solo durate fra 5 e 180 secondi; un valore
 * fuori intervallo **non viene corretto**, viene sostituito con il default (180 s).
 * Con 4000 ms il round durava tre minuti e questo script restava appeso in
 * silenzio: ora la durata è valida e c'è un limite di tempo esplicito.
 */
import { io } from 'socket.io-client';

const URL = process.env.SERVER_URL ?? 'http://localhost:3001';
const DURATA_ROUND_MS = 5000;
const ATTESA_MASSIMA_MS = 20000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));

// Rete di sicurezza: senza questa, un round che non finisce blocca tutto in silenzio.
const watchdog = setTimeout(() => {
  console.error(`✗ Nessun game:roundEnd entro ${ATTESA_MASSIMA_MS / 1000}s: il round non è finito.`);
  process.exit(1);
}, ATTESA_MASSIMA_MS);

const a = io(URL, { transports: ['websocket'] });
await once(a, 'connect');

const creata = await ack(a, 'room:create', {
  nickname: 'T',
  gridSize: 4,
  difficulty: 'normale',
  rounds: 1,
  roundDurationMs: DURATA_ROUND_MS,
});
console.log(`stanza ${creata.roomCode}, round da ${DURATA_ROUND_MS / 1000}s`);

const attesa = once(a, 'game:roundEnd');
a.emit('room:start', { code: creata.roomCode });
const re = await attesa;

console.log('✓ roundEnd ricevuto');
console.log(`  parole mancate: ${re.missedWords.length}`);
console.log(`  giocatori nel risultato: ${re.results.length}`);
if (!Array.isArray(re.missedWords) || re.results.length < 1) {
  console.error('✗ il risultato del round è incompleto');
  process.exit(1);
}
clearTimeout(watchdog);
a.close();
process.exit(0);
