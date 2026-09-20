import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  generateGrid,
  MIN_WORD_LENGTH,
  solveGrid,
  type Grid,
  type ClientToServerEvents,
  type Difficulty,
  type GridSize,
  type ErrorPayload,
  type ServerToClientEvents,
} from '@boggle/shared';
import { loadServerDictionary, getDictionaryTrie } from './dictionary.js';
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

// pulizia periodica delle stanze vuote/terminate
setInterval(() => registry.cleanup(), 60_000).unref();

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

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
// (monolite same-origin). Il fallback SPA viene aggiunto in FONDO, dopo tutte le
// rotte API: altrimenti catturerebbe /preview restituendo index.html.
const WEB_DIST = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.resolve(__dirname, '../../web/dist');
const servesWeb = existsSync(path.join(WEB_DIST, 'index.html'));
if (servesWeb) {
  app.use(express.static(WEB_DIST, { maxAge: '1h', index: false }));
}

/**
 * Anteprima: genera una griglia reale con le impostazioni richieste e la risolve
 * col trie, per mostrare quante parole si possono trovare.
 *
 * GET /preview?gridSize=4&difficulty=normale
 * -> { gridSize, difficulty, grid: string[], wordCount, sampleWords, truncated }
 *
 * Il solver è limitato: per il conteggio esatto usiamo un tetto alto, ma su griglie
 * 6x6 il numero può superare il tetto. In quel caso `truncated: true` e il client
 * mostra "oltre N".
 */
app.get('/preview', async (req, res) => {
  const gridSizeRaw = Number(req.query.gridSize);
  const gridSize: GridSize = gridSizeRaw === 5 || gridSizeRaw === 6 ? gridSizeRaw : 4;
  const difficultyRaw = String(req.query.difficulty ?? 'normale');
  const difficulty: Difficulty = isValidDifficulty(difficultyRaw) ? difficultyRaw : 'normale';

  const grid = generateGrid(gridSize, Math.random, difficulty);

  let wordCount = 0;
  let truncated = false;
  let sampleWords: string[] = [];
  try {
    const trie = await getDictionaryTrie();
    const found = solveGrid(grid, trie, { limit: PREVIEW_SOLVE_LIMIT, minLength: MIN_WORD_LENGTH });
    wordCount = found.length;
    truncated = found.length >= PREVIEW_SOLVE_LIMIT;
    sampleWords = [...found].sort((a, b) => b.length - a.length).slice(0, 8);
  } catch {
    // Se il solver non è disponibile mostriamo comunque la griglia.
    return res.json({ gridSize, difficulty, grid: gridToLetters(grid), wordCount: null, sampleWords: [], truncated: false });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.json({ gridSize, difficulty, grid: gridToLetters(grid), wordCount, sampleWords, truncated });
});

/** Riga di lettere per la griglia (usata dall'anteprima). */
function gridToLetters(grid: Grid): string[] {
  const rows: string[] = [];
  for (let r = 0; r < grid.size; r++) {
    rows.push(
      grid.tiles
        .filter((t) => t.row === r)
        .map((t) => t.display)
        .join(''),
    );
  }
  return rows;
}

// Fallback SPA: tutte le rotte non-API vanno a index.html.
// Aggiunto DOPO le rotte API (preview, dictionary, health) per non oscurarle.
if (servesWeb) {
  app.get(/^\/(?!socket\.io|dictionary|health|preview).*/, (_req, res) => {
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

/**
 * Tetto di parole enumerate dall'anteprima. Su griglie grandi il numero reale può
 * superarlo: in quel caso il client mostra "oltre N" invece di un valore sbagliato.
 */
const PREVIEW_SOLVE_LIMIT = 600;

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

function isValidDifficulty(v: unknown): v is Difficulty {
  return v === 'molto-facile' || v === 'facile' || v === 'normale' || v === 'difficile';
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload, ack) => {
    try {
      const gridSize = isValidGridSize(payload?.gridSize) ? payload.gridSize : 4;
      const rounds = clampRounds(payload?.rounds);
      const difficulty = isValidDifficulty(payload?.difficulty) ? payload.difficulty : 'normale';
      const roundDurationMs = clampDuration(payload?.roundDurationMs);
      const room = registry.create(gridSize, rounds, difficulty, roundDurationMs);
      const playerId = randomUUID();
      const player = room.addPlayer(playerId, payload?.nickname ?? 'Host', payload?.avatar);
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
      playerId = randomUUID();
      const player = room.addPlayer(playerId, payload?.nickname ?? 'Giocatore', payload?.avatar);
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
      const { grid, endsAt } = room.startRound();
      io.to(room.code).emit('game:roundStart', {
        round: room.currentRound,
        grid,
        endsAt,
        durationMs: room.roundDurationMs,
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

  socket.on('room:config', ({ code, gridSize, difficulty, rounds, roundDurationMs }) => {
    const st = socketState.get(socket.id);
    const room = registry.get(code);
    if (!room || !st || st.code !== room.code) return;
    if (st.playerId !== room.hostId) return;
    if (room.phase !== 'lobby') return;
    if (isValidGridSize(gridSize)) room.gridSize = gridSize;
    if (isValidDifficulty(difficulty)) room.difficulty = difficulty;
    room.rounds = clampRounds(rounds);
    room.roundDurationMs = clampDuration(roundDurationMs);
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
    // Il trie e' lazy: viene costruito qui, solo quando serve davvero.
    const missed = await computeMissedWords(room);
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
 * Parole valide presenti nella griglia che nessuno ha trovato.
 * Usa il solver con trie (packages/shared) e filtra le parole piu' interessanti
 * (>= 5 lettere, max 20).
 */
async function computeMissedWords(room: Room): Promise<string[]> {
  if (!room.grid) return [];
  const trie = await getDictionaryTrie();
  const all = solveGrid(room.grid, trie, { limit: 400, minLength: MIN_WORD_LENGTH });
  return all.filter((w) => w.length >= 5 && !room.roundFoundWords.has(w)).slice(0, 20);
}

httpServer.listen(PORT, () => {
  console.log(`✓ Boggle-IT server su http://localhost:${PORT}`);
  console.log(`  origini client consentite: ${CLIENT_ORIGINS.join(', ')}`);
  console.log(`  parole in dizionario: ${dictionary.size.toLocaleString('it-IT')}`);
  const mem = (process.memoryUsage().rss / 1048576).toFixed(0);
  console.log(`  RSS all'avvio: ${mem} MB (trie del solver non ancora costruito)`);
});
