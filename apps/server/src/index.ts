import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  isDifficulty,
  isSfxSlot,
  isSubmitGamePayload,
  LEADERBOARD_KINDS,
  PROFILE_LIMITS,
  type ClientToServerEvents,
  type Difficulty,
  type GridSize,
  type ErrorPayload,
  type LeaderboardKind,
  type LeaderboardPeriod,
  type WordCatalogQuery,
  WORD_CATALOG_DEFAULT_LIMIT,
  type ServerToClientEvents,
} from '@boggle/shared';
import { loadServerDictionary, getSchedaPool } from './dictionary.js';
import { DATA_DIR, SchedaCatalog, toMeta } from './schede.js';
import { ProfileStore } from './profiles.js';
import { RoomRegistry, ROUND_END_PAUSE_MS, COUNTDOWN_MS, clampDuration, type Room } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

/**
 * Origini consentite: una o piu' separate da virgola (es. Netlify + locale).
 * Con `*` si accettano tutte (utile in sviluppo).
 */
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
  if (!origin) return callback(null, true); // curl, health check, same-origin
  if (CLIENT_ORIGINS.includes('*') || CLIENT_ORIGINS.includes(origin)) return callback(null, true);
  // In sviluppo consenti localhost su qualsiasi porta.
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
};

// Il dizionario (Set) e' sempre in memoria; il trie del solver e' lazy.
const dictionary = await loadServerDictionary();
const registry = new RoomRegistry(dictionary);
// Catalogo schede: caricato una volta all'avvio (base versionate + extra admin).
const schede = SchedaCatalog.load();

/**
 * Profili: un file SQLite in DATA_DIR (lo stesso usato dal catalogo per le schede
 * dell'admin). Su Railway monta UN volume su /app/data: copre entrambi.
 *
 * NOTA: il file mantiene il nome storico `boggle.db` (dal nome precedente del gioco)
 * perché contiene i PROFILI DEGLI UTENTI. Rinominarlo significherebbe che un'istanza
 * già in produzione, al riavvio, creerebbe un database vuoto e i dati esistenti sul
 * volume verrebbero ignorati. Il nome non è visibile all'utente.
 */
const DB_FILE = 'boggle.db';
const profiles = new ProfileStore(path.join(DATA_DIR, DB_FILE));

// pulizia periodica delle stanze vuote/terminate
setInterval(() => registry.cleanup(), 60_000).unref();

const app = express();
app.use(cors({ origin: corsOrigin }));
// Limite alto: foto e clip audio viaggiano come base64 nel JSON.
app.use(express.json({ limit: '4mb' }));

app.get('/health', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    rooms: 'ok',
    words: dictionary.size,
    uptimeSec: Math.round(process.uptime()),
    rssMb: Math.round(mem.rss / 1048576),
  });
});

/** Serve il dizionario al client con compressione trasparente. */
const DICT_DIR = process.env.DICT_DIR
  ? path.resolve(process.env.DICT_DIR)
  : path.resolve(__dirname, '../../../packages/dictionary/data');
app.get('/dictionary/words.txt', (req, res) => {
  const accept = req.headers['accept-encoding'] ?? '';
  const brPath = path.join(DICT_DIR, 'words.br');
  if (accept.includes('br') && existsSync(brPath)) {
    res.type('text/plain; charset=utf-8');
    res.setHeader('Content-Encoding', 'br');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.sendFile(brPath);
  }
  res.type('text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(DICT_DIR, 'words.txt'));
});

// In produzione il server puo' servire anche il build statico del frontend
// (monolite same-origin). Il mount statico e il fallback SPA vengono aggiunti in
// FONDO, dopo TUTTE le rotte API: le schede sono anche file statici del web
// (`dist/schede/`), quindi un mount anticipato catturerebbe `/schede`
// reindirizzando a `/schede/` e rompendo l'endpoint JSON.
const WEB_DIST = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.resolve(__dirname, '../../web/dist');
const servesWeb = existsSync(path.join(WEB_DIST, 'index.html'));

/**
 * Anteprima: pesca una scheda reale dal catalogo con le impostazioni richieste
 * e ne mostra griglia, numero di parole e qualche esempio lungo.
 *
 * GET /preview?gridSize=4&difficulty=normale
 * -> { gridSize, difficulty, schedaId, grid: string[], wordCount, sampleWords, truncated }
 *
 * Non si risolve nulla a runtime: le parole arrivano dalla scheda pre-calcolata.
 */
app.get('/preview', (req, res) => {
  const gridSizeRaw = Number(req.query.gridSize);
  const gridSize: GridSize = gridSizeRaw === 5 || gridSizeRaw === 6 ? gridSizeRaw : 4;
  const difficultyRaw = String(req.query.difficulty ?? 'normale');
  const difficulty: Difficulty = isDifficulty(difficultyRaw) ? difficultyRaw : 'normale';

  res.setHeader('Cache-Control', 'no-store');
  const scheda = schede.random(gridSize, difficulty);
  if (!scheda) {
    return res.json({
      gridSize,
      difficulty,
      schedaId: null,
      grid: [],
      wordCount: null,
      sampleWords: [],
      truncated: false,
    });
  }

  const sampleWords = [...scheda.words].sort((a, b) => b.length - a.length).slice(0, 8);
  res.json({
    gridSize,
    difficulty,
    schedaId: scheda.id,
    grid: scheda.grid.split('\n').map((row) => row.toUpperCase()),
    wordCount: scheda.words.length,
    sampleWords,
    truncated: false,
  });
});

/**
 * Catalogo schede: elenco dei gruppi disponibili e conteggi.
 *
 * GET /schede            -> { total, byKey, bySize }
 * GET /schede/:id        -> scheda completa (griglia + tutte le parole)
 *
 * Le soluzioni sono pubbliche per scelta di prodotto: la pagina scheda serve
 * anche a studiare le griglie. Vedi SPEC §3.5.
 */
app.get('/schede', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const byKey = schede.countByKey();
  const bySize: Record<string, number> = {};
  /** Id raggruppati per chiave: permette al client di costruire il selettore. */
  const ids: Record<string, string[]> = {};
  for (const scheda of schede.list()) {
    const key = `${scheda.size}-${scheda.difficulty}`;
    (ids[key] ??= []).push(scheda.id);
  }
  for (const list of Object.values(ids)) list.sort();
  for (const [key, count] of Object.entries(byKey)) {
    const size = key.split('-')[0]!;
    bySize[size] = (bySize[size] ?? 0) + count;
  }
  res.json({ total: schede.size, byKey, bySize, ids });
});


/**
 * Catalogo di tutte le parole componibili, con il numero di schede in cui compaiono.
 *
 * Pubblico: è utile anche solo per curiosità ("quali parole lunghe esistono?").
 * Supporta ricerca, filtro per lunghezza e dimensione/difficoltà, ordinamento
 * e paginazione. La distribuzione per lunghezza è calcolata sull'intero insieme
 * filtrato, non solo sulla pagina restituita.
 */
app.get('/words', (req, res) => {
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const sizeRaw = num(req.query.gridSize);
  const gridSize = sizeRaw === 4 || sizeRaw === 5 || sizeRaw === 6 ? (sizeRaw as GridSize) : undefined;
  const diffRaw = String(req.query.difficulty ?? '');
  const difficulty = isDifficulty(diffRaw) ? (diffRaw as Difficulty) : undefined;

  const sortRaw = String(req.query.sort ?? 'occurrences');
  const sort: WordCatalogQuery['sort'] =
    sortRaw === 'word' || sortRaw === 'length' ? sortRaw : 'occurrences';
  const direction = req.query.direction === 'asc' ? 'asc' : 'desc';

  const limitRaw = num(req.query.limit);
  const limit = Math.min(500, Math.max(1, limitRaw ?? WORD_CATALOG_DEFAULT_LIMIT));
  const offset = Math.max(0, num(req.query.offset) ?? 0);

  const result = schede.wordCatalog({
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    length: num(req.query.length),
    minLength: num(req.query.minLength),
    maxLength: num(req.query.maxLength),
    gridSize,
    difficulty,
    sort,
    direction,
    limit,
    offset,
  });

  res.setHeader('Cache-Control', 'no-store');
  res.json(result);
});

app.get('/schede/:id', (req, res) => {
  const scheda = schede.get(String(req.params.id));
  if (!scheda) return res.status(404).json({ error: 'Scheda non trovata' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(scheda);
});

/* ------------------------------------------------------------------ */
/* Profili                                                             */
/* ------------------------------------------------------------------ */

function bearerToken(req: express.Request): string | null {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Ritorna il profilo autenticato, o `null` inviando già la risposta 401. */
function requireProfile(req: express.Request, res: express.Response) {
  const token = bearerToken(req);
  const profile = token ? profiles.getByToken(token) : null;
  if (!profile) {
    res.status(401).json({ error: 'Autenticazione richiesta' });
    return null;
  }
  return profile;
}

/**
 * Decodifica un data URL `data:<mime>[;parametri];base64,<dati>`.
 *
 * Nota: i data URL di `MediaRecorder` includono un parametro opzionale, es.
 * `data:audio/webm;codecs=opus;base64,...`. La prima versione accettava solo
 * `data:<mime>;base64,`, quindi RIFIUTAVA le registrazioni audio (il parametro
 * `codecs=opus` faceva fallire il match). Ora i parametri sono ammessi; a DB si
 * salva solo il mime senza parametri.
 */
function decodeDataUrl(
  raw: unknown,
  opts: { maxBytes: number; mimePrefix: string },
): { data: Buffer; mime: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Formato non valido' };
  const match = /^data:([^,;]+)(?:;[^,;]+)*;base64,(.+)$/s.exec(raw);
  if (!match) return { error: 'Serve un data URL base64' };
  const mime = match[1]!.trim().toLowerCase();
  if (!mime.startsWith(opts.mimePrefix)) return { error: `Formato non supportato: ${mime}` };
  const data = Buffer.from(match[2]!, 'base64');
  if (data.length === 0) return { error: 'File vuoto' };
  if (data.length > opts.maxBytes) {
    return { error: `File troppo grande (max ${Math.round(opts.maxBytes / 1024)} KB)` };
  }
  return { data, mime };
}

app.post('/auth/register', async (req, res) => {
  const nickname = String(req.body?.nickname ?? '').trim();
  const password = String(req.body?.password ?? '');
  const avatar = String(req.body?.avatar ?? '🐱');
  if (nickname.length < 3 || nickname.length > PROFILE_LIMITS.nicknameMaxLength) {
    return res.status(400).json({ error: `Nickname da 3 a ${PROFILE_LIMITS.nicknameMaxLength} caratteri` });
  }
  if (password.length < PROFILE_LIMITS.passwordMinLength) {
    return res.status(400).json({ error: `Password di almeno ${PROFILE_LIMITS.passwordMinLength} caratteri` });
  }
  try {
    const profile = await profiles.register(nickname, password, avatar);
    const token = profiles.createSession(profile.id);
    res.json({ token, profile: profiles.toPrivate(profile) });
  } catch (err) {
    if (String(err).includes('NICKNAME_TAKEN')) {
      return res.status(409).json({ error: 'Nickname già in uso' });
    }
    console.error('register fallito:', err);
    res.status(500).json({ error: 'Registrazione non riuscita' });
  }
});

app.post('/auth/login', async (req, res) => {
  const nickname = String(req.body?.nickname ?? '');
  const password = String(req.body?.password ?? '');
  const profile = await profiles.verify(nickname, password);
  if (!profile) return res.status(401).json({ error: 'Nickname o password errati' });
  const token = profiles.createSession(profile.id);
  res.json({ token, profile: profiles.toPrivate(profile) });
});

app.post('/auth/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) profiles.destroySession(token);
  res.json({ ok: true });
});

/** Profilo del proprietario (inclusi URL di foto e clip audio). */
app.get('/me', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  res.setHeader('Cache-Control', 'no-store');
  res.json(profiles.toPrivate(profile));
});

app.patch('/me', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  const updated = profiles.update(profile.id, {
    avatar: req.body?.avatar !== undefined ? String(req.body.avatar) : undefined,
    musicId: req.body?.musicId,
  });
  if (!updated) return res.status(404).json({ error: 'Profilo non trovato' });
  res.json(profiles.toPrivate(updated));
});

app.get('/me/sfx', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  res.json({ sfx: profiles.listSfx(profile.id) });
});


/* ---------------- Partite e leaderboard ---------------- */

/**
 * Registra una partita conclusa. Richiede autenticazione: il profilo viene dal
 * token, non dal body (altrimenti chiunque potrebbe attribuirsi partite altrui).
 *
 * NOTA anti-cheat: il punteggio arriva dal client. In single player il server non
 * conosce la griglia giocata, quindi non puo' ricalcolarlo. Accettiamo il valore
 * ma imponiamo limiti di plausibilita' e salviamo anche i dati che permettono di
 * verificare a posteriori (scheda, parole, lunghezza).
 */
app.post('/games', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  const payload = req.body;
  if (!isSubmitGamePayload(payload)) {
    return res.status(400).json({ error: 'Dati partita non validi' });
  }
  // Limiti di plausibilita': una scheda ha al massimo qualche centinaio di parole.
  if (payload.words > 1000 || payload.score > 5000) {
    return res.status(400).json({ error: 'Punteggio fuori scala' });
  }
  try {
    const id = profiles.recordGame(profile.id, payload);
    res.status(201).json({ id, stats: profiles.playerStats(profile.id) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Leaderboard pubblica (nessun login richiesto: e' bello vedere i migliori anche
 * da non registrati). I filtri arrivano dalla query string.
 */
app.get('/leaderboard', (req, res) => {
  const kindRaw = String(req.query.kind ?? 'best');
  const kind = LEADERBOARD_KINDS.includes(kindRaw as LeaderboardKind)
    ? (kindRaw as LeaderboardKind)
    : 'best';

  const periodRaw = String(req.query.period ?? 'all');
  const period: LeaderboardPeriod =
    periodRaw === 'week' || periodRaw === 'month' ? periodRaw : 'all';

  const sizeRaw = Number(req.query.gridSize);
  const gridSize = sizeRaw === 4 || sizeRaw === 5 || sizeRaw === 6 ? (sizeRaw as GridSize) : undefined;

  const diffRaw = String(req.query.difficulty ?? '');
  const difficulty = isDifficulty(diffRaw) ? (diffRaw as Difficulty) : undefined;

  const { entries, gamesConsidered } = profiles.leaderboard({ kind, period, gridSize, difficulty });

  // Se c'e' un token valido, aggiungiamo la posizione del giocatore per evidenziarla.
  const token = bearerToken(req);
  const me = token ? profiles.getByToken(token) : null;
  const myRank = me ? entries.findIndex((e) => e.profileId === me.id) + 1 : 0;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    kind,
    period,
    gridSize,
    difficulty,
    entries,
    gamesConsidered,
    myProfileId: me?.id ?? null,
    myRank: myRank > 0 ? myRank : 0,
  });
});

/** Statistiche personali del giocatore autenticato. */
app.get('/me/stats', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  res.json(profiles.playerStats(profile.id));
});

/* ---------------- Foto profilo ---------------- */

app.put('/me/photo', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  const decoded = decodeDataUrl(req.body?.dataUrl, {
    maxBytes: PROFILE_LIMITS.photoMaxBytes,
    mimePrefix: 'image/',
  });
  if ('error' in decoded) return res.status(400).json(decoded);
  const updatedAt = profiles.setPhoto(profile.id, decoded.data, decoded.mime);
  res.json({ photoUrl: `/profiles/${profile.id}/photo?v=${updatedAt}`, photoUpdatedAt: updatedAt });
});

app.delete('/me/photo', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  profiles.clearPhoto(profile.id);
  res.json({ ok: true });
});

/**
 * Foto di un profilo. È PUBBLICA: in stanza gli altri vedono l'avatar, e se il
 * giocatore ha caricato una foto la mostriamo al posto dell'emoji (scelta di
 * prodotto: la foto è l'"avatar grande"). Le registrazioni audio restano private.
 */
app.get('/profiles/:id/photo', (req, res) => {
  const photo = profiles.getPhoto(String(req.params.id));
  if (!photo) return res.status(404).end();
  res.setHeader('Content-Type', photo.mime);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(photo.data);
});

/* ---------------- Clip audio (private) ---------------- */

app.put('/me/sfx/:slot', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  const slot = String(req.params.slot);
  if (!isSfxSlot(slot)) return res.status(400).json({ error: 'Fascia non valida' });
  const decoded = decodeDataUrl(req.body?.dataUrl, {
    maxBytes: PROFILE_LIMITS.sfxMaxBytes,
    mimePrefix: 'audio/',
  });
  if ('error' in decoded) return res.status(400).json(decoded);
  const durationMs = Math.min(Number(req.body?.durationMs ?? 0) || 0, PROFILE_LIMITS.sfxMaxDurationMs);
  const sfx = profiles.setSfx(profile.id, slot, decoded.data, decoded.mime, durationMs);
  res.json(sfx);
});

app.delete('/me/sfx/:slot', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  const slot = String(req.params.slot);
  if (!isSfxSlot(slot)) return res.status(400).json({ error: 'Fascia non valida' });
  profiles.deleteSfx(profile.id, slot);
  res.json({ ok: true });
});

/**
 * Clip audio di un profilo. Richiede il token del PROPRIETARIO: le registrazioni
 * sono private (l'utente sente solo i propri suoni).
 */
app.get('/profiles/:id/sfx/:slot', (req, res) => {
  const profile = requireProfile(req, res);
  if (!profile) return;
  if (profile.id !== String(req.params.id)) return res.status(403).json({ error: 'Clip non tua' });
  const slot = String(req.params.slot);
  if (!isSfxSlot(slot)) return res.status(400).json({ error: 'Fascia non valida' });
  const sfx = profiles.getSfx(profile.id, slot);
  if (!sfx) return res.status(404).end();
  res.setHeader('Content-Type', sfx.mime);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(sfx.data);
});

/* ------------------------------------------------------------------ */
/* Admin schede                                                        */
/* ------------------------------------------------------------------ */

/**
 * Token admin da `ADMIN_TOKEN`. Se non impostato, le rotte admin rispondono 503:
 * meglio un admin disabilitato che un admin aperto a tutti per dimenticanza.
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

function requireAdmin(req: express.Request, res: express.Response): boolean {
  if (!ADMIN_TOKEN) {
    res.status(503).json({ error: 'Admin non configurato: imposta ADMIN_TOKEN' });
    return false;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token ?? '');
  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: 'Token non valido' });
    return false;
  }
  return true;
}

/** Verifica il token (usata dalla pagina /admin per il login). */
app.get('/admin/verify', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, total: schede.size });
});

/** Elenco schede (metadati, senza le soluzioni) con filtri opzionali. */
app.get('/admin/schede', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const size = Number(req.query.size);
  const difficulty = String(req.query.difficulty ?? '');
  const filtered = schede.list(
    size === 4 || size === 5 || size === 6 ? size : undefined,
    isDifficulty(difficulty) ? difficulty : undefined,
  );
  res.json({
    total: schede.size,
    count: filtered.length,
    byKey: schede.countByKey(),
    schede: filtered.map(toMeta),
  });
});

/**
 * Genera e salva nuove schede.
 *
 * POST /admin/schede/genera  { size, difficulty, count }
 * -> { created: SchedaMeta[], total }
 *
 * Le schede vengono scritte in `SCHEDE_EXTRA_DIR` (default `schede-extra/`) e
 * aggiunte subito al catalogo in memoria.
 */
app.post('/admin/schede/genera', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const size = Number(req.body?.size);
  const difficulty = String(req.body?.difficulty ?? '');
  const count = Math.max(1, Math.min(100, Number(req.body?.count ?? 10)));
  if (size !== 4 && size !== 5 && size !== 6) {
    return res.status(400).json({ error: 'size deve essere 4, 5 o 6' });
  }
  if (!isDifficulty(difficulty)) {
    return res.status(400).json({ error: 'difficulty non valida' });
  }

  const startedAt = Date.now();
  const pool = await getSchedaPool();
  const startIndex = schede.list(size, difficulty).length + 1;
  const created = pool.generate(size, difficulty, count, { startIndex });
  for (const scheda of created) {
    schede.add(scheda);
    schede.persist(scheda);
  }
  console.log(
    `✓ Admin: generate ${created.length} schede ${size}x${size} ${difficulty} in ${Date.now() - startedAt}ms`,
  );
  res.json({
    created: created.map(toMeta),
    total: schede.size,
    byKey: schede.countByKey(),
  });
});

/**
 * Stato del database e backup manuale.
 *
 * GET /admin/db  -> metriche (profili, dimensione, stato WAL)
 * POST /admin/db/checkpoint -> consolida il WAL nel file principale
 *
 * Utile perché con la modalità WAL le scritture recenti stanno in `boggle.db-wal`:
 * un backup del solo `boggle.db` le perderebbe. Il server consolida alla chiusura
 * (SIGTERM), ma in caso di crash o durante la copia manuale del volume questi
 * comandi danno un punto di ripristino coerente.
 */
app.get('/admin/db', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(profiles.stats());
});

app.post('/admin/db/checkpoint', (req, res) => {
  if (!requireAdmin(req, res)) return;
  profiles.checkpoint();
  res.json({ ok: true, ...profiles.stats() });
});

// Fallback SPA e asset statici: DOPO tutte le rotte API (schede, preview, admin,
// auth, profili, dizionario, health) per non oscurarle.
if (servesWeb) {
  // Gli asset statici (inclusi `/schede/*.json` del bundle offline) si servono
  // solo se nessuna rotta API ha gia' risposto.
  app.use(express.static(WEB_DIST, { maxAge: '1h', index: false }));
  app.get(/^\/(?!socket\.io|dictionary|health|preview|schede|admin|auth|me|profiles).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
  console.log(`✓ Frontend statico servito da ${WEB_DIST}`);
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  // Dietro proxy (Railway, Fly): rispetta X-Forwarded-For per IP e rate limit.
  transports: ['websocket', 'polling'],
});

/** Associazioni socket <-> stanza/giocatore. */
const socketState = new Map<string, { code: string; playerId: string }>();

const errorPayload = (code: string, message: string): ErrorPayload => ({ code, message });

/** Profilo a partire da un token Socket.IO, o null se assente/non valido. */
function resolveProfile(token: unknown) {
  if (typeof token !== 'string' || !token) return null;
  return profiles.getByToken(token);
}

/** URL pubblico della foto, se il profilo ne ha una. */
function photoUrlFor(profile: { id: string; hasPhoto: boolean; photoUpdatedAt: number | null }): string | null {
  return profile.hasPhoto ? `/profiles/${profile.id}/photo?v=${profile.photoUpdatedAt ?? 0}` : null;
}

/**
 * Tetto di parole enumerate in una scheda generata dall'admin.
 * Le schede normali ne hanno molte meno; il tetto difende da griglie patologiche.
 */
const MAX_SCHEDA_WORDS = 6000;

function broadcastState(room: Room): void {
  io.to(room.code).emit('room:update', room.publicState());
}

function isValidGridSize(n: unknown): n is GridSize {
  return n === 4 || n === 5 || n === 6;
}
function clampRounds(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.min(10, Math.max(1, Math.round(v)));
}

/** Numero massimo di giocatori ammessi: 2 (sfida), 4 o 8. */
function clampMaxPlayers(v: unknown): number {
  const n = Number(v);
  if (n === 2 || n === 4 || n === 8) return n;
  return 8;
}

/*
 * NOTA: la validazione delle difficoltà usa `isDifficulty` dal pacchetto condiviso.
 * Prima c'era una funzione locale con i confronti hardcoded: aggiungendo un livello
 * ('estremo') restava indietro e lo rifiutava silenziosamente, ricadendo su 'normale'.
 * Usare la funzione condivisa evita che i due elenchi si disallineino.
 */

io.on('connection', (socket) => {
  socket.on('room:create', (payload, ack) => {
    try {
      const gridSize = isValidGridSize(payload?.gridSize) ? payload.gridSize : 4;
      const rounds = clampRounds(payload?.rounds);
      const difficulty = isDifficulty(payload?.difficulty) ? payload.difficulty : 'normale';
      const roundDurationMs = clampDuration(payload?.roundDurationMs);
      const maxPlayers = clampMaxPlayers(payload?.maxPlayers);
      const room = registry.create(gridSize, rounds, difficulty, roundDurationMs, maxPlayers);
      // Profilo (se loggato): nome, avatar, foto pubblica e musica preferita.
      const profile = resolveProfile(payload?.token);
      if (profile) room.setMusic(profile.musicId);
      const playerId = randomUUID();
      const player = room.addPlayer(
        playerId,
        profile?.nickname ?? payload?.nickname ?? 'Host',
        profile?.avatar ?? payload?.avatar,
        profile ? { id: profile.id, photoUrl: photoUrlFor(profile) } : null,
      );
      player.socketId = socket.id;
      socket.join(room.code);
      socketState.set(socket.id, { code: room.code, playerId });
      const ackPayload = { ok: true as const, roomCode: room.code, playerId, state: room.publicState() };
      ack(ackPayload);
      broadcastState(room);
    } catch (err) {
      ack(errorPayload('CREATE_FAILED', String(err)));
    }
  });

  socket.on('room:join', (payload, ack) => {
    const code = String(payload?.code ?? '').toUpperCase().trim();
    const room = registry.get(code);
    if (!room) return ack(errorPayload('ROOM_NOT_FOUND', 'Stanza non trovata'));

    // Riconnessione con playerId esistente: ammessa anche a partita iniziata.
    const existing = payload.playerId ? room.players.get(payload.playerId) : undefined;
    let playerId: string;
    if (existing) {
      existing.connected = true;
      existing.socketId = socket.id;
      playerId = existing.id;
    } else {
      if (room.phase !== 'lobby') return ack(errorPayload('GAME_STARTED', 'Partita gia\' iniziata'));
      if (room.isFull) return ack(errorPayload('ROOM_FULL', 'Stanza piena'));
      const profile = resolveProfile(payload?.token);
      playerId = randomUUID();
      const player = room.addPlayer(
        playerId,
        profile?.nickname ?? payload?.nickname ?? 'Giocatore',
        profile?.avatar ?? payload?.avatar,
        profile ? { id: profile.id, photoUrl: photoUrlFor(profile) } : null,
      );
      player.socketId = socket.id;
    }
    socket.join(room.code);
    socketState.set(socket.id, { code: room.code, playerId });
    ack({ ok: true as const, playerId, state: room.publicState() });
    broadcastState(room);

    // Reconnecting a round in corso: reinvia la griglia e la scadenza.
    // Emesso in un tick successivo, cosi' il client ha il tempo di registrare i listener
    // dopo aver ricevuto l'ack di room:join.
    if (existing && room.phase === 'playing' && room.grid) {
      const payload = {
        round: room.currentRound,
        grid: room.grid,
        endsAt: room.roundEndsAt,
        durationMs: room.roundDurationMs,
      };
      setTimeout(() => socket.emit('game:roundStart', payload), 0);
    }
  });

  socket.on('room:start', ({ code }) => {
    const st = socketState.get(socket.id);
    const room = registry.get(code);
    if (!room || !st || st.code !== room.code) return;
    if (st.playerId !== room.hostId) return;
    if (room.phase !== 'lobby' && room.phase !== 'roundEnd') return;

    const startRound = () => {
      // Ogni round pesca una scheda dal catalogo: griglia e soluzione già pronte.
      const scheda = schede.random(room.gridSize, room.difficulty);
      const { grid, endsAt } = room.startRound(scheda);
      io.to(room.code).emit('game:roundStart', {
        round: room.currentRound,
        grid,
        endsAt,
        durationMs: room.roundDurationMs,
        schedaId: room.schedaId ?? undefined,
      });
      broadcastState(room);
      scheduleRoundEnd(room);
    };

    // Countdown 3-2-1 per il primo round
    if (room.phase === 'lobby') {
      room.phase = 'countdown';
      broadcastState(room);
      const seconds = Math.max(1, Math.round(COUNTDOWN_MS / 1000));
      for (let s = seconds; s >= 1; s--) {
        setTimeout(
          () => io.to(room.code).emit('game:countdown', { seconds: s }),
          (seconds - s) * 1000,
        );
      }
      setTimeout(startRound, COUNTDOWN_MS);
    } else {
      startRound();
    }
  });

  socket.on('room:config', ({ code, gridSize, difficulty, rounds, roundDurationMs, musicId }) => {
    const st = socketState.get(socket.id);
    const room = registry.get(code);
    if (!room || !st || st.code !== room.code) return;
    if (st.playerId !== room.hostId) return;
    if (room.phase !== 'lobby') return;
    if (isValidGridSize(gridSize)) room.gridSize = gridSize;
    if (isDifficulty(difficulty)) room.difficulty = difficulty;
    room.rounds = clampRounds(rounds);
    room.roundDurationMs = clampDuration(roundDurationMs);
    // La musica la scegle l'host e vale per tutti.
    if (musicId !== undefined) room.setMusic(musicId);
    broadcastState(room);
  });

  socket.on('game:submitWord', (payload, ack) => {
    const st = socketState.get(socket.id);
    if (!st) return ack({ accepted: false, reason: 'Non in una stanza' });
    const room = registry.get(st.code);
    if (!room) return ack({ accepted: false, reason: 'Stanza non trovata' });

    const result = room.submitWord(st.playerId, payload.word, payload.path);
    if (result.accepted) {
      const player = room.players.get(st.playerId)!;
      // NOTA PRIVACY: agli avversari non va rivelata la parola trovata (nascondiamo
      // quali parole esistono sulla griglia). Nel feed live inviamo solo chi e quanti
      // punti, cosi' il client puo' mostrare "+2" accanto al nome.
      // Al proprietario inviamo la parola (serve per la propria lista).
      io.to(room.code).except(player.socketId ?? '').emit('game:playerWord', {
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        word: '',
        wordLength: result.word!.length,
        points: result.points!,
        score: player.totalScore,
        self: false,
      });
      if (player.socketId) {
        io.to(player.socketId).emit('game:playerWord', {
          playerId: player.id,
          nickname: player.nickname,
          avatar: player.avatar,
          word: result.word!,
          wordLength: result.word!.length,
          points: result.points!,
          score: player.totalScore,
          self: true,
        });
      }
      broadcastState(room);
    }
    ack(result);
  });

  socket.on('room:leave', ({ code }) => {
    const st = socketState.get(socket.id);
    if (!st || st.code !== code.toUpperCase()) return;
    handleLeave(socket.id, st.code, st.playerId, true);
  });

  socket.on('disconnect', () => {
    const st = socketState.get(socket.id);
    if (!st) return;
    socketState.delete(socket.id);
    const room = registry.get(st.code);
    if (!room) return;
    const player = room.players.get(st.playerId);
    if (player) {
      player.connected = false;
      player.socketId = null;
      broadcastState(room);
    }
  });
});

function handleLeave(socketId: string, code: string, playerId: string, explicit: boolean) {
  const room = registry.get(code);
  if (!room) return;
  if (explicit) {
    room.removePlayer(playerId);
    socketState.delete(socketId);
    io.sockets.sockets.get(socketId)?.leave(code);
  }
  if (room.players.size === 0) {
    registry.delete(code);
  } else {
    broadcastState(room);
  }
}

/** Pianifica la fine del round e gestisce la transizione al round successivo. */
function scheduleRoundEnd(room: Room): void {
  setTimeout(async () => {
    if (room.phase !== 'playing') return;
    const results = room.endRound();
    const missed = computeMissedWords(room);
    io.to(room.code).emit('game:roundEnd', {
      round: room.currentRound,
      results,
      missedWords: missed,
      nextRoundInMs: ROUND_END_PAUSE_MS,
    });
    broadcastState(room);

    if (room.isGameOver()) {
      setTimeout(() => {
        room.phase = 'gameEnd';
        io.to(room.code).emit('game:gameEnd', { finalScores: room.finalScores() });
        broadcastState(room);
      }, ROUND_END_PAUSE_MS);
    }
  }, Math.max(0, room.roundEndsAt - Date.now()));
}

/**
 * Parole valide presenti nella scheda che nessuno ha trovato.
 * Nessun solver: le parole arrivano pre-calcolate con la scheda.
 * Si mostrano le più lunghe (>= 5 lettere, max 20).
 */
function computeMissedWords(room: Room): string[] {
  return [...room.roundValidWords]
    .filter((w) => w.length >= 5 && !room.roundFoundWords.has(w))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, 20);
}

httpServer.listen(PORT, () => {
  console.log(`✓ Sbooble server su http://localhost:${PORT}`);
  console.log(`  origini client consentite: ${CLIENT_ORIGINS.join(', ')}`);
  console.log(`  parole in dizionario: ${dictionary.size.toLocaleString('it-IT')}`);
  console.log(`  schede disponibili: ${schede.size.toLocaleString('it-IT')}`);
  const mem = (process.memoryUsage().rss / 1048576).toFixed(0);
  console.log(`  RSS all'avvio: ${mem} MB (nessun trie del solver: parole dalle schede)`);
});

/**
 * Chiusura pulita del database.
 *
 * Perche' conta: SQLite e' in modalita' WAL, quindi le scritture recenti stanno nel
 * file `boggle.db-wal` finche' non avviene un checkpoint. Senza `close()` il WAL
 * resta popolato e `boggle.db` puo' risultare quasi VUOTO: un backup o un volume
 * copiato senza i file `-wal`/`-shm` perderebbe i profili.
 *
 * `close()` esegue il checkpoint e consolida tutto nel file principale.
 */
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} ricevuto: chiudo il database e termino…`);
  try {
    // TRUNCATE: consolida il WAL nel .db e azzera il file -wal.
    profiles.checkpoint();
    profiles.close();
    console.log('✓ Database chiuso (WAL consolidato in boggle.db)');
  } catch (err) {
    console.error('⚠ Chiusura del database non riuscita:', err);
  }
  httpServer.close(() => process.exit(0));
  // Rete di sicurezza: se le connessioni non si chiudono, esci comunque.
  setTimeout(() => process.exit(0), 3000).unref();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => shutdown(signal));
}
