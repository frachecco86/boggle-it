// Esecuzione: dalla root, `pnpm test:e2e` (richiede server attivo su :3001).
//
// Memoria per profilo in MULTIPLAYER (0.50.0). È la prova che la funzionalità
// funziona DAL SERVER, non solo nelle unit test: qui si registrano due profili
// veri, si gioca davvero e si legge lo storico com'è scritto su SQLite.
//
// Le tre cose che blocca:
//  1. la stanza pesa la griglia che NESSUNO dei presenti ha mai visto (le
//     cronologie si UNISCONO: se anche uno solo l'ha vista, non si gioca);
//  2. a round partito la scheda entra nella cronologia di CHI GIOCA (altrimenti
//     una sera di partite in quattro non lascerebbe traccia e il single player
//     riproporrebbe le stesse griglie);
//  3. quando una griglia l'hanno vista tutti non si pesca a caso: vince la SOMMA
//     DEI CONTATORI più bassa — «vista di meno» non è «vista da meno persone».
//
// I profili vengono preparati dall'API stessa (`POST /me/played-schede`, che è
// la rotta con cui il single player segna le partite), quindi il test non ha
// bisogno di toccare il database.
import { io } from 'socket.io-client';

const URL = process.env.SERVER_URL ?? 'http://localhost:3001';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((res) => s.once(ev, res));
const ack = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const log = (...a) => console.log(...a);

let failed = 0;
function check(label, ok, extra = '') {
  log(`${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failed++;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(URL + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

/** Nickname unici a ogni esecuzione: il database di sviluppo è condiviso. */
const run = Date.now().toString(36);
const alice = await api('/auth/register', {
  method: 'POST',
  body: { nickname: `MemoAlice${run}`, password: 'memoria123', avatar: '🐱' },
});
const bob = await api('/auth/register', {
  method: 'POST',
  body: { nickname: `MemoBob${run}`, password: 'memoria123', avatar: '🐶' },
});
log('profili', alice.profile.id.slice(0, 8), 'e', bob.profile.id.slice(0, 8));

const markSeen = (token, schedaIds) =>
  api('/me/played-schede', { method: 'POST', token, body: { schedaIds } });
const forget = (token) => api('/me/played-schede', { method: 'DELETE', token });
const seenIds = async (token) =>
  new Set((await api('/me/played-schede', { token })).schedaIds ?? []);

/* ------------------------------------------------------------------ */
/* Stanza di due giocatori loggati, un round da 5 secondi              */
/* ------------------------------------------------------------------ */
const a = io(URL, { transports: ['websocket'] });
const b = io(URL, { transports: ['websocket'] });
await Promise.all([a, b].map((s) => once(s, 'connect')));

const created = await ack(a, 'room:create', {
  nickname: 'Alice',
  token: alice.token,
  gridSize: 4,
  difficulty: 'normale',
  rounds: 2,
  roundDurationMs: 5000,
});
if (!created.ok) {
  console.error('✗ room:create fallita:', JSON.stringify(created));
  process.exit(1);
}
const code = created.roomCode;
const joined = await ack(b, 'room:join', { code, nickname: 'Bob', token: bob.token });
check('entrambi i giocatori hanno un profilo in stanza', created.ok && joined.ok);

/*
 * Il pool è piccolo di proposito (10-15 schede per gruppo): è il motivo per cui
 * la memoria serve. Si prende il gruppo che la stanza userà davvero, variante
 * compresa — che la decide l'admin, non il client.
 */
const catalog = await api('/schede');
const variant = created.state?.schedaVariant ?? 'standard';
const pool = (catalog.meta ?? [])
  .filter((m) => m.size === 4 && m.difficulty === 'normale' && (m.variant ?? 'standard') === variant)
  .map((m) => m.id)
  .sort();
if (pool.length < 3) {
  console.error(`✗ Pool troppo piccolo per provare la regola (${pool.length} schede)`);
  process.exit(1);
}
log(`stanza ${code} — pool 4×4/normale/${variant}: ${pool.length} schede`);

/* ------------------------------------------------------------------ */
/* 1. Tutti e due hanno visto tutto tranne una: si gioca QUELLA        */
/* ------------------------------------------------------------------ */
const unseen = pool[pool.length - 1];
const others = pool.slice(0, -1);
await markSeen(alice.token, others);
await markSeen(bob.token, others);
check(
  'la cronologia preparata è di una sola scheda mancante',
  (await seenIds(alice.token)).size === others.length,
);

const rs1p = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round1 = await rs1p;
check(
  'la stanza pesca l’unica griglia che nessuno dei due ha mai visto',
  round1.schedaId === unseen,
  `attesa ${unseen}, giocata ${round1.schedaId}`,
);

/* ------------------------------------------------------------------ */
/* 2. A round partito la scheda entra nella cronologia di chi gioca    */
/* ------------------------------------------------------------------ */
check('round 1 chiuso', (await once(a, 'game:roundEnd'))?.round === 1);
// La scrittura è nel burst di fine round: un giro di eventi di margine.
await wait(400);
const aliceSeen = await seenIds(alice.token);
const bobSeen = await seenIds(bob.token);
check(
  'la griglia giocata entra nella cronologia di ENTRAMBI',
  aliceSeen.has(unseen) && bobSeen.has(unseen),
  `alice ${aliceSeen.size}/${pool.length}, bob ${bobSeen.size}/${pool.length}`,
);
check(
  'e il profilo ora ricorda tutto il gruppo',
  aliceSeen.size === pool.length && bobSeen.size === pool.length,
);

/* ------------------------------------------------------------------ */
/* 3. Pool esaurito: vince la somma dei contatori, non il numero di    */
/*    persone. Tutte le schede contate due volte, una sola contata una. */
/* ------------------------------------------------------------------ */
await forget(alice.token);
await forget(bob.token);
const least = pool[pool.length - 2]; // diversa da quella giocata al round 1
const twice = pool.filter((id) => id !== least);
// Un POST con gli id ripetuti conta una vista per ogni occorrenza: qui ogni
// scheda ne riceve DUE (una per ogni copia dell'elenco), `least` una sola.
await markSeen(alice.token, [...twice, ...twice, least]);
await markSeen(bob.token, [...twice, ...twice, least]);

const rs2p = once(a, 'game:roundStart');
a.emit('room:start', { code });
const round2 = await rs2p;
check(
  'con tutto già visto vince la scheda vista MENO VOLTE',
  round2.schedaId === least,
  `attesa ${least}, giocata ${round2.schedaId}`,
);
check(
  'e non è la stessa del round precedente (il livello della partita tiene)',
  round2.schedaId !== round1.schedaId,
);

await forget(alice.token);
await forget(bob.token);
a.emit('room:close', { code });
a.close();
b.close();

log(failed === 0 ? '\n✓ Memoria per profilo in multiplayer: tutto apposto' : `\n✗ ${failed} verifiche fallite`);
process.exit(failed === 0 ? 0 : 1);
