import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Grid, GridSize, PlayerPublic, RoomState, RoundResultEntry } from '@boggle/shared';
import { getSocket } from '../net/socket.js';

export type Screen = 'home' | 'solo-setup' | 'solo-game' | 'lobby' | 'mp-game' | 'summary';

interface AppState {
  screen: Screen;
  nickname: string;
  // single player
  soloGridSize: GridSize;
  soloRounds: number;
  // multiplayer
  roomCode: string | null;
  playerId: string | null;
  /** Mappa codice stanza -> playerId, per riconnessione dopo refresh. */
  playerIds: Record<string, string>;
  room: RoomState | null;
  grid: Grid | null;
  roundEndsAt: number;
  roundDurationMs: number;
  countdown: number | null;
  liveWords: { playerId: string; nickname: string; word: string; points: number }[];
  roundResults: RoundResultEntry[] | null;
  missedWords: string[];
  finalScores: RoundResultEntry[] | null;
  errorMessage: string | null;

  setScreen: (s: Screen) => void;
  setNickname: (n: string) => void;
  setSoloSetup: (gridSize: GridSize, rounds: number) => void;
  createRoom: (gridSize: GridSize, rounds: number) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  startRoom: () => void;
  configureRoom: (gridSize: GridSize, rounds: number) => void;
  submitWord: (word: string, path: number[]) => Promise<{ accepted: boolean; reason?: string }>;
  leaveRoom: () => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'home',
      nickname: '',
      soloGridSize: 4,
      soloRounds: 3,
      roomCode: null,
      playerId: null,
      playerIds: {},
      room: null,
      grid: null,
      roundEndsAt: 0,
      roundDurationMs: 180_000,
      countdown: null,
      liveWords: [],
      roundResults: null,
      missedWords: [],
      finalScores: null,
      errorMessage: null,

      setScreen: (screen) => set({ screen }),
      setNickname: (nickname) => set({ nickname: nickname.slice(0, 20) }),
      setSoloSetup: (gridSize, rounds) => set({ soloGridSize: gridSize, soloRounds: rounds }),

      createRoom: async (gridSize, rounds) => {
        const socket = getSocket();
        const nickname = get().nickname || 'Host';
        await new Promise<void>((resolve, reject) => {
          socket.emit('room:create', { nickname, gridSize, rounds }, (res) => {
            if ('ok' in res && res.ok) {
              set((s) => ({
                roomCode: res.roomCode,
                playerId: res.playerId,
                playerIds: { ...s.playerIds, [res.roomCode]: res.playerId },
                room: res.state,
                screen: 'lobby',
              }));
              resolve();
            } else {
              set({ errorMessage: 'message' in res ? res.message : 'Errore' });
              reject(new Error('create failed'));
            }
          });
        });
      },

      joinRoom: async (code) => {
        const socket = getSocket();
        const nickname = get().nickname || 'Giocatore';
        const upperCode = code.toUpperCase();
        // Riconnessione solo verso la stessa stanza, non verso un'altra partita.
        const playerId = get().playerIds[upperCode];
        await new Promise<void>((resolve, reject) => {
          socket.emit('room:join', { code: upperCode, nickname, playerId }, (res) => {
            if ('ok' in res && res.ok) {
              set((s) => ({
                roomCode: res.state.code,
                playerId: res.playerId,
                playerIds: { ...s.playerIds, [res.state.code]: res.playerId },
                room: res.state,
                screen: 'lobby',
              }));
              resolve();
            } else {
              set({ errorMessage: 'message' in res ? res.message : 'Errore' });
              reject(new Error('join failed'));
            }
          });
        });
      },

      startRoom: () => {
        const code = get().roomCode;
        if (!code) return;
        getSocket().emit('room:start', { code });
      },

      configureRoom: (gridSize, rounds) => {
        const code = get().roomCode;
        if (!code) return;
        getSocket().emit('room:config', { code, gridSize, rounds });
      },

      submitWord: async (word, path) => {
        const socket = getSocket();
        return new Promise((resolve) => {
          socket.emit('game:submitWord', { word, path }, (res) => {
            resolve({ accepted: res.accepted, reason: res.reason });
          });
        });
      },

      leaveRoom: () => {
        const code = get().roomCode;
        if (code) getSocket().emit('room:leave', { code });
        set({
          roomCode: null,
          room: null,
          grid: null,
          roundResults: null,
          finalScores: null,
          liveWords: [],
          screen: 'home',
        });
      },

      clearError: () => set({ errorMessage: null }),
    }),
    {
      name: 'boggle-it',
      partialize: (s) => ({
        nickname: s.nickname,
        soloGridSize: s.soloGridSize,
        soloRounds: s.soloRounds,
        playerIds: s.playerIds,
      }),
    },
  ),
);

/** Collega gli eventi Socket.IO allo store. Da chiamare una volta in App. */
export function bindSocketEvents(): () => void {
  const socket = getSocket();
  const set = useAppStore.setState;

  const onRoomUpdate = (room: RoomState) => set({ room });
  const onRoundStart = (p: { grid: Grid; endsAt: number; durationMs: number }) =>
    set({
      grid: p.grid,
      roundEndsAt: p.endsAt,
      roundDurationMs: p.durationMs,
      roundResults: null,
      missedWords: [],
      liveWords: [],
      countdown: null,
      screen: 'mp-game',
    });
  const onPlayerWord = (p: { playerId: string; nickname: string; word: string; points: number }) =>
    set((s) => ({ liveWords: [...s.liveWords, { playerId: p.playerId, nickname: p.nickname, word: p.word, points: p.points }] }));
  const onRoundEnd = (p: { results: RoundResultEntry[]; missedWords: string[] }) =>
    set({ roundResults: p.results, missedWords: p.missedWords, screen: 'summary' });
  const onGameEnd = (p: { finalScores: RoundResultEntry[] }) => set({ finalScores: p.finalScores, screen: 'summary' });
  const onCountdown = (p: { seconds: number }) => set({ countdown: p.seconds });
  const onError = (p: { message: string }) => set({ errorMessage: p.message });

  socket.on('room:update', onRoomUpdate);
  socket.on('game:roundStart', onRoundStart);
  socket.on('game:playerWord', onPlayerWord);
  socket.on('game:roundEnd', onRoundEnd);
  socket.on('game:gameEnd', onGameEnd);
  socket.on('game:countdown', onCountdown);
  socket.on('error', onError);

  return () => {
    socket.off('room:update', onRoomUpdate);
    socket.off('game:roundStart', onRoundStart);
    socket.off('game:playerWord', onPlayerWord);
    socket.off('game:roundEnd', onRoundEnd);
    socket.off('game:gameEnd', onGameEnd);
    socket.off('game:countdown', onCountdown);
    socket.off('error', onError);
  };
}

export type { PlayerPublic };
