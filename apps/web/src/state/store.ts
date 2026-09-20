import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Difficulty, Grid, GridSize, PlayerPublic, RoomState, RoundResultEntry } from '@boggle/shared';
import { audio, type AudioSettings } from '../audio/AudioEngine.js';
import { getSocket } from '../net/socket.js';

export type Screen = 'home' | 'solo-setup' | 'solo-game' | 'lobby' | 'mp-game' | 'summary';

/**
 * Notifica di una parola trovata da un avversario.
 * La parola NON è inclusa (il server la nasconde): solo punti e lunghezza,
 * così il client mostra "+2" accanto al nome e sceglie il suono giusto.
 */
export interface OpponentEvent {
  id: number;
  playerId: string;
  nickname: string;
  points: number;
  wordLength: number;
  at: number;
}

interface AppState {
  screen: Screen;
  nickname: string;
  // single player
  soloGridSize: GridSize;
  soloDifficulty: Difficulty;
  soloRoundDurationMs: number;
  soloRounds: number;
  // audio
  audioSettings: AudioSettings;
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
  /**
   * Eventi di parole trovate dagli avversari. NON contengono la parola:
   * solo chi, quanti punti e la lunghezza (per scegliere il suono).
   */
  opponentEvents: OpponentEvent[];
  /** Riassunto per giocatore: punti guadagnati di recente (per il badge "+2"). */
  liveWords: { playerId: string; nickname: string; word: string; points: number; wordLength: number }[];
  roundResults: RoundResultEntry[] | null;
  missedWords: string[];
  finalScores: RoundResultEntry[] | null;
  errorMessage: string | null;

  setScreen: (s: Screen) => void;
  setNickname: (n: string) => void;
  setSoloSetup: (gridSize: GridSize, difficulty: Difficulty, rounds: number, roundDurationMs: number) => void;
  setAudioSettings: (next: Partial<AudioSettings>) => void;
  createRoom: (gridSize: GridSize, difficulty: Difficulty, rounds: number, roundDurationMs: number) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  startRoom: () => void;
  configureRoom: (gridSize: GridSize, difficulty: Difficulty, rounds: number, roundDurationMs: number) => void;
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
      soloDifficulty: 'normale',
      soloRoundDurationMs: 180_000,
      soloRounds: 3,
      audioSettings: audio.getSettings(),
      roomCode: null,
      playerId: null,
      playerIds: {},
      room: null,
      grid: null,
      roundEndsAt: 0,
      roundDurationMs: 180_000,
      countdown: null,
      opponentEvents: [],
      liveWords: [],
      roundResults: null,
      missedWords: [],
      finalScores: null,
      errorMessage: null,

      setScreen: (screen) => set({ screen }),
      setNickname: (nickname) => set({ nickname: nickname.slice(0, 20) }),
      setSoloSetup: (gridSize, difficulty, rounds, roundDurationMs) =>
        set({
          soloGridSize: gridSize,
          soloDifficulty: difficulty,
          soloRounds: rounds,
          soloRoundDurationMs: roundDurationMs,
        }),

      setAudioSettings: (next) => {
        audio.setSettings(next);
        set({ audioSettings: audio.getSettings() });
      },

      createRoom: async (gridSize, difficulty, rounds, roundDurationMs) => {
        const socket = getSocket();
        const nickname = get().nickname || 'Host';
        await new Promise<void>((resolve, reject) => {
          socket.emit('room:create', { nickname, gridSize, difficulty, rounds, roundDurationMs }, (res) => {
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

      configureRoom: (gridSize, difficulty, rounds, roundDurationMs) => {
        const code = get().roomCode;
        if (!code) return;
        getSocket().emit('room:config', { code, gridSize, difficulty, rounds, roundDurationMs });
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
          opponentEvents: [],
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
        soloDifficulty: s.soloDifficulty,
        soloRounds: s.soloRounds,
        soloRoundDurationMs: s.soloRoundDurationMs,
        audioSettings: s.audioSettings,
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
      opponentEvents: [],
      countdown: null,
      screen: 'mp-game',
    });
  const onPlayerWord = (p: {
    playerId: string;
    nickname: string;
    word: string;
    wordLength: number;
    points: number;
    self: boolean;
  }) =>
    set((s) => {
      const liveWords = [
        ...s.liveWords,
        { playerId: p.playerId, nickname: p.nickname, word: p.word, points: p.points, wordLength: p.wordLength },
      ];
      if (p.self) return { liveWords };
      // Avversario: aggiungi una notifica "+N" accanto al nome e suona un ding discreto.
      audio.play('opponent');
      const opponentEvents = [
        ...s.opponentEvents,
        {
          id: Date.now() + Math.random(),
          playerId: p.playerId,
          nickname: p.nickname,
          points: p.points,
          wordLength: p.wordLength,
          at: Date.now(),
        },
      ];
      return { liveWords, opponentEvents };
    });
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
