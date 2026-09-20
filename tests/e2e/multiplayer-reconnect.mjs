// Esecuzione: dalla root, `pnpm test:e2e` (richiede server attivo su :3001).
import { io } from 'socket.io-client';
const URL = 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const log = (...a) => console.log(...a);

const a = io(URL, { transports: ['websocket'] });
await once(a, 'connect');
const created = await ack(a, 'room:create', { nickname: 'Alice', gridSize: 4, rounds: 3 });
const { roomCode: code, playerId } = created;
log('stanza', code);

const b = io(URL, { transports: ['websocket'] });
await once(b, 'connect');
const bj = await ack(b, 'room:join', { code, nickname: 'Bob' });
log('Bob entra:', bj.ok);

// avvia partita
const rs = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round = await rs;
log('round avviato. Bob si disconnette e riconnette...');

const bobSocket = b.id;
// Buffer degli aggiornamenti: registrato PRIMA della disconnessione per non perdere l'evento.
const updates = [];
a.on('room:update', (s) => updates.push(s));
b.close();
await wait(700);
const last = updates.at(-1);
log('Alice vede Bob offline:', last?.players.find((p) => p.nickname === 'Bob')?.connected === false);

// riconnessione con playerId
const b2 = io(URL, { transports: ['websocket'] });
await once(b2, 'connect');
const gridPromise = once(b2, 'game:roundStart');
const rj = await ack(b2, 'room:join', { code, nickname: 'Bob', playerId: bj.playerId });
log('Bob riconnesso a partita in corso:', rj.ok, '| stesso id =', rj.playerId === bj.playerId);

// deve ricevere la griglia (game:roundStart reinviato)
const regrid = await Promise.race([gridPromise, wait(4000).then(() => null)]);
log('Bob riceve di nuovo la griglia:', regrid ? `sì (${regrid.grid.tiles.length} tile, endsAt ${Math.round((regrid.endsAt - Date.now())/1000)}s)` : 'NO');
log('stessa griglia di Alice:', regrid ? JSON.stringify(regrid.grid.tiles.map(t=>t.letter)) === JSON.stringify(round.grid.tiles.map(t=>t.letter)) : 'n/a');

// nuovo giocatore non deve entrare a partita iniziata
const c = io(URL, { transports: ['websocket'] });
await once(c, 'connect');
const cj = await ack(c, 'room:join', { code, nickname: 'Eve' });
log('Nuovo giocatore a partita iniziata:', JSON.stringify(cj));

a.close(); b2.close(); c.close();
process.exit(0);
