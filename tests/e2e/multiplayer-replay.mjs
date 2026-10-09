// Esecuzione: dalla root, `pnpm test:e2e` (richiede server attivo su :3001).
//
// Rigocare nella STESSA stanza (0.49.0). Copre le tre cose che si potevano
// rompere:
//  1. «Gioca ancora»: la partita nuova ha lo STESSO codice stanza, gli STESSI
//     giocatori, i punteggi a zero e una scheda MAI vista in quella stanza;
//  2. chi arriva quando la partita non è più raggiungibile entra e si siede
//     (aspetta), senza griglia e senza classifiche, e gioca la partita dopo;
//  3. «Chiudi la stanza»: l'host la spegne per tutti, e solo fra una partita e
//     l'altra.
//
// I tempi sono pilotati DAGLI EVENTI, non da `sleep` lunghi: la stanza accetta
// round da 5 secondi (il minimo, vedi `clampDuration`), ma il countdown di
// inizio round e la pausa di fine round (10s) non si possono accorciare, quindi
// aspettare a occhi chiusi vuol dire o perdere l'evento o aspettare un minuto.
import { io } from 'socket.io-client';

const URL = 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const log = (...a) => console.log(...a);

let failed = 0;
function check(label, ok, extra = '') {
  log(`${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
}

/**
 * Prima parola componibile sulla griglia, trovata con una DFS corta (la stessa
 * tecnica degli altri smoke test: qui interessa la parola, non il dizionario).
 */
function findWord(grid, dict) {
  const size = grid.size;
  const letters = grid.tiles.map((t) => t.letter);
  const val = (i) => (letters[i] === 'q' ? 'qu' : letters[i]);
  const adj = (x, y) =>
    Math.max(Math.abs(Math.floor(x / size) - Math.floor(y / size)), Math.abs((x % size) - (y % size))) === 1;
  let found = null;
  const dfs = (path, w) => {
    if (found) return;
    if (w.length >= 3 && dict.has(w)) {
      found = { word: w, path: [...path] };
      return;
    }
    if (w.length >= 6) return;
    const last = path[path.length - 1];
    for (let i = 0; i < letters.length; i++) {
      if (path.includes(i)) continue;
      if (last !== undefined && !adj(last, i)) continue;
      path.push(i);
      dfs(path, w + val(i));
      path.pop();
    }
  };
  for (let i = 0; i < letters.length && !found; i++) dfs([i], val(i));
  return found;
}

const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });
const c = io(URL, { transports: ['websocket'] });
const d = io(URL, { transports: ['websocket'] });
await Promise.all([a, b, c, d].map((s) => once(s, 'connect')));

const dict = new Set((await (await fetch(URL + '/dictionary/words.txt')).text()).split('\n'));

// Raccolta eventi per socket: serve anche a verificare chi NON riceve niente.
const seen = { a: [], b: [], c: [], d: [] };
for (const [key, socket] of [['a', a], ['b', b], ['c', c], ['d', d]]) {
  for (const ev of ['game:roundStart', 'game:roundEnd', 'game:gameEnd', 'room:newGame', 'room:closed']) {
    socket.on(ev, (p) => seen[key].push({ ev, p }));
  }
}
const count = (key, ev) => seen[key].filter((x) => x.ev === ev).length;
const lastOf = (key, ev) => [...seen[key]].reverse().find((x) => x.ev === ev);
/** Si ferma quando `key` ha visto `n` eventi `ev` (o dopo `ms`). */
async function waitCount(key, ev, n, ms = 25_000) {
  const start = Date.now();
  while (count(key, ev) < n && Date.now() - start < ms) await wait(100);
  return count(key, ev) >= n;
}

/* ------------------------------------------------------------------ */
/* Partita 1: un solo round, Alice host e Bob in stanza                */
/* ------------------------------------------------------------------ */
const created = await ack(a, 'room:create', {
  nickname: 'Alice',
  gridSize: 4,
  difficulty: 'normale',
  rounds: 1,
  roundDurationMs: 5000,
});
const code = created.roomCode;
await ack(b, 'room:join', { code, nickname: 'Bob' });
log('stanza', code, '— partita 1 con Alice e Bob');

const rs1 = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round1 = await rs1;
const firstScheda = round1.schedaId;
check('partita 1: round in corso con una scheda', !!firstScheda, `scheda ${firstScheda}`);

const word1 = findWord(round1.grid, dict);
if (word1) {
  const res = await ack(a, 'game:submitWord', word1);
  check('partita 1: la parola di Alice vale', res.accepted === true, `${word1.word} = ${res.points}`);
}

check('partita 1: round chiuso', await waitCount('a', 'game:roundEnd', 1));

/* ------------------------------------------------------------------ */
/* Carla arriva adesso: la partita è conclusa, quindi ENTRA e si siede */
/* ------------------------------------------------------------------ */
const joinedLate = await ack(c, 'room:join', { code, nickname: 'Carla' });
const carlaId = joinedLate.playerId;
const carlaLate = joinedLate.state?.players.find((p) => p.id === carlaId);
check(
  'Carla entra a partita conclusa (non le si dice più «finita»)',
  joinedLate.ok === true && carlaLate?.waiting === true,
  JSON.stringify({ ok: joinedLate.ok, waiting: carlaLate?.waiting }),
);
check('Carla vede la stanza con tre giocatori', (joinedLate.state?.players.length ?? 0) === 3);

check('Alice riceve la classifica finale', await waitCount('a', 'game:gameEnd', 1));
check(
  'Carla NON riceve eventi di una partita che non gioca',
  count('c', 'game:roundEnd') === 0 && count('c', 'game:gameEnd') === 0,
  `gameEnd visti da Carla = ${count('c', 'game:gameEnd')}`,
);
const finalScores = lastOf('a', 'game:gameEnd')?.p.finalScores ?? [];
check(
  'la classifica finale è di due giocatori, non tre',
  finalScores.length === 2 && finalScores.every((f) => f.playerId !== carlaId),
  finalScores.map((f) => `${f.nickname}:${f.totalScore}`).join(' '),
);

/* ------------------------------------------------------------------ */
/* «Gioca ancora»: stessa stanza, partita 2                            */
/* ------------------------------------------------------------------ */
const newGame = await ack(a, 'room:newGame', { code });
check('l\'host avvia una nuova partita', newGame.ok === true, JSON.stringify(newGame));
check(
  'stesso codice stanza e partita numero 2',
  newGame.state?.code === code && newGame.state?.matchNumber === 2,
  `stato: ${newGame.state?.code} #${newGame.state?.matchNumber}`,
);
check(
  'tutti e tre sono di nuovo a 0 punti',
  (newGame.state?.players ?? []).length === 3 && (newGame.state?.players ?? []).every((p) => p.score === 0),
);
check(
  'Carla non aspetta più: gioca la partita 2',
  newGame.state?.players.find((p) => p.id === carlaId)?.waiting === undefined,
);
check(
  'l\'evento arriva anche a chi non ha premuto il tasto',
  (await waitCount('b', 'room:newGame', 1)) && (await waitCount('c', 'room:newGame', 1)),
);

/*
 * L'host cambia le impostazioni FRA una partita e l'altra (2 round invece di
 * 1): prima della 0.49.0 era impossibile, la stanza era già morta. Serve anche
 * da premessa alla verifica successiva — Dario arriverà al round 2.
 */
// Si collected gli aggiornamenti di Bob e si aspetta QUELLO con i round nuovi:
// `room:update` porta lo stato direttamente (non dentro `state`) e fra la
// partenza della partita 2 e la config ne arrivano altri, quindi prendere il
// primo al volo vorrebbe dire spesso leggere quello sbagliato.
const updates = [];
const onUpd = (st) => updates.push(st);
b.on('room:update', onUpd);
a.emit('room:config', { code, gridSize: 4, difficulty: 'normale', rounds: 2, roundDurationMs: 5000 });
let configured = false;
{
  const start = Date.now();
  while (!configured && Date.now() - start < 5000) {
    configured = updates.some((st) => st?.rounds === 2 && st?.phase === 'lobby');
    if (!configured) await wait(100);
  }
}
b.off('room:update', onUpd);
check(
  'l\'host può cambiare impostazioni fra una partita e l\'altra',
  configured,
  updates.map((st) => `rounds=${st?.rounds}/${st?.phase}`).join(' '),
);

seen.a.length = 0;
seen.c.length = 0;
const rs2 = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round2 = await rs2;
check(
  'partita 2: scheda MAI vista in questa stanza',
  !!round2.schedaId && round2.schedaId !== firstScheda,
  `${firstScheda} -> ${round2.schedaId}`,
);
check('anche Carla riceve la griglia, adesso gioca', await waitCount('c', 'game:roundStart', 1));

const word2 = findWord(round2.grid, dict);
const carlaPlays = word2 ? await ack(c, 'game:submitWord', word2) : { accepted: false };
check('Carla può inviare parole nella partita nuova', carlaPlays.accepted === true, JSON.stringify(carlaPlays));

/* ------------------------------------------------------------------ */
/* Dario arriva al round 2: troppo tardi, si siede                     */
/* ------------------------------------------------------------------ */
check('round 1 della partita 2 chiuso', await waitCount('a', 'game:roundEnd', 1));
seen.d.length = 0;
const rs3 = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round3 = await rs3;

const joinedRunning = await ack(d, 'room:join', { code, nickname: 'Dario' });
const darioId = joinedRunning.playerId;
check(
  'Dario entra a round 2 in corso ma si siede in attesa',
  joinedRunning.ok === true &&
    joinedRunning.state?.players.find((p) => p.id === darioId)?.waiting === true,
);
// Se qualcuno gli inviasse la griglia lo si vedrebbe: si aspetta il tempo di
// un giro di eventi, poi si verifica il silenzio.
await wait(600);
check('Dario non ha ricevuto la griglia del round', count('d', 'game:roundStart') === 0);
const word3 = findWord(round3.grid, dict);
const darioPlays = word3 ? await ack(d, 'game:submitWord', word3) : { accepted: false, reason: '' };
check(
  'a Dario le parole non sono accettate (è in attesa)',
  darioPlays.accepted === false && /attesa/i.test(darioPlays.reason ?? ''),
  darioPlays.reason ?? '',
);

// Chiudere una stanza mentre gira un round no, non si fa.
const closeDuring = await ack(a, 'room:close', { code });
check(
  'in pieno round la stanza non si può chiudere',
  closeDuring.ok !== true && closeDuring.code === 'GAME_RUNNING',
  JSON.stringify(closeDuring),
);

check('la partita 2 si chiude per chi ha giocato', await waitCount('a', 'game:roundEnd', 2));
check('Dario resta fuori dai risultati', count('d', 'game:roundEnd') === 0);

/* ------------------------------------------------------------------ */
/* «Chiudi la stanza»: vale per tutti                                  */
/* ------------------------------------------------------------------ */
const closed = await ack(a, 'room:close', { code });
check('fra una partita e l\'altra la stanza si chiude', closed.ok === true, JSON.stringify(closed));
check(
  'l\'avviso di stanza chiusa arriva a tutti',
  (await waitCount('b', 'room:closed', 1)) && (await waitCount('c', 'room:closed', 1)),
);
const stranger = io(URL, { transports: ['websocket'] });
await once(stranger, 'connect');
const afterClose = await ack(stranger, 'room:join', { code, nickname: 'Tardi' });
check('dopo, il codice non entra più da nessuna parte', afterClose.code === 'ROOM_NOT_FOUND');
stranger.close();
for (const s of [a, b, c, d]) s.close();

log(failed === 0 ? '\n✓ Rigocare nella stessa stanza: tutto apposto' : `\n✗ ${failed} verifiche fallite`);
process.exit(failed === 0 ? 0 : 1);
