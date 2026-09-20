import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  MIN_WORD_LENGTH,
  solveGrid,
  type ClientToServerEvents,
  type GridSize,
  type ErrorPayload,
  type ServerToClientEvents,
} from '@boggle/shared';
import { loadServerDictionary, getDictionaryTrie } from './dictionary.js';
import { RoomRegistry, ROUND_DURATION_MS, ROUND_END_PAUSE_MS, COUNTDOWN_MS, type Room } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const dictionary = await loadServerDictionary();
const dictionaryTrie = await getDictionaryTrie();
const registry = new RoomRegistry(dictionary);

// pulizia periodica delle stanze vuote/terminate
setInterval(() => registry.cleanup(), 60_000).unref();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: 'ok', words: dictionary.size });
});

/** Serve il dizionario al client con compressione trasparente. */
const DICT_DIR = path.resolve(__dirname, '../../../packages/dictionary/data');
app.get('/dictionary/words.txt', (req, res) => {
  const accept = req.headers['accept-encoding'] ?? '';
  if (accept.includes('br')) {
    res.type('text/plain; charset=utf-8');
    res.setHeader('Content-Encoding', 'br');
    return res.sendFile(path.join(DICT_DIR, 'words.br'));
  }
  res.type('text/plain; charset=utf-8');
  res.sendFile(path.join(DICT_DIR, 'words.txt'));
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

/** Associazioni socket <-> stanza/giocatore. */
const socketState = new Map<string, { code: string; playerId: string }>();

const errorPayload = (code: string, message: string): ErrorPayload => ({ code, message });

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

io.on('connection', (socket) => {
  socket.on('room:create', (payload, ack) => {
    try {
      const gridSize = isValidGridSize(payload?.gridSize) ? payload.gridSize : 4;
      const rounds = clampRounds(payload?.rounds);
      const room = registry.create(gridSize, rounds);
      const playerId = randomUUID();
      const player = room.addPlayer(playerId, payload?.nickname ?? 'Host');
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
      const player = room.addPlayer(playerId, payload?.nickname ?? 'Giocatore');
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
        durationMs: ROUND_DURATION_MS,
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
        durationMs: ROUND_DURATION_MS,
      });
      broadcastState(room);
      scheduleRoundEnd(room);
    };

    // Countdown 3-2-1 per il primo round
    if (room.phase === 'lobby') {
      room.phase = 'countdown';
      broadcastState(room);
      for (let s = 3; s >= 1; s--) {
        setTimeout(() => io.to(room.code).emit('game:countdown', { seconds: s }), (3 - s) * 1000);
      }
      setTimeout(startRound, COUNTDOWN_MS);
    } else {
      startRound();
    }
  });

  socket.on('room:config', ({ code, gridSize, rounds }) => {
    const st = socketState.get(socket.id);
    const room = registry.get(code);
    if (!room || !st || st.code !== room.code) return;
    if (st.playerId !== room.hostId) return;
    if (room.phase !== 'lobby') return;
    if (isValidGridSize(gridSize)) room.gridSize = gridSize;
    room.rounds = clampRounds(rounds);
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
      io.to(room.code).emit('game:playerWord', {
        playerId: player.id,
        nickname: player.nickname,
        word: result.word!,
        points: result.points!,
        score: player.totalScore,
      });
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
  setTimeout(() => {
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
 * Parole valide presenti nella griglia che nessuno ha trovato.
 * Usa il solver con trie (packages/shared) e filtra le parole piu' interessanti
 * (>= 5 lettere, max 20).
 */
function computeMissedWords(room: Room): string[] {
  if (!room.grid) return [];
  const all = solveGrid(room.grid, dictionaryTrie, { limit: 400, minLength: MIN_WORD_LENGTH });
  return all
    .filter((w) => w.length >= 5 && !room.roundFoundWords.has(w))
    .slice(0, 20);
}

httpServer.listen(PORT, () => {
  console.log(`✓ Boggle-IT server su http://localhost:${PORT}  (client: ${CLIENT_ORIGIN})`);
  console.log(`  parole in dizionario: ${dictionary.size.toLocaleString('it-IT')}`);
});
