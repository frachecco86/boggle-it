// Verifica che agli avversari NON venga rivelata la parola, ma arrivino punti e lunghezza.
import { io } from 'socket.io-client';
const URL = 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));

const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });
await Promise.all([once(a, 'connect'), once(b, 'connect')]);

const created = await ack(a, 'room:create', {
  nickname: 'Alice', gridSize: 4, difficulty: 'facile', rounds: 1, roundDurationMs: 30000,
});
const code = created.roomCode;
await ack(b, 'room:join', { code, nickname: 'Bob' });

const received = [];
b.on('game:playerWord', (p) => received.push(p));

const rs = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round = await rs;
console.log('round avviato. difficoltà:', created.state.difficulty, '| durata:', round.durationMs, 'ms');

// trova una parola valida
const dict = new Set((await (await fetch(URL + '/dictionary/words.txt')).text()).split('\n'));
const size = round.grid.size;
const letters = round.grid.tiles.map((t) => t.letter);
const val = (i) => (letters[i] === 'q' ? 'qu' : letters[i]);
const adj = (x,y) => Math.max(Math.abs(Math.floor(x/size)-Math.floor(y/size)), Math.abs((x%size)-(y%size)))===1;
const found = [];
const dfs = (path, w) => { if (w.length>=3 && dict.has(w)) found.push({word:w, path:[...path]}); if (w.length>=6) return; const l=path[path.length-1]; for (let i=0;i<letters.length;i++){ if(path.includes(i))continue; if(l!==undefined&&!adj(l,i))continue; path.push(i);dfs(path,w+val(i));path.pop(); } };
for (let i=0;i<letters.length;i++) dfs([i], val(i));

const picks = [found[0], found.find(f=>f.word.length===4), found.find(f=>f.word.length===5)].filter(Boolean);
for (const p of picks) {
  await ack(a, 'game:submitWord', { word: p.word, path: p.path });
  await wait(120);
}
await wait(300);

console.log('\n=== Eventi ricevuti da BOB (avversario) ===');
for (const r of received) {
  console.log(JSON.stringify(r));
}
const leaked = received.filter(r => r.word && r.word.length > 0);
console.log('\nParole trapelate a Bob:', leaked.length === 0 ? 'NESSUNA ✓' : leaked.map(r=>r.word));
console.log('Punti notificati:', received.map(r => r.points).join(', '));
console.log('Lunghezze notificate:', received.map(r => r.wordLength).join(', '));

a.close(); b.close();
process.exit(0);
