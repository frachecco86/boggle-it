// Verifica il canale voce della stanza ("tieni premuto per parlare").
//
// Cosa si controlla, in ordine di importanza:
//  1. i pacchetti di chi parla arrivano a TUTTI GLI ALTRI della stanza;
//  2. NON tornano a chi parla (con le casse accese sarebbe un eco sulla voce);
//  3. chi non ha aperto il canale non può mandare audio (il server lo scarta);
//  4. i limiti tengono: pacchetti malformati scartati, tetto alle voci insieme,
//     posto liberato dal rilascio del tasto e da chi sparisce senza avvisare.
//
// Uso: pnpm test:e2e (richiede il server su :3001).
import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
/** Ack per gli eventi senza dati (es. `voice:start`). */
const ack0 = (s, ev) => new Promise((res) => s.emit(ev, res));
/** Come `ack0`, ma non resta appeso per sempre se il server è caduto. */
const ack0OrTimeout = (s, ev, ms = 2000) =>
  Promise.race([ack0(s, ev), wait(ms).then(() => null)]);

/** Blocco di voce "vero": 1024 campioni Int16 = 2048 byte (64 ms a 16 kHz). */
const chunk = () => new ArrayBuffer(2048);

const failures = [];
function check(ok, label, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

const sockets = [];
function connect() {
  const s = io(URL, { transports: ['websocket'] });
  sockets.push(s);
  return s;
}

const a = connect();
const b = connect();
const c = connect();
const d = connect();
const e = connect();
await Promise.all(sockets.map((s) => once(s, 'connect')));

const created = await ack(a, 'room:create', {
  nickname: 'Alice',
  gridSize: 4,
  difficulty: 'facile',
  rounds: 1,
  roundDurationMs: 30000,
});
const code = created.roomCode;
const ids = { a: created.playerId };
for (const [key, socket] of [
  ['b', b],
  ['c', c],
  ['d', d],
  ['e', e],
]) {
  const joined = await ack(socket, 'room:join', { code, nickname: key.toUpperCase() });
  ids[key] = joined.playerId;
}
console.log(`stanza ${code} con ${sockets.length} giocatori\n`);

// Registra tutto l'audio che ognuno riceve, per controllare mittente e destinatari.
const heard = new Map(sockets.map((s) => [s, []]));
for (const s of sockets) s.on('voice:audio', (p) => heard.get(s).push(p));

/* 1-2. Chi parla viene ascoltato dagli altri, non da sé stesso. */
const startB = await ack0(b, 'voice:start');
check(startB.ok === true, 'B apre il canale voce');
b.emit('voice:chunk', chunk());
await wait(250);

const first = heard.get(a)[0];
check(heard.get(a).length === 1, 'A riceve il pacchetto di B');
check(first?.playerId === ids.b, 'il pacchetto è attribuito a B');
check(first?.data?.byteLength === 2048,
  'il pacchetto arriva intero (2048 byte)', `ricevuti ${first?.data?.byteLength ?? 'null'}`);
check(heard.get(b).length === 0, 'B NON risente la propria voce (niente eco)');
check(heard.get(c).length === 1 && heard.get(d).length === 1 && heard.get(e).length === 1,
  'anche gli altri della stanza ricevono il pacchetto');

/* 3. Chi non ha aperto il canale non trasmette. */
const beforeIntruder = heard.get(a).length;
c.emit('voice:chunk', chunk());
await wait(200);
check(heard.get(a).length === beforeIntruder, 'chi non ha aperto il canale non può mandare audio');

/* 4. Pacchetti malformati scartati. */
const beforeMalformed = heard.get(a).length;
b.emit('voice:chunk', new ArrayBuffer(3)); // non allineato a 16 bit
b.emit('voice:chunk', new ArrayBuffer(4098)); // oltre il tetto (2048)
await wait(200);
check(heard.get(a).length === beforeMalformed, 'pacchetti malformati scartati');

/* 5. Tetto alle voci simultanee: 4 posti. */
const others = await Promise.all([ack0(c, 'voice:start'), ack0(d, 'voice:start'), ack0(e, 'voice:start')]);
check(others.every((r) => r.ok === true), 'altre 3 voci entrano (4 in totale)');
const denied = await ack0(a, 'voice:start');
check(denied.ok !== true, 'la quinta voce viene rifiutata', denied.message ?? '');
check(heard.get(e).length === 1, 'il rifiuto non ha trasmesso nulla');

/* 6. Rilasciare il tasto libera il posto. */
b.emit('voice:stop');
await wait(150);
const afterRelease = await ack0(a, 'voice:start');
check(afterRelease.ok === true, 'dopo il rilascio il posto torna libero');

/* 6b. Un client che emette SENZA callback non deve far cadere il server. */
e.emit('voice:start'); // nessuna callback: qui il server crashava
await wait(200);
const survived = await ack0OrTimeout(d, 'voice:start');
check(survived !== null, 'il server sopravvive a un evento senza callback');

/* 7-8. Anche chi sparisce senza mandare `stop` libera il posto. */
const f = connect();
await once(f, 'connect');
const joinedF = await ack(f, 'room:join', { code, nickname: 'F' });
heard.set(f, []);
f.on('voice:audio', (p) => heard.get(f).push(p));
const deniedF = await ack0(f, 'voice:start');
check(deniedF.ok !== true, 'stanza piena: la nuova voce viene rifiutata');
c.close(); // se ne va senza `voice:stop`
await wait(250);
const afterDrop = await ack0(f, 'voice:start');
check(afterDrop.ok === true, 'chi sparisce senza avvisare libera comunque il posto');

/* 9. A (che ora parla) continua a essere inoltrato agli altri. */
a.emit('voice:chunk', chunk());
await wait(200);
check(typeof joinedF.playerId === 'string' && joinedF.playerId.length > 0, 'il nuovo arrivato ha un id valido');
check(heard.get(a).length === 1, 'chi parla non riceve la propria voce', `ricevuti ${heard.get(a).length}`);
check(heard.get(f).length === 1, 'il nuovo arrivato riceve la voce di A');

for (const s of sockets) s.close();
console.log(
  failures.length === 0
    ? '\n✓ Canale voce: tutti i controlli passati'
    : `\n✗ ${failures.length} controlli falliti`,
);
process.exit(failures.length === 0 ? 0 : 1);
