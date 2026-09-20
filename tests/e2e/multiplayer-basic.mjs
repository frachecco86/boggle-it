// Esecuzione: dalla root, `pnpm test:e2e` (richiede server attivo su :3001).
import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';
const log = (...a) => console.log(...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });

const once = (sock, ev) => new Promise((res) => sock.once(ev, res));
const emitAck = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));

await Promise.all([once(a, 'connect'), once(b, 'connect')]);
log('✓ connessi');

const created = await emitAck(a, 'room:create', { nickname: 'Alice', gridSize: 4, rounds: 2 });
log('create:', created.ok, 'code=', created.roomCode);
const code = created.roomCode;
const aliceId = created.playerId;

const joined = await emitAck(b, 'room:join', { code, nickname: 'Bob' });
log('join:', joined.ok, 'bobId=', joined.playerId?.slice(0, 8));

// attende configurazione + roundStart
const roundStart = once(a, 'game:roundStart');
const countdowns = [];
a.on('game:countdown', (p) => countdowns.push(p.seconds));
a.emit('room:start', { code });
const rs = await roundStart;
log('roundStart: round=', rs.round, 'tiles=', rs.grid.tiles.length, 'durata=', rs.durationMs);
await wait(100);
log('countdown ricevuti:', countdowns.join(','));

// trova una parola valida sul percorso (griglia condivisa)
const size = rs.grid.size;
const letters = rs.grid.tiles.map((t) => t.letter);
const val = (i) => (letters[i] === 'q' ? 'qu' : letters[i]);
const adj = (x, y) => Math.max(Math.abs(Math.floor(x/size)-Math.floor(y/size)), Math.abs((x%size)-(y%size))) === 1;
const dict = new Set((await (await fetch(URL+'/dictionary/words.txt')).text()).split('\n'));
const found = [];
const dfs = (path, word) => {
  if (word.length >= 3 && dict.has(word)) found.push({ word, path: [...path] });
  if (word.length >= 5 || found.length > 200) return;
  const last = path[path.length-1];
  for (let i = 0; i < letters.length; i++) {
    if (path.includes(i)) continue;
    if (last !== undefined && !adj(last, i)) continue;
    path.push(i); dfs(path, word + val(i)); path.pop();
  }
};
for (let i = 0; i < letters.length; i++) dfs([i], val(i));
log('parole trovate sulla griglia:', found.length);
const pick = found.find((f) => f.word.length === 3) ?? found[0];
log('provo:', pick?.word, 'percorso', pick?.path);

const wordEvent = once(b, 'game:playerWord');
const ack1 = await emitAck(a, 'game:submitWord', { word: pick.word, path: pick.path });
log('Alice submit valido:', JSON.stringify(ack1));
const fed = await wordEvent;
log('Bob riceve live feed:', fed.nickname, fed.word, '+' + fed.points, 'score=' + fed.score);

const ackDup = await emitAck(a, 'game:submitWord', { word: pick.word, path: pick.path });
log('Alice duplicato:', JSON.stringify(ackDup));

const ackCheat = await emitAck(b, 'game:submitWord', { word: 'xyzzy', path: [0,1,2,3,4] });
log('Bob parola inventata/percorso illegale:', JSON.stringify(ackCheat));

const ackInvalidPath = await emitAck(b, 'game:submitWord', { word: val(0)+val(5), path: [0,5] });
log('Bob percorso non adiacente:', JSON.stringify(ackInvalidPath));

// chiusura rapida per test: non aspettiamo i 3 minuti, verifichiamo lo stato
log('\n--- Stato stanza (dopo submit) ---');
const stateA = await new Promise((res) => a.emit('room:join', { code, nickname: 'Alice', playerId: aliceId }, res)); 
log(JSON.stringify(stateA.state ?? stateA, null, 2));

a.close(); b.close();
process.exit(0);
