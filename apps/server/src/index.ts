import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server, type Socket } from 'socket.io';
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
  type LeaderboardMode,
  type LeaderboardPeriod,
  type WordCatalogQuery,
  type SchedaStats,
  type SfxSlot,
  acceptedWords,
  schedaWordPoints,
  WORD_CATALOG_DEFAULT_LIMIT,
  type ServerToClientEvents,
} from '@boggle/shared';
import { loadServerDictionary, getSchedaPool } from './dictionary.js';
import { DATA_DIR, EXTRA_SCHEDE_DIR, SchedaCatalog, toMeta } from './schede.js';
import { MusicLibrary, MUSIC_MAX_BYTES } from './musicLibrary.js';
import { ProfileStore } from './profiles.js';
import { RoomRegistry, ROUND_END_PAUSE_MS, COUNTDOWN_MS, clampDuration, type Room } from './rooms.js';
import { VoiceRelay } from './voice.js';

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

/** Playlist musicale: tracce incluse + MP3 caricati dall'admin (condivisi). */
const musicLibrary = new MusicLibrary();

// pulizia periodica delle stanze vuote/terminate
setInterval(() => registry.cleanup(), 60_000).unref();

const app = express();
app.use(cors({ origin: corsOrigin }));
// Limite alto: foto e clip audio viaggiano come base64 nel JSON.
// Gli MP3 dell'admin NON passano di qui: usano un body binario grezzo (vedi /admin/music).
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

/* ---------------- Musica (playlist condivisa) ---------------- */

/**
 * Catalogo musicale: tracce incluse nel bundle + MP3 caricati dall'admin.
 *
 * È PUBBLICO: serve al client per mostrare le scelte possibili e per
 * risolvere il file di una traccia scelta dall'host in stanza.
 */
app.get('/music', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ tracks: musicLibrary.list() });
});

/** File audio di una traccia caricata dall'admin. Pubblico (la musica è condivisa). */
app.get('/music/:id/file', (req, res) => {
  const file = musicLibrary.fileOf(String(req.params.id));
  if (!file) return res.status(404).json({ error: 'Traccia non trovata' });
  // `sendFile` imposta Content-Type dal file; forziamo il mime con cui è stato
  // caricato, più affidabile dell'estensione per i formati meno comuni.
  res.type(file.mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(file.path);
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

  // Parole che il giocatore PUO' trovare (insieme accettato), non le sole attese.
  const sampleWords = [...acceptedWords(scheda)].sort((a, b) => b.length - a.length).slice(0, 8);
  res.json({
    gridSize,
    difficulty,
    schedaId: scheda.id,
    grid: scheda.grid.split('\n').map((row) => row.toUpperCase()),
    wordCount: acceptedWords(scheda).length,
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
  /*
   * Metadati per la pagina "Sfoglia schede": punteggio massimo ottenibile,
   * numero di parole e parola più lunga (solo lunghezza, mai la parola).
   * Calcolati dalle schede già in memoria: costo trascurabile, e la lista
   * permette al client di ordinare e filtrare senza scaricare 750 schede.
   */
  const meta: Array<{
    id: string;
    size: GridSize;
    difficulty: Difficulty;
    words: number;
    maxScore: number;
    longest: number;
  }> = [];
  for (const scheda of schede.list()) {
    const key = `${scheda.size}-${scheda.difficulty}`;
    (ids[key] ??= []).push(scheda.id);
    meta.push({
      id: scheda.id,
      size: scheda.size,
      difficulty: scheda.difficulty,
      words: acceptedWords(scheda).length,
      maxScore: acceptedWords(scheda).reduce((total, w) => total + schedaWordPoints(w.length), 0),
      longest: scheda.longest,
    });
  }
  for (const list of Object.values(ids)) list.sort();
  for (const [key, count] of Object.entries(byKey)) {
    const size = key.split('-')[0]!;
    bySize[size] = (bySize[size] ?? 0) + count;
  }
  res.json({ total: schede.size, byKey, bySize, ids, meta });
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
    schedaId: typeof req.query.schedaId === 'string' ? req.query.schedaId : undefined,
    pos: typeof req.query.pos === 'string' ? req.query.pos : undefined,
    onlyWithEntry: req.query.onlyWithEntry === '1' || req.query.onlyWithEntry === 'true',
    scope: req.query.scope === 'dizionario' ? 'dizionario' : 'schede',
    sort,
    direction,
    limit,
    offset,
  });

  res.setHeader('Cache-Control', 'no-store');
  res.json(result);
});


/**
 * Statistiche di una scheda: quante parole, per ogni lunghezza, punteggio massimo
 * e record. Alimenta l'anteprima prima di iniziare una partita.
 *
 * Tutto derivato dalle parole PRE-CALCOLATE della scheda: nessun solver a runtime.
 * Il record invece richiede il database (miglior punteggio mai fatto sulla scheda).
 *
 * NOTA sull'ordine delle rotte: questa è dichiarata PRIMA di `/schede/:id`,
 * altrimenti Express interpreterebbe 'stats' come un id di scheda.
 */
app.get('/schede/:id/stats', (req, res) => {
  const scheda = schede.get(String(req.params.id));
  if (!scheda) return res.status(404).json({ error: 'Scheda non trovata' });

  // Distribuzione per lunghezza + punteggio massimo.
  const counts = new Map<number, number>();
  let maxScore = 0;
  for (const word of acceptedWords(scheda)) {
    const len = word.length;
    counts.set(len, (counts.get(len) ?? 0) + 1);
    maxScore += schedaWordPoints(len);
  }
  const byLength = [...counts.entries()]
    .map(([length, words]) => ({
      length,
      words,
      points: words * schedaWordPoints(length),
    }))
    .sort((a, b) => a.length - b.length);

  const { record, gamesPlayed } = profiles.schedaRecord(scheda.id);

  res.json({
    id: scheda.id,
    size: scheda.size,
    difficulty: scheda.difficulty,
    grid: scheda.grid,
    wordCount: acceptedWords(scheda).length,
    maxScore,
    /*
     * SOLO la lunghezza della parola piu' lunga, NON la parola.
     * Restituirla significherebbe regalarla: l'anteprima e' pubblica e chiunque
     * puo' leggere la risposta dell'API dalla console del browser, anche se la
     * UI non la mostra.
     */
    longestLength: acceptedWords(scheda).reduce((m, w) => Math.max(m, w.length), 0),
    byLength,
    record,
    gamesPlayed,
  } satisfies SchedaStats);
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

  // Modalità: `solo`, `multi` o `all` (default). Separare single player e
  // multiplayer è una scelta di leggibilità: i punteggi multiplayer dipendono
  // dagli avversari.
  const modeRaw = String(req.query.mode ?? 'all');
  const mode: LeaderboardMode =
    modeRaw === 'solo' || modeRaw === 'multi' ? modeRaw : 'all';

  const { entries, gamesConsidered } = profiles.leaderboard({ kind, period, gridSize, difficulty, mode });

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
    mode,
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
 * Clip audio di un profilo.
 *
 * Le registrazioni restano PRIVATE nella loro sostanza, ma in multiplayer gli
 * avversari della stessa stanza devono poterle sentire: quando un altro trova una
 * parola, sul tuo dispositivo suona la SUA clip (a volume ridotto), non la tua.
 * Quindi l'accesso è consentito al proprietario e a chi condivide la stanza con
 * lui. Tutti gli altri ricevono 403.
 */
app.get('/profiles/:id/sfx/:slot', (req, res) => {
  const token = bearerToken(req);
  const me = token ? profiles.getByToken(token) : null;
  if (!me) return res.status(401).json({ error: 'Accesso richiesto' });
  const ownerId = String(req.params.id);
  /*
   * Clip audio: PRIVATE al proprietario, ma condivise con chi gioca NELLA STESSA
   * STANZA. Serve al multiplayer: quando un avversario trova una parola si sente
   * la SUA registrazione (a volume ridotto), non quella di chi ascolta.
   * L'elenco delle fasce è pubblico in stanza (`PlayerPublic.sfxSlots`), il
   * contenuto no: si scarica solo se i due profili condividono una partita.
   */
  if (me.id !== ownerId && !registry.sharesRoomWith(me.id, ownerId)) {
    return res.status(403).json({ error: 'Clip non disponibile' });
  }
  const slot = String(req.params.slot);
  if (!isSfxSlot(slot)) return res.status(400).json({ error: 'Fascia non valida' });
  const sfx = profiles.getSfx(ownerId, slot);
  if (!sfx) return res.status(404).end();
  res.setHeader('Content-Type', sfx.mime);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(sfx.data);
});

/* ------------------------------------------------------------------ */
/* Admin schede                                                        */
/* ------------------------------------------------------------------ */

/**
 * Autenticazione admin con utente e password da VARIABILI D'AMBIENTE.
 *
 * Perché non nel codice: il repository è pubblico. Una password scritta nel
 * sorgente finisce su GitHub e chiunque può leggerla, rendendo l'admin inutile.
 *
 * Configurazione (Railway → Variables):
 *   ADMIN_USER=admin
 *   ADMIN_PASSWORD=<scegli una password robusta>
 *
 * Il login restituisce un TOKEN DI SESSIONE temporaneo: la password viaggia una
 * volta sola e non a ogni richiesta. Le sessioni stanno in memoria e scadono.
 */
const ADMIN_USER = process.env.ADMIN_USER ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000; // 12 ore

/** Sessioni admin attive: token -> scadenza (ms epoch). In memoria, non su disco. */
const adminSessions = new Map<string, number>();

function adminConfigured(): boolean {
  return Boolean(ADMIN_USER && ADMIN_PASSWORD);
}

/** Confronto a tempo costante: evita di rivelare la password dal tempo di risposta. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual richiede la stessa lunghezza: confrontiamo su una copia
  // allineata e teniamo conto della differenza di lunghezza a parte.
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  bufA.copy(padA);
  bufB.copy(padB);
  return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

/** Crea una sessione admin e ritorna il token. */
function createAdminSession(): string {
  const token = randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_MS);
  return token;
}

/** true se il token è una sessione admin valida e non scaduta. */
function isValidAdminSession(token: string): boolean {
  const expires = adminSessions.get(token);
  if (expires === undefined) return false;
  if (expires < Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

/** Pulizia periodica delle sessioni scadute. */
setInterval(() => {
  const now = Date.now();
  for (const [token, expires] of adminSessions) if (expires < now) adminSessions.delete(token);
}, 10 * 60 * 1000).unref();

/**
 * Protegge le rotte admin.
 * Accetta un token di sessione (da /admin/login) oppure `ADMIN_TOKEN` se impostato,
 * per retro-compatibilità con chi lo usa già.
 */
function requireAdmin(req: express.Request, res: express.Response): boolean {
  if (!adminConfigured() && !process.env.ADMIN_TOKEN) {
    res.status(503).json({ error: 'Admin non configurato: imposta ADMIN_USER e ADMIN_PASSWORD' });
    return false;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token ?? '');
  if (isValidAdminSession(token)) return true;
  // Retro-compatibilità: vecchio token statico.
  const legacy = process.env.ADMIN_TOKEN;
  if (legacy && safeEqual(token, legacy)) return true;
  res.status(401).json({ error: 'Autenticazione richiesta' });
  return false;
}

/**
 * Login admin: utente + password dalle variabili d'ambiente.
 * Ritorna un token di sessione valido 12 ore.
 */
app.post('/admin/login', (req, res) => {
  if (!adminConfigured()) {
    return res.status(503).json({ error: 'Admin non configurato: imposta ADMIN_USER e ADMIN_PASSWORD' });
  }
  const user = String(req.body?.user ?? '');
  const password = String(req.body?.password ?? '');
  const ok = safeEqual(user, ADMIN_USER) && safeEqual(password, ADMIN_PASSWORD);
  if (!ok) {
    console.warn(`✗ Login admin fallito (utente: ${user.slice(0, 20) || '(vuoto)'})`);
    return res.status(401).json({ error: 'Credenziali non valide' });
  }
  const token = createAdminSession();
  console.log('✓ Login admin riuscito');
  res.json({ token, expiresInMs: ADMIN_SESSION_MS });
});

/** Logout: invalida la sessione corrente. */
app.post('/admin/logout', (req, res) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.body?.token ?? '');
  adminSessions.delete(token);
  res.json({ ok: true });
});

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
  try {
    const pool = await getSchedaPool();
    const startIndex = schede.list(size, difficulty).length + 1;
    const created = pool.generate(size, difficulty, count, { startIndex });

    /*
     * ORDINE IMPORTANTE: prima si scrive su DISCO, poi si aggiunge in memoria.
     *
     * L'ordine inverso dava un problema insidioso: se la scrittura falliva (volume
     * non scrivibile, permessi, disco pieno) la scheda restava SOLO in memoria.
     * Il catalogo la mostrava, sembrava tutto a posto, ma al riavvio spariva
     * senza che nessuno se ne accorgesse.
     * Scrivendo prima, un errore blocca tutto e viene riportato subito.
     */
    // Prima su disco (in blocco), poi in memoria: se la scrittura fallisce,
    // il catalogo non cambia e l'errore viene riportato.
    const files = schede.persistMany(created);
    for (const scheda of created) schede.add(scheda);

    console.log(
      `✓ Admin: generate ${created.length} schede ${size}x${size} ${difficulty} in ${Date.now() - startedAt}ms → ${files.length} file`,
    );
    res.json({
      created: created.map(toMeta),
      total: schede.size,
      byKey: schede.countByKey(),
      savedTo: EXTRA_SCHEDE_DIR,
    });
  } catch (err) {
    // Errore di scrittura: lo diciamo chiaramente invece di dare un 500 opaco.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`✗ Admin: generazione schede fallita: ${message}`);
    const isPerm = /EACCES|EPERM|EROFS/.test(message);
    res.status(500).json({
      error: isPerm
        ? `Impossibile scrivere in ${EXTRA_SCHEDE_DIR}: permessi negati. Verifica che il volume sia montato e scrivibile (su Railway serve RAILWAY_RUN_UID=0).`
        : `Generazione fallita: ${message}`,
      savedTo: EXTRA_SCHEDE_DIR,
    });
  }
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

/* ------------------------------------------------------------------ */
/* Admin musica                                                        */
/* ------------------------------------------------------------------ */

/**
 * Elenco COMPLETO per il pannello admin: include anche le tracce spente.
 *
 * `uploaded` → tracce caricate; `all` → catalogo con `enabled`, così l'admin può
 * mostrare e riaccendere anche una traccia disabilitata (che non compare nel
 * catalogo pubblico `/music`).
 */
app.get('/admin/music', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ uploaded: musicLibrary.listUploaded(), all: musicLibrary.listAll() });
});

/**
 * Upload di un MP3.
 *
 * POST /admin/music?label=Titolo&credits=Fonte
 * Content-Type: audio/mpeg
 * Body: byte grezzi del file.
 *
 * Perché binario e non base64 nel JSON: un MP3 da 5 MB diventerebbe ~6,7 MB di
 * base64 e verrebbe riletto in memoria come stringa. Con il body grezzo e
 * `express.raw` il file resta un Buffer da 5 MB. Il limite del parser JSON (4 MB)
 * non si applica qui.
 */
app.post(
  '/admin/music',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: MUSIC_MAX_BYTES + 1024 }),
  (req, res) => {
    if (!requireAdmin(req, res)) return;
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) {
      return res.status(400).json({ error: 'File audio vuoto o formato non valido' });
    }
    if (data.length > MUSIC_MAX_BYTES) {
      return res.status(413).json({
        error: `File troppo grande (max ${Math.round(MUSIC_MAX_BYTES / 1024 / 1024)} MB)`,
      });
    }
    const mime = String(req.headers['content-type'] ?? 'audio/mpeg').split(';')[0]!.trim();
    const label = String(req.query.label ?? '').trim();
    const credits = String(req.query.credits ?? '').trim();
    try {
      const track = musicLibrary.add({ label, credits, data, mime });
      console.log(`✓ Admin: caricata traccia "${track.label}" (${track.id}, ${Math.round(data.length / 1024)} KB)`);
      res.status(201).json({ track, tracks: musicLibrary.list() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ Admin: caricamento musica fallito: ${message}`);
      res.status(500).json({ error: `Caricamento fallito: ${message}` });
    }
  },
);

/** Rimuove una traccia caricata dall'admin. */
app.delete('/admin/music/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id);
  if (!musicLibrary.remove(id)) return res.status(404).json({ error: 'Traccia non trovata' });
  console.log(`✓ Admin: rimossa traccia ${id}`);
  res.json({ ok: true, tracks: musicLibrary.list() });
});

/**
 * Accende o spegne una traccia nella playlist.
 *
 * `PUT /admin/music/:id/enabled` con body JSON `{ enabled: boolean }`.
 *
 * Perché disabilitare invece di cancellare: una traccia INCLUDITA nel bundle non
 * si può cancellare (è versionata nel client), e una caricata potrebbe servire
 * ancora. Spegnendola sparisce dal catalogo pubblico — quindi nessuno può
 * sceglierla — ma resta riaccendibile e non perde il file.
 */
app.put('/admin/music/:id/enabled', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id);
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Campo `enabled` mancante o non booleano' });
  }
  if (!musicLibrary.setEnabled(id, enabled)) {
    return res.status(404).json({ error: 'Traccia non trovata' });
  }
  console.log(`✓ Admin: traccia ${id} ${enabled ? 'attivata' : 'disattivata'}`);
  /*
   * Le stanze che stavano usando quella traccia vanno aggiornate SUBITO: senza,
   * chi è già in partita continuerebbe a sentirla finché non ricarica. La
   * sostituzione è visibile a tutti (stato della stanza + musica locale).
   */
  for (const room of registry.all()) {
    const before = room.musicId;
    room.ensureMusicExists(
      (mid) => musicLibrary.isPlayable(mid),
      musicLibrary.firstPlayable()?.id,
    );
    if (room.musicId !== before) {
      console.log(`  stanza ${room.code}: musica ${before} → ${room.musicId}`);
      broadcastState(room);
    }
  }
  res.json({ ok: true, all: musicLibrary.listAll(), tracks: musicLibrary.list() });
});

/**
 * Elimina TUTTE le partite e le statistiche (per ripartire da zero).
 *
 * Non tocca profili né schede: azzera solo la classifica. Utile quando il
 * database contiene partite di prova e si vuole pubblicare una classifica
 * pulita senza cancellare gli account.
 */
app.post('/admin/games/reset', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const removed = profiles.clearAllGames();
  console.log(`✓ Admin: azzerate ${removed} partite dalla classifica`);
  res.json({ ok: true, removed });
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

/**
 * Canale voce delle stanze (tieni premuto per parlare).
 *
 * Un'istanza sola per tutto il server: tiene solo CHI ha il microfono aperto ora
 * (nessun audio, nessuna registrazione, nessun riferimento al contenuto).
 */
const voiceRelay = new VoiceRelay();

/**
 * Byte di un pacchetto voce, qualunque sia il contenitore binario.
 *
 * Socket.IO non consegna sempre lo stesso tipo: al server Node arriva un
 * `Buffer`, al browser un `ArrayBuffer` (e un client non ufficiale potrebbe
 * mandare una vista). Qui non si indovina: si accettano tutti e tre e si misura
 * il contenuto, che è l'unica cosa che conta per la validazione.
 */
function voiceByteLength(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return 0;
}

/** Porta il pacchetto al tipo dichiarato (`ArrayBuffer`) prima di inoltrarlo. */
function toVoicePayload(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }
  return new ArrayBuffer(0);
}

const errorPayload = (code: string, message: string): ErrorPayload => ({ code, message });

/**
 * Ack "a prova di client malformato".
 *
 * Socket.IO non intercetta le eccezioni dentro i gestori: un client che emette un
 * evento SENZA callback faceva esplodere il server con "ack is not a function".
 * Non è teoria: basta `socket.emit('voice:start')` senza callback per far cadere
 * tutto il processo — partite in corso comprese (verificato scrivendo il test
 * end-to-end della voce). Con questo wrapper l'ack mancante diventa una
 * non-operazione: il client non riceve risposta, il server resta in piedi.
 */
function safeAck<T>(ack: ((res: T) => void) | undefined): (res: T) => void {
  return typeof ack === 'function' ? ack : () => {};
}

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
 * Riferimenti pubblici di un profilo per la stanza: id, foto e FASCE audio.
 *
 * Perché anche le fasce: in multiplayer gli avversari devono sapere se il
 * giocatore ha una clip registrata per una certa lunghezza di parola, così
 * possono scaricarla e suonarla (a volume ridotto) quando trova una parola.
 * Il CONTENUTO delle clip resta protetto: l'elenco delle fasce non lo rivela.
 */
function profileRefFor(profile: {
  id: string;
  hasPhoto: boolean;
  photoUpdatedAt: number | null;
}): { id: string; photoUrl: string | null; sfxSlots: SfxSlot[] } {
  return {
    id: profile.id,
    photoUrl: photoUrlFor(profile),
    sfxSlots: profiles.listSfx(profile.id).map((s) => s.slot),
  };
}

/**
 * Tetto di parole enumerate in una scheda generata dall'admin.
 * Le schede normali ne hanno molte meno; il tetto difende da griglie patologiche.
 */
const MAX_SCHEDA_WORDS = 6000;

function broadcastState(room: Room): void {
  // Una traccia caricata dall'admin può essere stata cancellata mentre la stanza
  // la usava: in quel caso si ricade sulla predefinita, così nessun client
  // resta puntato a un file che non esiste più.
  room.ensureMusicExists(
    (id) => musicLibrary.isPlayable(id),
    musicLibrary.firstPlayable()?.id,
  );
  io.to(room.code).emit('room:update', room.publicState());
}

/**
 * Lega un socket alla stanza e al giocatore.
 *
 * Estratto perché la stessa operazione serve sia all'ingresso (`room:join`) sia
 * al rientro dopo una riconnessione (`room:rejoin`): stanza Socket.IO + mapping
 * `socket.id` → { code, playerId } + id del socket sul giocatore. Duplicarla
 * significava rischiare che una delle due strade dimenticasse un pezzo, ed è
 * esattamente il tipo di omissione che produce "Non in una stanza".
 */
function attachSocketToRoom(socket: Socket, room: Room, playerId: string): void {
  socket.join(room.code);
  socketState.set(socket.id, { code: room.code, playerId });
  const player = room.players.get(playerId);
  if (player) player.socketId = socket.id;
}

/**
 * A un round in corso, reinvia griglia e scadenza a un socket che è appena
 * rientrato. Emesso in un tick successivo perché il client deve prima registrare
 * i listener (dopo l'ack di join/rejoin).
 */
function resendRoundIfPlaying(socket: Socket, room: Room): void {
  if (room.phase !== 'playing' || !room.grid) return;
  const payload = {
    round: room.currentRound,
    grid: room.grid,
    endsAt: room.roundEndsAt,
    durationMs: room.roundDurationMs,
    schedaId: room.schedaId ?? undefined,
  };
  setTimeout(() => socket.emit('game:roundStart', payload), 0);
}

/**
 * Registra TUTTE le partite multiplayer concluse nella stanza.
 *
 * Perché sul server e non nel client: il punteggio autoritativo e la parola più
 * lunga vivono qui, e in questo modo basta UNA scrittura per l'intera partita.
 * Prima le partite multiplayer non entravano mai in classifica: solo il single
 * player chiamava `POST /games`.
 *
 * Si salva una riga per giocatore con un profilo; chi gioca senza profilo non è
 * classificabile (stessa regola del single player).
 */
function recordMultiplayerGames(room: Room): void {
  if (room.gamesPersisted) return;
  // Marchiamo SUBITO: la funzione è chiamata dal timer di fine partita e da
  // `handleLeave` (abbandono durante la pausa finale). Senza questa guardia una
  // partita potrebbe essere scritta due volte.
  room.gamesPersisted = true;

  const entries: Array<{
    profileId: string;
    score: number;
    words: number;
    longest: string;
    foundWords: Array<{ word: string; points: number }>;
  }> = [];
  for (const p of room.players.values()) {
    if (!p.profileId) continue;
    // Le parole della partita sono per-round: `p.words` accumula TUTTI i round,
    // quindi è già il totale della partita.
    const foundWords = p.words.map((w) => ({ word: w.word, points: w.points }));
    entries.push({
      profileId: p.profileId,
      score: p.totalScore,
      words: foundWords.length,
      longest: foundWords.reduce((best, w) => (w.word.length > best.length ? w.word : best), ''),
      foundWords,
    });
  }
  if (entries.length === 0) return;
  try {
    const saved = profiles.recordMultiplayerGames(entries, {
      difficulty: room.difficulty,
      gridSize: room.gridSize,
      schedaId: room.schedaId,
    });
    console.log(`✓ Multiplayer: salvate ${saved} partite su ${entries.length} giocatori con profilo`);
  } catch (err) {
    console.error('✗ Multiplayer: salvataggio partite fallito:', err);
  }
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
 * Prima c'era una funzione locale con i confronti hardcoded: aggiungendo o togliendo
 * un livello restava indietro e lo rifiutava silenziosamente, ricadendo su 'normale'.
 * Usare la funzione condivisa evita che i due elenchi si disallineino.
 */

io.on('connection', (socket) => {
  socket.on('room:create', (payload, ack) => {
    ack = safeAck(ack);
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
        profile ? profileRefFor(profile) : null,
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
    ack = safeAck(ack);
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
        profile ? profileRefFor(profile) : null,
      );
      player.socketId = socket.id;
    }
    attachSocketToRoom(socket, room, playerId);
    ack({ ok: true as const, playerId, state: room.publicState() });
    broadcastState(room);

    // Reconnecting a round in corso: reinvia la griglia e la scadenza.
    // Emesso in un tick successivo, cosi' il client ha il tempo di registrare i listener
    // dopo aver ricevuto l'ack di room:join.
    if (existing) resendRoundIfPlaying(socket, room);
  });

  /**
   * Rientro dopo una riconnessione TRASPARENTE del socket.
   *
   * A differenza di `room:join`, qui il giocatore deve esistere GIÀ: non si
   * entra in una stanza nuova, si ripristina solo il legame socket ↔ giocatore
   * che Socket.IO ha perso riconnettendosi con un nuovo `socket.id`. Senza questa
   * ricostruzione `game:submitWord` rispondeva "Non in una stanza".
   */
  socket.on('room:rejoin', (payload, ack) => {
    ack = safeAck(ack);
    const code = String(payload?.code ?? '').toUpperCase().trim();
    const room = registry.get(code);
    if (!room) return ack(errorPayload('ROOM_NOT_FOUND', 'Stanza non trovata'));
    const player = payload?.playerId ? room.players.get(payload.playerId) : undefined;
    if (!player) return ack(errorPayload('PLAYER_NOT_FOUND', 'Giocatore non in stanza'));

    // Un socket precedente rimasto appeso (es. doppia connessione) non deve
    // continuare a ricevere gli eventi della stessa partita.
    const stale = player.socketId;
    if (stale && stale !== socket.id) socketState.delete(stale);

    player.connected = true;
    attachSocketToRoom(socket, room, player.id);
    ack({ ok: true as const, playerId: player.id, state: room.publicState() });
    broadcastState(room);
    resendRoundIfPlaying(socket, room);
  });

  /**
   * L'host pesca una nuova scheda per il prossimo round. Tutti la vedono in lobby,
   * così in multiplayer si gioca la STESSA scheda e nessuno è sorpreso.
   */
  socket.on('room:shuffleScheda', ({ code }) => {
    const st = socketState.get(socket.id);
    const room = registry.get(code);
    if (!room || !st || st.code !== room.code) return;
    if (st.playerId !== room.hostId) return;
    if (room.phase !== 'lobby' && room.phase !== 'roundEnd') return;
    const scheda = schede.random(room.gridSize, room.difficulty);
    if (!scheda) return;
    room.pendingSchedaId = scheda.id;
    broadcastState(room);
  });

  socket.on('room:start', ({ code }) => {
    const st = socketState.get(socket.id);
    const room = registry.get(code);
    if (!room || !st || st.code !== room.code) return;
    if (st.playerId !== room.hostId) return;
    if (room.phase !== 'lobby' && room.phase !== 'roundEnd') return;

    const startRound = () => {
      // Usa la scheda scelta in lobby se c'è (l'host l'ha vista e approvata),
      // altrimenti ne pesca una a caso. Per i round successivi al primo, se non
      // c'è una pending si pesca una scheda nuova.
      const fromPending = room.pendingSchedaId ? schede.get(room.pendingSchedaId) : undefined;
      const scheda = fromPending ?? schede.random(room.gridSize, room.difficulty);
      // La pending è consumata: il prossimo round ne pescherà una nuova.
      room.pendingSchedaId = null;
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

    /*
     * Countdown 3-2-1 a OGNI round: è parte del ritmo del gioco, non solo
     * dell'avvio. Il timer del round parte solo alla fine del countdown, così i
     * secondi di gioco non vengono consumati dal conto alla rovescia. I numeri
     * arrivano dal server (stesso valore per tutti); animazione e suoni sono
     * locali, così ognuno li sente senza ritardo di rete.
     */
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
  });

  socket.on('room:config', ({ code, gridSize, difficulty, rounds, roundDurationMs, musicId }) => {
    const st = socketState.get(socket.id);
    const room = registry.get(code);
    if (!room || !st || st.code !== room.code) return;
    if (st.playerId !== room.hostId) return;
    if (room.phase !== 'lobby') return;
    // Se cambia dimensione o difficoltà, la scheda scelta non è più valida:
    // appartiene a un'altra combinazione. La azzeriamo.
    const sizeChanged = isValidGridSize(gridSize) && gridSize !== room.gridSize;
    const diffChanged = isDifficulty(difficulty) && difficulty !== room.difficulty;
    if (sizeChanged || diffChanged) room.pendingSchedaId = null;
    if (isValidGridSize(gridSize)) room.gridSize = gridSize;
    if (isDifficulty(difficulty)) room.difficulty = difficulty;
    room.rounds = clampRounds(rounds);
    room.roundDurationMs = clampDuration(roundDurationMs);
    // La musica la scegle l'host e vale per tutti.
    if (musicId !== undefined) room.setMusic(musicId);
    broadcastState(room);
  });

  socket.on('game:submitWord', (payload, ack) => {
    ack = safeAck(ack);
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
    // Uscendo si chiude anche l'eventuale microfono aperto: lasciare il posto
    // occupato impedirebbe agli altri di parlare per i successivi 3 secondi.
    voiceRelay.forget(socket.id);
    handleLeave(socket.id, st.code, st.playerId, true);
  });

  /*
   * Voce in stanza: "tieni premuto per parlare".
   *
   * Il server fa da ponte e non conserva nulla: `start` riserva un posto,
   * `chunk` inoltra un pacchetto, `stop` lo libera. I limiti (quante voci
   * insieme, quanti pacchetti al secondo, quali dimensioni sono valide) stanno
   * tutti in `VoiceRelay`, così restano testabili senza socket.
   */
  socket.on('voice:start', (ack) => {
    ack = safeAck(ack);
    const st = socketState.get(socket.id);
    if (!st) return ack(errorPayload('NOT_IN_ROOM', 'Non in una stanza'));
    const res = voiceRelay.start(socket.id, st.code, st.playerId);
    if (!res.ok) return ack(errorPayload('VOICE_BUSY', res.message));
    ack({ ok: true });
  });

  socket.on('voice:chunk', (data) => {
    const bytes = voiceByteLength(data);
    const target = voiceRelay.chunk(socket.id, bytes);
    if (!target) return;
    /*
     * `socket.to` e non `io.to`: a chi parla la propria voce NON torna
     * indietro. Rimandarla al mittente, con le casse accese, sarebbe un eco
     * sulla propria voce a ogni frase.
     */
    socket.to(target.code).emit('voice:audio', { playerId: target.playerId, data: toVoicePayload(data) });
  });

  socket.on('voice:stop', () => voiceRelay.stop(socket.id));

  socket.on('disconnect', () => {
    const st = socketState.get(socket.id);
    // Il microfono aperto va liberato anche quando la connessione cade
    // (telefono in background, rete persa): nessuno manderà `voice:stop`.
    voiceRelay.forget(socket.id);
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
  // Chi esce dalla stanza perde anche l'eventuale microfono aperto.
  voiceRelay.forget(socketId);
  const room = registry.get(code);
  if (!room) return;
  if (explicit) {
    /*
     * Se la partita è già finita (l'ultimo round è chiuso) ma le partite non
     * sono ancora state scritte, le salviamo ORA.
     *
     * Perché serve: tra la fine dell'ultimo round e l'emissione di `game:gameEnd`
     * c'è una pausa di 10 secondi. Chi abbandona in quella finestra usciva dalla
     * stanza prima che il timer scrivesse, e la sua partita non entrava in
     * classifica. Ora l'abbandono scrive prima di rimuovere il giocatore.
     */
    if (room.isGameOver() && room.phase !== 'playing' && !room.gamesPersisted) {
      recordMultiplayerGames(room);
    }
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
        // Prima di avvisare i client, la partita viene registrata per la
        // classifica: se fallisce, il gioco continua comunque (best effort).
        recordMultiplayerGames(room);
        io.to(room.code).emit('game:gameEnd', { finalScores: room.finalScores() });
        broadcastState(room);
      }, ROUND_END_PAUSE_MS);
    }
  }, Math.max(0, room.roundEndsAt - Date.now()));
}

/**
 * Parole ATTESE presenti nella scheda che nessuno ha trovato.
 * Nessun solver: le parole arrivano pre-calcolate con la scheda.
 * Si mostrano le più lunghe (>= 5 lettere, max 20).
 *
 * Si usa l'insieme delle parole attese (fascia di difficoltà), non quello
 * accettato: l'accettato contiene tutte le parole del dizionario componibili
 * sulla griglia (centinaia, con le più rare), e il riepilogo diventerebbe un
 * elenco di parole introvabili invece di "queste le conoscevi e ti sono sfuggite".
 */
function computeMissedWords(room: Room): string[] {
  const expected = room.roundExpectedWords.size > 0 ? room.roundExpectedWords : room.roundValidWords;
  return [...expected]
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
