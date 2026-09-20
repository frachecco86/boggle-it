// Esecuzione: dalla root, `pnpm test:e2e` (richiede server attivo su :3001).
import { io } from 'socket.io-client';
const URL = 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const log = (...a) => console.log(...a);

const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });
await Promise.all([once(a, 'connect'), once(b, 'connect')]);

const events = { roundEnd: [], gameEnd: [], playerWord: [] };
a.on('game:roundEnd', (p) => events.roundEnd.push(p));
a.on('game:gameEnd', (p) => events.gameEnd.push(p));
a.on('game:playerWord', (p) => events.playerWord.push(p));

const created = await ack(a, 'room:create', { nickname: 'Alice', gridSize: 4, difficulty: 'normale', rounds: 2, roundDurationMs: 5000 });
const code = created.roomCode;
const aliceId = created.playerId;
await ack(b, 'room:join', { code, nickname: 'Bob' });
log('stanza', code, 'creata con Alice + Bob');

// round 1
const rs1 = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round1 = await rs1;
log('round 1 avviato, tiles =', round1.grid.tiles.length, 'endsAt in', Math.round((round1.endsAt - Date.now())/1000)+'s');

// submit di una parola valida
const dict = new Set((await (await fetch(URL + '/dictionary/words.txt')).text()).split('\n'));
const size = round1.grid.size;
const letters = round1.grid.tiles.map((t) => t.letter);
const val = (i) => (letters[i] === 'q' ? 'qu' : letters[i]);
const adj = (x,y) => Math.max(Math.abs(Math.floor(x/size)-Math.floor(y/size)), Math.abs((x%size)-(y%size)))===1;
const found = [];
const dfs = (path, w) => { if (w.length>=3 && dict.has(w)) found.push({word:w,path:[...path]}); if (w.length>=5) return; const l=path[path.length-1]; for (let i=0;i<letters.length;i++){ if(path.includes(i))continue; if(l!==undefined&&!adj(l,i))continue; path.push(i);dfs(path,w+val(i));path.pop(); } };
for (let i=0;i<letters.length;i++) dfs([i], val(i));
const pick = found.find((f)=>f.word.length===3) ?? found[0];
const sub = await ack(a, 'game:submitWord', { word: pick.word, path: pick.path });
log('Alice trova', pick.word, '->', JSON.stringify(sub));

// attesa fine round 1 (5s) + pausa
log('attendo fine round 1...');
while (events.roundEnd.length < 1) await wait(300);
const re1 = events.roundEnd[0];
log('roundEnd 1: parole Alice =', re1.results.find(r=>r.playerId===aliceId)?.words, '| mancate =', re1.missedWords.length);

// round 2: host avvia dal roundEnd
await wait(200);
const rs2 = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round2 = await rs2;
log('round 2 avviato, griglia diversa =', JSON.stringify(round2.grid.tiles.map(t=>t.letter)) !== JSON.stringify(round1.grid.tiles.map(t=>t.letter)));

// attendi gameEnd
while (events.gameEnd.length < 1) await wait(300);
log('GAME END. finalScores =', JSON.stringify(events.gameEnd[0].finalScores.map(s=>({n:s.nickname,total:s.totalScore}))));

// test riconnessione a partita in corso/finita
const reconnect = await ack(b, 'room:join', { code, nickname: 'Bob', playerId: undefined });
log('Bob tenta rejoin senza id (gameStarted):', JSON.stringify(reconnect));

a.close(); b.close();
process.exit(0);
