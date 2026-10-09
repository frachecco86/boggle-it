// Entrare in una stanza la cui partita è già iniziata (round 1).
// Esecuzione: dalla root, `pnpm test:e2e` (richiede il server attivo su :3001).
//
// Copre la regola di `Room.seatForNewPlayer`:
//  - round 1 in corso   → il nuovo giocatore ENTRA e gioca il tempo che resta;
//  - pausa dopo il round 1 → entra e gioca dal round successivo;
//  - dal round 2 in poi → entra lo stesso ma si SIEDE (`waiting`): nessuna
//    griglia, nessuna parola accettata, nessun risultato. La 0.47.0 rispondeva
//    «Partita già iniziata» e costringeva a rifare la stanza; dal 0.49.0 la
//    stanza sopravvive alla partita, quindi chi arriva tardi gioca la prossima
//    (vedi `multiplayer-replay.mjs`);
//  - chi rientra con il SUO playerId entra sempre, anche a round 2.
import { io } from 'socket.io-client';

const URL = process.env.SERVER_URL ?? 'http://localhost:3001';
const log = (...a) => console.log(...a);
const once = (sock, ev) => new Promise((res) => sock.once(ev, res));
/** Un evento con scadenza: se non arriva dice `null` invece di appendere la suite. */
const onceOr = (sock, ev, ms) => Promise.race([once(sock, ev), new Promise((res) => setTimeout(() => res(null), ms))]);
const emitAck = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));
const connect = async () => {
  const s = io(URL, { transports: ['websocket'] });
  await once(s, 'connect');
  return s;
};

let fallite = 0;
const check = (label, ok, extra = '') => {
  log(`${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) fallite++;
};

/**
 * Trova le parole componibili sulla griglia con un DFS (8 direzioni, celle non
 * riutilizzate, `q` = "qu"). Stesso trucco di `multiplayer-basic.mjs`: il client
 * non ha il dizionario, quindi si prende dal server e il percorso lo cerca qui.
 */
function paroleSullaGriglia(grid, dict) {
  const size = grid.size;
  const letters = grid.tiles.map((t) => t.letter);
  const val = (i) => (letters[i] === 'q' ? 'qu' : letters[i]);
  const adj = (x, y) =>
    Math.max(
      Math.abs(Math.floor(x / size) - Math.floor(y / size)),
      Math.abs((x % size) - (y % size)),
    ) === 1;
  const found = [];
  const dfs = (path, word) => {
    if (word.length >= 3 && dict.has(word)) found.push({ word, path: [...path] });
    if (word.length >= 6 || found.length > 300) return;
    const last = path[path.length - 1];
    for (let i = 0; i < letters.length; i++) {
      if (path.includes(i)) continue;
      if (last !== undefined && !adj(last, i)) continue;
      path.push(i);
      dfs(path, word + val(i));
      path.pop();
    }
  };
  for (let i = 0; i < letters.length; i++) dfs([i], val(i));
  return found;
}

// Il dizionario è statico: si scarica prima, così non ruba secondi al round.
const dict = new Set((await (await fetch(`${URL}/dictionary/words.txt`)).text()).split('\n'));
check('dizionario raggiungibile', dict.size > 1000, `${dict.size.toLocaleString('it-IT')} forme`);
if (dict.size <= 1000) {
  log('✗ Serve il dizionario completo (vedi `pnpm test:e2e`).');
  process.exit(1);
}

const alice = await connect();
const created = await emitAck(alice, 'room:create', {
  nickname: 'Alice',
  gridSize: 4,
  difficulty: 'normale',
  rounds: 2,
  roundDurationMs: 12_000,
});
const code = created.roomCode;
check('stanza creata', created.ok === true, code);

const bob = await connect();
check('Bob entra in lobby', (await emitAck(bob, 'room:join', { code, nickname: 'Bob' })).ok === true);

const round2Of = (sock) => new Promise((res) => sock.once('game:roundStart', (p) => res(p.round === 2 ? p : null)));

/* ---------------- round 1: Eva entra a partita corsa ---------------- */

const round1P = once(alice, 'game:roundStart');
alice.emit('room:start', { code });
const round1 = await round1P;
check('round 1 avviato', round1.round === 1, `${round1.grid.tiles.length} celle`);

const eva = await connect();
const evaUpdates = [];
eva.on('room:update', (s) => evaUpdates.push(s));
const evaJoin = await emitAck(eva, 'room:join', { code, nickname: 'Eva' });
check('Eva entra con il round 1 già iniziato', evaJoin.ok === true, `fase = ${evaJoin.state?.phase}`);
check('Eva vede 3 giocatori', evaJoin.state?.players.length === 3, `${evaJoin.state?.players.length}`);

// Senza griglia re-inviata non potrebbe giocare: è il pezzo che prima mancava.
const evaGrid = await onceOr(eva, 'game:roundStart', 2_000);
check('Eva riceve la griglia del round in corso', Boolean(evaGrid));
check(
  'è la STESSA griglia degli altri',
  Boolean(evaGrid) &&
    JSON.stringify(evaGrid.grid.tiles.map((t) => t.letter)) ===
      JSON.stringify(round1.grid.tiles.map((t) => t.letter)),
);
check(
  'e lo STESSO tempo restante',
  Boolean(evaGrid) && Math.abs(evaGrid.endsAt - round1.endsAt) < 50,
  evaGrid ? `${Math.max(0, Math.round((evaGrid.endsAt - Date.now()) / 1000))}s rimaste` : '',
);

// Eva gioca davvero: trova una parola e il server gliela accetta.
const scelta = paroleSullaGriglia(round1.grid, dict).sort((a, b) => a.word.length - b.word.length)[0];
const ackEva = await emitAck(eva, 'game:submitWord', { word: scelta.word, path: scelta.path });
check('Eva trova una parola nel round in corso', ackEva.accepted === true, `${scelta.word} → +${ackEva.points}`);

const agg = evaUpdates.at(-1);
check(
  "Eva è in classifica anche per chi gioca dall'inizio",
  agg?.players.some((p) => p.nickname === 'Eva') === true,
  agg ? agg.players.map((p) => `${p.nickname}:${p.score}`).join('  ') : '',
);

/* --------- pausa dopo il round 1: Grace entra per il round 2 --------- */

const roundEnd = await onceOr(eva, 'game:roundEnd', 20_000);
check('Eva riceve il riepilogo del round 1', roundEnd?.round === 1);
check(
  'il punteggio di Eva è nel riepilogo (parola unica → raddoppiata)',
  roundEnd?.results.find((r) => r.nickname === 'Eva')?.totalScore === ackEva.points * 2,
  roundEnd ? roundEnd.results.map((r) => `${r.nickname}:${r.totalScore}`).join('  ') : '',
);

const grace = await connect();
const graceJoin = await emitAck(grace, 'room:join', { code, nickname: 'Grace' });
check('Grace entra nella pausa dopo il round 1', graceJoin.ok === true, `fase = ${graceJoin.state?.phase}`);

/* ------------- round 2: qui una persona nuova resta fuori ------------- */

const graceGrid = round2Of(grace);
alice.emit('room:start', { code });
const round2 = await onceOr(alice, 'game:roundStart', 15_000);
check('round 2 avviato', round2?.round === 2);
check('Grace riceve la griglia del round 2', Boolean(await graceGrid));

const scelta2 = paroleSullaGriglia(round2.grid, dict).sort((a, b) => a.word.length - b.word.length)[0];
const ackGrace = await emitAck(grace, 'game:submitWord', { word: scelta2.word, path: scelta2.path });
check('Grace gioca il round 2', ackGrace.accepted === true, `${scelta2.word} → +${ackGrace.points}`);

/*
 * Frank arriva quando il round 2 è già partito: la partita non è più
 * raggiungibile, ma la porta non gli si chiude in faccia. Entra, si siede e
 * aspetta la partita successiva — senza griglia e senza punti.
 */
const frankGrids = [];
const frank = await connect();
frank.on('game:roundStart', (p) => frankGrids.push(p));
const frankJoin = await emitAck(frank, 'room:join', { code, nickname: 'Frank' });
check('Frank entra anche durante il round 2', frankJoin.ok === true, JSON.stringify({ ok: frankJoin.ok, code: frankJoin.code }));
check(
  'ma si siede in attesa della prossima partita',
  frankJoin.state?.players.find((p) => p.id === frankJoin.playerId)?.waiting === true,
);
// Se gli avessero re-inviato la griglia lo si vedrebbe: si lascia passare un
// giro di eventi, poi si verifica il silenzio.
await new Promise((r) => setTimeout(r, 600));
check('la griglia del round 2 non gli arriva', frankGrids.length === 0);
const ackFrank = await emitAck(frank, 'game:submitWord', { word: scelta2.word, path: scelta2.path });
check(
  'le sue parole non sono accettate: non sta giocando questo round',
  ackFrank.accepted === false && /attesa/i.test(ackFrank.reason ?? ''),
  ackFrank.reason ?? '',
);

// Il rientro di chi c'era già non è un ingresso nuovo: vale a ogni round.
const evaBackSocket = await connect();
const evaBack = await emitAck(evaBackSocket, 'room:join', { code, nickname: 'Eva', playerId: evaJoin.playerId });
check(
  'Eva rientra anche a round 2 con il suo playerId',
  evaBack.ok === true && evaBack.playerId === evaJoin.playerId,
  evaBack.ok === true ? 'stesso playerId' : JSON.stringify(evaBack),
);

/*
 * Il round 2 è anche l'ultimo: chi era seduto non deve comparire nei risultati
 * di una partita a cui non ha partecipato.
 */
const roundEnd2 = await onceOr(alice, 'game:roundEnd', 20_000);
check('il round 2 si chiude', roundEnd2?.round === 2);
check(
  'Frank è fuori dai risultati',
  (roundEnd2?.results ?? []).every((r) => r.nickname !== 'Frank'),
  roundEnd2 ? roundEnd2.results.map((r) => r.nickname).join('  ') : '',
);

for (const s of [alice, bob, eva, grace, frank, evaBackSocket]) s.close();
log(fallite === 0 ? '\n✓ Ingresso a partita iniziata: regola rispettata' : `\n✗ ${fallite} verifiche fallite`);
process.exit(fallite === 0 ? 0 : 1);
