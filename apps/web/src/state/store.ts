import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Difficulty,
  Grid,
  GridSize,
  MusicId,
  PlayerPublic,
  ProfilePrivate,
  RoomState,
  RoundResultEntry,
  SfxSlot,
} from '@boggle/shared';
import { SFX_SLOTS } from '@boggle/shared';
import { audio, type AudioSettings } from '../audio/AudioEngine.js';
import { DEFAULT_AVATAR, avatarFromNickname, type Avatar } from '../avatars.js';
import { getSocket, SERVER_BASE } from '../net/socket.js';
import {
  activeToken,
  getActiveProfile,
  listProfiles,
  removeProfile,
  saveProfile,
  setActiveProfile,
  updateSavedProfile,
  type SavedProfile,
} from '../game/profileStore.js';

export type Screen =
  | 'home'
  | 'solo-setup'
  | 'solo-game'
  | 'lobby'
  | 'mp-game'
  | 'summary'
  | 'scheda'
  | 'admin'
  | 'profiles'
  | 'profile'
  | 'changelog';

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
  avatar: Avatar;
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
  /** Id della scheda del round corrente in multiplayer. */
  currentSchedaId: string | null;
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
  /** Profilo attivo (loggato) e profili salvati sul dispositivo. */
  profiles: SavedProfile[];
  activeProfileId: string | null;
  profile: ProfilePrivate | null;
  /** URL delle clip audio personali, per fascia. */
  sfxUrls: Partial<Record<SfxSlot, string>>;
  profileBusy: boolean;
  profileError: string | null;

  setScreen: (s: Screen) => void;
  refreshProfiles: () => void;
  /** Applica un profilo salvato a store e motore audio. */
  applyActiveProfile: (saved: SavedProfile | null) => void;
  switchProfile: (id: string) => Promise<void>;
  registerProfile: (nickname: string, password: string) => Promise<void>;
  loginProfile: (nickname: string, password: string) => Promise<void>;
  logoutProfile: () => Promise<void>;
  deleteProfile: (id: string) => void;
  setProfileAvatar: (avatar: string) => Promise<void>;
  saveProfilePhoto: (dataUrl: string | null) => Promise<void>;
  saveProfileSfx: (slot: SfxSlot, dataUrl: string, durationMs: number) => Promise<void>;
  deleteProfileSfx: (slot: SfxSlot) => Promise<void>;
  setProfileMusic: (musicId: MusicId | 'none') => Promise<void>;
  /** Scheda da mostrare nella pagina scheda (id dal catalogo). */
  schedaId: string | null;
  setSchedaId: (id: string | null) => void;
  /** Token admin, persistito in localStorage. */
  adminToken: string;
  setAdminToken: (t: string) => void;
  setNickname: (n: string) => void;
  setAvatar: (a: Avatar) => void;
  setSoloSetup: (gridSize: GridSize, difficulty: Difficulty, rounds: number, roundDurationMs: number) => void;
  setAudioSettings: (next: Partial<AudioSettings>) => void;
  createRoom: (gridSize: GridSize, difficulty: Difficulty, rounds: number, roundDurationMs: number) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  startRoom: () => void;
  configureRoom: (
    gridSize: GridSize,
    difficulty: Difficulty,
    rounds: number,
    roundDurationMs: number,
    musicId?: MusicId | 'none',
  ) => void;
  submitWord: (word: string, path: number[]) => Promise<{ accepted: boolean; reason?: string; points?: number; unique?: boolean }>;
  leaveRoom: () => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'home',
      nickname: '',
      avatar: DEFAULT_AVATAR,
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
      currentSchedaId: null,
      roundEndsAt: 0,
      roundDurationMs: 180_000,
      countdown: null,
      opponentEvents: [],
      liveWords: [],
      roundResults: null,
      missedWords: [],
      finalScores: null,
      errorMessage: null,
      schedaId: null,
      adminToken: '',
      profiles: listProfiles(),
      activeProfileId: getActiveProfile()?.id ?? null,
      profile: getActiveProfile()?.profile ?? null,
      sfxUrls: {},
      profileBusy: false,
      profileError: null,

      setScreen: (screen) => set({ screen }),
      setSchedaId: (schedaId) => set({ schedaId }),
      setAdminToken: (adminToken) => set({ adminToken }),
      refreshProfiles: () =>
        set({ profiles: listProfiles(), activeProfileId: getActiveProfile()?.id ?? null }),

      /** Applica un profilo attivo a store + audio (nome, avatar, clip, musica). */
      applyActiveProfile: (() => {
        const apply = (saved: SavedProfile | null) => {
          if (!saved) return;
          const sfxUrls: Partial<Record<SfxSlot, string>> = {};
          for (const clip of saved.profile.sfx) sfxUrls[clip.slot] = `${SERVER_BASE}${clip.url}`;
          audio.setPersonalClips(
            SFX_SLOTS.filter((slot) => sfxUrls[slot]).map((slot) => ({ slot, url: sfxUrls[slot]! })),
          );
          if (saved.profile.musicId !== undefined) {
            audio.setMusicTrack(saved.profile.musicId);
            set({ audioSettings: audio.getSettings() });
          }
          set({
            nickname: saved.profile.nickname,
            avatar: (saved.profile.avatar as Avatar) ?? DEFAULT_AVATAR,
            profile: saved.profile,
            sfxUrls,
            activeProfileId: saved.id,
            profiles: listProfiles(),
          });
        };
        return apply;
      })(),

      switchProfile: async (id) => {
        const saved = listProfiles().find((p) => p.id === id);
        if (!saved) return;
        setActiveProfile(id);
        set({ profileBusy: true, profileError: null });
        try {
          // Ricarica il profilo dal server per avere clip e foto aggiornate.
          const res = await fetch(`${SERVER_BASE}/me`, {
            headers: { Authorization: `Bearer ${saved.token}` },
          });
          if (res.ok) {
            const profile = (await res.json()) as ProfilePrivate;
            updateSavedProfile(id, {
              profile,
              nickname: profile.nickname,
              avatar: profile.avatar,
              photoUrl: profile.photoUrl,
            });
          } else if (res.status === 401) {
            // Token scaduto: il profilo locale resta ma va rifatto il login.
            set({ profileError: 'Sessione scaduta: accedi di nuovo' });
          }
          const fresh = listProfiles().find((p) => p.id === id) ?? saved;
          get().applyActiveProfile(fresh);
        } catch {
          set({ profileError: 'Server non raggiungibile: uso i dati locali' });
          get().applyActiveProfile(saved);
        } finally {
          set({ profileBusy: false });
        }
      },

      registerProfile: async (nickname, password) => {
        set({ profileBusy: true, profileError: null });
        try {
          const res = await fetch(`${SERVER_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, password, avatar: get().avatar }),
          });
          const body = (await res.json()) as { token?: string; profile?: ProfilePrivate; error?: string };
          if (!res.ok || !body.token || !body.profile) {
            throw new Error(body.error ?? 'Registrazione non riuscita');
          }
          const entry: SavedProfile = {
            id: body.profile.id,
            token: body.token,
            nickname: body.profile.nickname,
            avatar: body.profile.avatar,
            photoUrl: body.profile.photoUrl,
            profile: body.profile,
          };
          saveProfile(entry);
          get().applyActiveProfile(entry);
        } catch (err) {
          set({ profileError: err instanceof Error ? err.message : String(err) });
          throw err;
        } finally {
          set({ profileBusy: false });
        }
      },

      loginProfile: async (nickname, password) => {
        set({ profileBusy: true, profileError: null });
        try {
          const res = await fetch(`${SERVER_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, password }),
          });
          const body = (await res.json()) as { token?: string; profile?: ProfilePrivate; error?: string };
          if (!res.ok || !body.token || !body.profile) {
            throw new Error(body.error ?? 'Accesso non riuscito');
          }
          const entry: SavedProfile = {
            id: body.profile.id,
            token: body.token,
            nickname: body.profile.nickname,
            avatar: body.profile.avatar,
            photoUrl: body.profile.photoUrl,
            profile: body.profile,
          };
          saveProfile(entry);
          get().applyActiveProfile(entry);
        } catch (err) {
          set({ profileError: err instanceof Error ? err.message : String(err) });
          throw err;
        } finally {
          set({ profileBusy: false });
        }
      },

      logoutProfile: async () => {
        const token = activeToken();
        if (token) {
          void fetch(`${SERVER_BASE}/auth/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => undefined);
        }
        const id = get().activeProfileId;
        if (id) removeProfile(id);
        audio.setPersonalClips([]);
        const next = getActiveProfile();
        if (next) {
          get().applyActiveProfile(next);
        } else {
          set({
            profile: null,
            activeProfileId: null,
            profiles: listProfiles(),
            sfxUrls: {},
            nickname: '',
            avatar: DEFAULT_AVATAR,
          });
        }
      },

      deleteProfile: (id) => {
        removeProfile(id);
        const next = getActiveProfile();
        if (next) get().applyActiveProfile(next);
        else set({ profile: null, activeProfileId: null, profiles: listProfiles(), sfxUrls: {} });
      },

      setProfileAvatar: async (avatar) => {
        const token = activeToken();
        if (!token) return;
        set({ profileBusy: true, profileError: null });
        try {
          const res = await fetch(`${SERVER_BASE}/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ avatar }),
          });
          if (!res.ok) throw new Error('Aggiornamento non riuscito');
          const profile = (await res.json()) as ProfilePrivate;
          const id = get().activeProfileId;
          if (id) updateSavedProfile(id, { profile, avatar: profile.avatar });
          set({ profile, avatar: profile.avatar as Avatar });
        } catch (err) {
          set({ profileError: err instanceof Error ? err.message : String(err) });
        } finally {
          set({ profileBusy: false });
        }
      },

      saveProfilePhoto: async (dataUrl) => {
        const token = activeToken();
        const id = get().activeProfileId;
        if (!token || !id) return;
        set({ profileBusy: true, profileError: null });
        try {
          if (dataUrl === null) {
            await fetch(`${SERVER_BASE}/me/photo`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
          } else {
            const res = await fetch(`${SERVER_BASE}/me/photo`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ dataUrl }),
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(body.error ?? 'Salvataggio non riuscito');
            }
          }
          // Rilegge il profilo: l'URL della foto ha un parametro di versione.
          const me = await fetch(`${SERVER_BASE}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (me.ok) {
            const profile = (await me.json()) as ProfilePrivate;
            updateSavedProfile(id, { profile, photoUrl: profile.photoUrl });
            set({ profile });
          }
        } catch (err) {
          set({ profileError: err instanceof Error ? err.message : String(err) });
          throw err;
        } finally {
          set({ profileBusy: false });
        }
      },

      saveProfileSfx: async (slot, dataUrl, durationMs) => {
        const token = activeToken();
        const id = get().activeProfileId;
        if (!token || !id) return;
        set({ profileBusy: true, profileError: null });
        try {
          const res = await fetch(`${SERVER_BASE}/me/sfx/${slot}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ dataUrl, durationMs }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? 'Salvataggio non riuscito');
          }
          const me = await fetch(`${SERVER_BASE}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (me.ok) {
            const profile = (await me.json()) as ProfilePrivate;
            const sfxUrls: Partial<Record<SfxSlot, string>> = { ...get().sfxUrls };
            const clip = profile.sfx.find((c) => c.slot === slot);
            if (clip) sfxUrls[slot] = `${SERVER_BASE}${clip.url}`;
            audio.setPersonalClip(slot, `${SERVER_BASE}${clip?.url ?? ''}`);
            updateSavedProfile(id, { profile });
            set({ profile, sfxUrls });
          }
        } catch (err) {
          set({ profileError: err instanceof Error ? err.message : String(err) });
          throw err;
        } finally {
          set({ profileBusy: false });
        }
      },

      deleteProfileSfx: async (slot) => {
        const token = activeToken();
        const id = get().activeProfileId;
        if (!token || !id) return;
        set({ profileBusy: true, profileError: null });
        try {
          await fetch(`${SERVER_BASE}/me/sfx/${slot}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          audio.clearPersonalClip(slot);
          const me = await fetch(`${SERVER_BASE}/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (me.ok) {
            const profile = (await me.json()) as ProfilePrivate;
            const sfxUrls = { ...get().sfxUrls };
            delete sfxUrls[slot];
            updateSavedProfile(id, { profile });
            set({ profile, sfxUrls });
          }
        } catch (err) {
          set({ profileError: err instanceof Error ? err.message : String(err) });
        } finally {
          set({ profileBusy: false });
        }
      },

      setProfileMusic: async (musicId) => {
        audio.setMusicTrack(musicId);
        set({ audioSettings: audio.getSettings() });
        const token = activeToken();
        const id = get().activeProfileId;
        if (!token || !id) return;
        try {
          const res = await fetch(`${SERVER_BASE}/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ musicId }),
          });
          if (res.ok) {
            const profile = (await res.json()) as ProfilePrivate;
            updateSavedProfile(id, { profile });
            set({ profile });
          }
        } catch {
          // La preferenza è già applicata localmente: il salvataggio può attendere.
        }
      },

      setNickname: (nickname) => set({ nickname: nickname.slice(0, 20) }),
      setAvatar: (avatar) => set({ avatar }),
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
        const avatar = get().avatar || avatarFromNickname(nickname);
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            'room:create',
            { nickname, avatar, gridSize, difficulty, rounds, roundDurationMs, token: activeToken() ?? undefined },
            (res) => {
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
            },
          );
        });
      },

      joinRoom: async (code) => {
        const socket = getSocket();
        const nickname = get().nickname || 'Giocatore';
        const avatar = get().avatar || avatarFromNickname(nickname);
        const upperCode = code.toUpperCase();
        // Riconnessione solo verso la stessa stanza, non verso un'altra partita.
        const playerId = get().playerIds[upperCode];
        await new Promise<void>((resolve, reject) => {
          socket.emit('room:join', { code: upperCode, nickname, avatar, playerId, token: activeToken() ?? undefined }, (res) => {
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

      configureRoom: (gridSize, difficulty, rounds, roundDurationMs, musicId) => {
        const code = get().roomCode;
        if (!code) return;
        getSocket().emit('room:config', { code, gridSize, difficulty, rounds, roundDurationMs, musicId });
      },

      submitWord: async (word, path) => {
        const socket = getSocket();
        return new Promise((resolve) => {
          socket.emit('game:submitWord', { word, path }, (res) => {
            resolve({
              accepted: res.accepted,
              reason: res.reason,
              points: res.points,
              unique: res.unique,
            });
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
        avatar: s.avatar,
        soloGridSize: s.soloGridSize,
        soloDifficulty: s.soloDifficulty,
        soloRounds: s.soloRounds,
        soloRoundDurationMs: s.soloRoundDurationMs,
        audioSettings: s.audioSettings,
        playerIds: s.playerIds,
        adminToken: s.adminToken,
      }),
    },
  ),
);

/** Collega gli eventi Socket.IO allo store. Da chiamare una volta in App. */
export function bindSocketEvents(): () => void {
  const socket = getSocket();
  const set = useAppStore.setState;

  const onRoomUpdate = (room: RoomState) => {
    // In multiplayer la musica la scegle l'host: vince sulla preferenza locale.
    if (room.musicId !== undefined) {
      audio.setMusicTrack(room.musicId);
      useAppStore.setState({ audioSettings: audio.getSettings() });
    }
    set({ room });
  };
  const onRoundStart = (p: { grid: Grid; endsAt: number; durationMs: number; schedaId?: string }) =>
    set({
      grid: p.grid,
      currentSchedaId: p.schedaId ?? null,
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
