// Smoke test della riconnessione TRASPARENTE del socket.
//
// Bug coperto: Socket.IO riconnette da solo con un NUOVO `socket.id`, e il server
// lega stanza/giocatore proprio a quell'id. Dopo una riconnessione il mapping era
// perso e `game:submitWord` rispondeva "Non in una stanza" pur essendo in partita.
//
// Il fix è l'evento `room:rejoin`: il client, appena il socket torna connesso,
// rimanda i dati della stanza e il server ricostruisce il legame. Qui si verifica
// sia per l'host sia per un altro giocatore, perché il mapping è per-socket.
import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

/** Parole valide sulla griglia, distinte, con il loro percorso. */
async function validWords(grid) {
  const dict = new Set((await (await fetch(URL + '/dictionary/words.txt')).text()).split('\n'));
  const size = grid.size;
  const letters = grid.tiles.map((t) => t.letter);
  const val = (i) => (letters[i] === 'q' ? 'qu' : letters[i]);
  const adj = (x, y) =>
    Math.max(Math.abs(Math.floor(x / size) - Math.floor(y / size)), Math.abs((x % size) - (y % size))) === 1;
  const found = [];
  const seen = new Set();
  const dfs = (path, w) => {
    if (w.length >= 3 && dict.has(w) && !seen.has(w)) {
      seen.add(w);
      found.push({ word: w, path: [...path] });
    }
    if (w.length >= 6) return;
    const l = path[path.length - 1];
    for (let i = 0; i < letters.length; i++) {
      if (path.includes(i)) continue;
      if (l !== undefined && !adj(l, i)) continue;
      path.push(i);
      dfs(path, w + val(i));
      path.pop();
    }
  };
  for (let i = 0; i < letters.length; i++) dfs([i], val(i));
  return found;
}

/** Riconnette il socket (nuovo socket.id) e verifica il rientro. */
async function reconnectAndRejoin(sock, code, playerId, label, word) {
  sock.disconnect();
  await wait(400);
  sock.connect();
  await once(sock, 'connect');
  await wait(400);

  // 1) Senza rejoin il server non conosce più il socket: è il bug originale.
  const broken = await ack(sock, 'game:submitWord', { word: word.word, path: word.path });
  check(`${label}: senza rejoin il submit è rifiutato`, !broken.accepted, broken.reason);

  // 2) Con rejoin il legame si ricostruisce.
  const rj = await ack(sock, 'room:rejoin', { code, playerId });
  check(`${label}: room:rejoin accettato`, 'ok' in rj && rj.ok === true, rj.message ?? rj.error ?? '');
  check(`${label}: rejoin riporta lo stesso playerId`, 'ok' in rj && rj.playerId === playerId);

  // 3) Dopo il rejoin il submit torna a funzionare (motivo di gioco, non "non in stanza").
  const after = await ack(sock, 'game:submitWord', { word: word.word, path: word.path });
  check(
    `${label}: il submit dopo il rejoin non dice "Non in una stanza"`,
    !/non in una stanza/i.test(after.reason ?? ''),
    after.accepted ? `+${after.points}` : after.reason,
  );
  return after;
}

const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });
await Promise.all([once(a, 'connect'), once(b, 'connect')]);

const created = await ack(a, 'room:create', {
  nickname: 'Alice',
  gridSize: 4,
  difficulty: 'facile',
  rounds: 1,
  roundDurationMs: 60_000,
});
const code = created.roomCode;
const aliceId = created.playerId;
const joined = await ack(b, 'room:join', { code, nickname: 'Bob' });
const bobId = joined.playerId;
console.log(`stanza ${code}`);

const rs = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round = await rs;
await wait(3500); // attende la fine del countdown 3-2-1

const words = await validWords(round.grid);
check('la griglia ha almeno 4 parole valide', words.length >= 4, `${words.length}`);

// Quattro parole distinte: due per l'host, due per l'altro giocatore.
await reconnectAndRejoin(a, code, aliceId, 'host', words[0]);
await reconnectAndRejoin(b, code, bobId, 'Bob', words[1]);

// Rejoin con un id inesistente: deve essere rifiutato, non creare un fantasma.
const bad = await ack(a, 'room:rejoin', { code, playerId: 'non-esiste' });
check('rejoin con playerId inesistente rifiutato', !('ok' in bad && bad.ok), bad.message ?? bad.error);

// Dopo tutte le riconnessioni la partita continua normalmente.
const final = await ack(a, 'game:submitWord', { word: words[2].word, path: words[2].path });
check('la partita continua dopo i rientri', final.accepted === true, final.accepted ? `+${final.points}` : final.reason);

a.close();
b.close();
console.log(failures === 0 ? '\n✓ Suite riconnessione passata' : `\n✗ ${failures} verifiche fallite`);
process.exit(failures === 0 ? 0 : 1);
