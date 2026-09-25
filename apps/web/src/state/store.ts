import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Difficulty,
  Grid,
  GridSize,
  MusicChoice,
  MusicTrackMeta,
  PlayerPublic,
  ProfilePrivate,
  RoomState,
  RoundResultEntry,
  SfxSlot,
  VoiceAudioPayload,
} from '@boggle/shared';
import { audio, type AudioSettings } from '../audio/AudioEngine.js';
import { DEFAULT_AVATAR, avatarFromNickname, type Avatar } from '../avatars.js';
import { getSocket, SERVER_BASE } from '../net/socket.js';
import { voiceChat } from '../net/voiceChat.js';

/**
 * Scarica una clip audio AUTENTICATA e restituisce un blob URL riproducibile.
 *
 * Perche' non un semplice `<audio src>`: l'endpoint `/profiles/:id/sfx/:slot` è
 * protetto (le clip sono accessibili al proprietario e a chi condivide la stanza),
 * e un tag `<audio>` NON invia l'header `Authorization`. Risultato: 401 e
 * silenzio, senza alcun errore visibile. Con fetch + blob il token viaggia
 * nell'header e la clip diventa locale.
 */
async function fetchClipBlobUrl(url: string, token: string): Promise<string> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Clip non disponibile (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

/*
 * Clip audio degli AVVERSARI (una cache per id giocatore della stanza).
 *
 * Perché una cache a parte: le clip del profilo attivo vivono in `sfxUrls` e
 * vengono suonate quando troviamo una parola; queste servono quando la parola
 * la trova un avversario. Tenerle separate evita che le une sovrascrivano le
 * altre (era il bug: si sentiva sempre la propria registrazione).
 *
 * I blob vanno revocati quando si esce dalla stanza o un giocatore se ne va.
 */
const opponentClipUrls = new Map<string, Map<SfxSlot, string>>();

function clearOpponentClipCache(): void {
  for (const bank of opponentClipUrls.values()) {
    for (const url of bank.values()) URL.revokeObjectURL(url);
  }
  opponentClipUrls.clear();
  audio.clearAllOpponentClips();
}

/**
 * Scarica le clip degli avversari presenti in stanza e le registra nel motore audio.
 *
 * Chiamata a ogni `room:update` (quindi già in lobby): le clip sono piccole
 * (~12 KB l'una) e averle pronte all'inizio del round evita un silenzio nei
 * primi secondi di gioco. Chi ha già le clip in cache non viene ri-scaricato.
 * Chi non ha profilo o non ha registrato nulla usa il suono sintetizzato.
 */
async function syncOpponentClips(
  room: RoomState | null,
  selfPlayerId: string | null,
  token: string | null,
): Promise<void> {
  if (!room) {
    clearOpponentClipCache();
    return;
  }
  if (!token) return;

  const present = new Set<string>();
  const jobs: Promise<void>[] = [];
  for (const p of room.players) {
    if (p.id === selfPlayerId) continue;
    /*
     * Nessuna clip registrata (o profilo assente): non è un avversario da
     * scaricare. Le sue eventuali clip in cache vengono liberate più sotto,
     * perché non rientra in `present`.
     */
    if (!p.profileId || !p.sfxSlots || p.sfxSlots.length === 0) continue;
    present.add(p.id);
    const cached = opponentClipUrls.get(p.id);
    const wanted = new Set<SfxSlot>(p.sfxSlots);
    /*
     * Cache completa E allineata: niente da fare. Il controllo sulle fasce
     * mancanti evita di ri-scaricare tutto a ogni `room:update`; quello sulle
     * fasce NON più desiderate libera i blob di clip cancellate dall'avversario
     * (senza, resterebbe attiva per tutta la sessione).
     */
    if (cached && p.sfxSlots.every((slot) => cached.has(slot)) && cached.size === wanted.size) {
      continue;
    }
    const bank = cached ?? new Map<SfxSlot, string>();
    if (!cached) opponentClipUrls.set(p.id, bank);
    jobs.push(
      (async () => {
        // Fasce rimosse dal profilo: dimentica la clip e libera il blob.
        for (const [slot, url] of [...bank]) {
          if (wanted.has(slot)) continue;
          URL.revokeObjectURL(url);
          bank.delete(slot);
        }
        for (const slot of p.sfxSlots!) {
          if (bank.has(slot)) continue;
          try {
            const url = await fetchClipBlobUrl(
              `${SERVER_BASE}/profiles/${p.profileId}/sfx/${slot}`,
              token,
            );
            bank.set(slot, url);
          } catch {
            // Clip non disponibile (offline, token scaduto): per QUESTA fascia
            // si sentirà il suono sintetizzato, sempre a volume ridotto. Le
            // altre clip già in cache restano valide.
          }
        }
        audio.setOpponentClips(
          p.id,
          [...bank.entries()].map(([slot, url]) => ({ slot, url })),
        );
      })(),
    );
  }

  // Avversari usciti dalla stanza: dimentica le loro clip e libera i blob.
  for (const [playerId, bank] of [...opponentClipUrls]) {
    if (present.has(playerId)) continue;
    for (const url of bank.values()) URL.revokeObjectURL(url);
    opponentClipUrls.delete(playerId);
    audio.clearOpponentClips(playerId);
  }

  await Promise.all(jobs);
}

/**
 * Scarica il catalogo musicale dal server (tracce incluse + MP3 dell'admin).
 * In caso di errore il client usa comunque le tracce incluse nel bundle: la
 * musica non deve mai impedire di giocare.
 */
/**
 * Log di diagnosi per le clip audio, attivo solo con `localStorage.sboobleDebug = '1'`.
 *
 * Serve perché i problemi di audio sono "silenziosi": se una clip non viene
 * sovrascritta l'utente non vede un errore, sente solo il suono vecchio.
 */
function emitSfxDebug(message: string, data: unknown): void {
  try {
    if (localStorage.getItem('sboobleDebug') === '1') console.info(`[sfx] ${message}`, data);
  } catch {
    /* storage non disponibile */
  }
}

async function loadMusicCatalog(): Promise<MusicTrackMeta[] | null> {
  try {
    const res = await fetch(`${SERVER_BASE}/music`);
    if (!res.ok) return null;
    const body = (await res.json()) as { tracks?: MusicTrackMeta[] };
    return Array.isArray(body.tracks) && body.tracks.length > 0 ? body.tracks : null;
  } catch {
    return null;
  }
}
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
  | 'solo-game'
  | 'lobby'
  | 'mp-game'
  | 'summary'
  | 'scheda'
  | 'admin'
  | 'profiles'
  | 'profile'
  | 'leaderboard'
  | 'words'
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
  /** Avatar emoji dell'avversario (mostrato nella notifica in basso). */
  avatar: string;
  /** Foto profilo dell'avversario, se ne ha una pubblica. */
  photoUrl?: string;
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
  /*
   * Voce di stanza ("tieni premuto per parlare").
   *
   * Stato effimero, NON salvato: si riferisce alla stanza aperta e al momento
   * presente. `voiceMuted` in particolare non viene ricordato fra le sessioni:
   * ereditare un microfono silenziato da ieri sarebbe una sorpresa sgradevole
   * ("parlo e non mi sente nessuno").
   */
  /** Id dei giocatori che stanno parlando adesso. */
  voiceSpeakers: string[];
  /** Sto trasmettendo in questo momento (tasto premuto). */
  voiceTalking: boolean;
  /** Microfono silenziato per scelta locale. */
  voiceMuted: boolean;
  /** Avviso momentaneo accanto al tasto (permesso negato, canale pieno…). */
  voiceNotice: string | null;
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
  /** Applica un profilo salvato a store e motore audio (scarica le clip autenticate). */
  applyActiveProfile: (saved: SavedProfile | null, token: string | null) => void;
  switchProfile: (id: string) => Promise<void>;
  registerProfile: (nickname: string, password: string) => Promise<void>;
  loginProfile: (nickname: string, password: string) => Promise<void>;
  logoutProfile: () => Promise<void>;
  deleteProfile: (id: string) => void;
  setProfileAvatar: (avatar: string) => Promise<void>;
  saveProfilePhoto: (dataUrl: string | null) => Promise<void>;
  saveProfileSfx: (slot: SfxSlot, dataUrl: string, durationMs: number) => Promise<void>;
  deleteProfileSfx: (slot: SfxSlot) => Promise<void>;
  setProfileMusic: (musicId: MusicChoice) => Promise<void>;
  /** Passa alla traccia successiva e, se era spenta, riattiva la musica. */
  nextMusicTrack: () => MusicChoice;
  /**
   * Catalogo musicale (tracce incluse + MP3 caricati dall'admin).
   * Caricato all'avvio e aggiornabile dal pannello admin.
   */
  musicCatalog: MusicTrackMeta[];
  /** Ricarica il catalogo dal server (dopo un upload/rimozione dell'admin). */
  refreshMusicCatalog: () => Promise<void>;
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
  createRoom: (
    gridSize: GridSize,
    difficulty: Difficulty,
    rounds: number,
    roundDurationMs: number,
    maxPlayers?: number,
  ) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  startRoom: () => void;
  /** L'host pesca una nuova scheda per il round (visibile a tutti in lobby). */
  shuffleScheda: () => void;
  configureRoom: (
    gridSize: GridSize,
    difficulty: Difficulty,
    rounds: number,
    roundDurationMs: number,
    musicId?: MusicChoice,
    maxPlayers?: number,
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
      voiceSpeakers: [],
      voiceTalking: false,
      voiceMuted: false,
      voiceNotice: null,
      errorMessage: null,
      schedaId: null,
      musicCatalog: audio.getCatalog(),
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

      /**
       * Applica un profilo attivo a store e motore audio (nome, avatar, clip, musica).
       *
       * Le clip vengono scaricate come blob autenticati: senza il token l'audio
       * non parte (l'endpoint è privato e `<audio>` non manda header).
       */
      applyActiveProfile: (() => {
        /** Blob URL delle clip, per slot: vanno revocati prima di sostituirli. */
        const blobUrls = new Map<SfxSlot, string>();
        const apply = (saved: SavedProfile | null, token: string | null) => {
          if (!saved) return;
          // Revoca i blob precedenti e azzera le clip nel motore audio: senza,
          // le clip del profilo precedente resterebbero attive (e i blob orfani
          // in memoria).
          for (const url of blobUrls.values()) URL.revokeObjectURL(url);
          blobUrls.clear();
          audio.setPersonalClips([]);

          const sfxUrls: Partial<Record<SfxSlot, string>> = {};
          const load = async () => {
            for (const clip of saved.profile.sfx) {
              if (!token) break;
              try {
                const blobUrl = await fetchClipBlobUrl(`${SERVER_BASE}${clip.url}`, token);
                blobUrls.set(clip.slot, blobUrl);
                sfxUrls[clip.slot] = blobUrl;
                audio.setPersonalClip(clip.slot, blobUrl);
              } catch {
                // Clip non recuperabile (offline, token scaduto): resta il suono
                // sintetizzato, e la riga compare come "predefinito".
              }
            }
            set({ sfxUrls: { ...sfxUrls } });
          };
          void load();

          if (saved.profile.musicId !== undefined) {
            audio.setMusicTrack(saved.profile.musicId);
            set({ audioSettings: audio.getSettings() });
          }
          set({
            nickname: saved.profile.nickname,
            avatar: (saved.profile.avatar as Avatar) ?? DEFAULT_AVATAR,
            profile: saved.profile,
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
          get().applyActiveProfile(fresh, saved.token);
        } catch {
          set({ profileError: 'Server non raggiungibile: uso i dati locali' });
          get().applyActiveProfile(saved, saved.token);
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
          get().applyActiveProfile(entry, body.token);
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
          get().applyActiveProfile(entry, body.token);
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
          get().applyActiveProfile(next, next.token);
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
        if (next) get().applyActiveProfile(next, next.token);
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
            const clip = profile.sfx.find((c) => c.slot === slot);
            if (clip) {
              /*
               * SOVRASCRITTURA di una clip esistente.
               *
               * Due accortezze che mancavano e facevano sì che dopo una
               * riregistrazione si continuasse a sentire (o a vedere) la VECCHIA
               * registrazione:
               *  1. il blob URL precedente va revocato: senza, restava vivo e
               *     `sfxUrls[slot]` poteva puntare ancora al vecchio blob;
               *  2. l'URL di download deve essere unico per versione, altrimenti
               *     il browser (e il proxy) possono servire la risposta in cache
               *     dell'endpoint precedente.
               */
              const previous = get().sfxUrls[slot];
              // Cache-busting con la versione della clip aggiornata dal server.
              const versioned = `${clip.url}?v=${clip.updatedAt}`;
              const blobUrl = await fetchClipBlobUrl(`${SERVER_BASE}${versioned}`, token);
              emitSfxDebug('clip riregistrata', { slot, versioned, bytes: blobUrl.length });
              if (previous) URL.revokeObjectURL(previous);
              const sfxUrls: Partial<Record<SfxSlot, string>> = {
                ...get().sfxUrls,
                [slot]: blobUrl,
              };
              audio.setPersonalClip(slot, blobUrl);
              updateSavedProfile(id, { profile });
              set({ profile, sfxUrls, profileError: null });
            } else {
              // Il server non riporta la clip appena salvata: senza questo
              // avviso l'utente crede di averla registrata ma non suonerà.
              throw new Error('La clip non risulta salvata: riprova');
            }
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
          // Revoca il blob: senza, l'oggetto resta in memoria anche dopo aver
          // rimosso la clip (e il pulsante ▶ continuerebbe a puntarci).
          const previous = get().sfxUrls[slot];
          if (previous) URL.revokeObjectURL(previous);
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

      /**
       * Tasto ⏭: passa alla traccia successiva.
       *
       * Oltre a cambiare la musica locale, la salva sulla preferenza del profilo
       * (come `setProfileMusic`), così la scelta sopravvive al reload.
       */
      nextMusicTrack: () => {
        const trackId = audio.nextMusicTrack();
        set({ audioSettings: audio.getSettings() });
        void get().setProfileMusic(trackId);
        return trackId;
      },

      refreshMusicCatalog: async () => {
        const tracks = await loadMusicCatalog();
        if (!tracks) return;
        audio.setMusicCatalog(tracks);
        set({ musicCatalog: tracks, audioSettings: audio.getSettings() });
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

      createRoom: async (gridSize, difficulty, rounds, roundDurationMs, maxPlayers) => {
        const socket = getSocket();
        const nickname = get().nickname || 'Host';
        const avatar = get().avatar || avatarFromNickname(nickname);
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            'room:create',
            {
              nickname,
              avatar,
              gridSize,
              difficulty,
              rounds,
              roundDurationMs,
              maxPlayers,
              token: activeToken() ?? undefined,
            },
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

      shuffleScheda: () => {
        const code = get().roomCode;
        if (!code) return;
        getSocket().emit('room:shuffleScheda', { code });
      },

      configureRoom: (gridSize, difficulty, rounds, roundDurationMs, musicId, maxPlayers) => {
        const code = get().roomCode;
        if (!code) return;
        getSocket().emit('room:config', {
          code,
          gridSize,
          difficulty,
          rounds,
          roundDurationMs,
          musicId,
          // Se non specificato manteniamo quello attuale della stanza.
          maxPlayers: maxPlayers ?? get().room?.maxPlayers ?? 8,
        });
      },

      submitWord: async (word, path) => {
        const socket = getSocket();
        const send = () =>
          new Promise<{ accepted: boolean; reason?: string; points?: number; unique?: boolean }>(
            (resolve) => {
              socket.emit('game:submitWord', { word, path }, (res) => {
                resolve({
                  accepted: res.accepted,
                  reason: res.reason,
                  points: res.points,
                  unique: res.unique,
                });
              });
            },
          );

        const res = await send();
        /*
         * Rete di sicurezza per la riconnessione trasparente.
         *
         * Normalmente `onConnect` ripristina il legame prima che il giocatore
         * invii una parola. Se però la riconnessione è appena avvenuta (finestra
         * di pochi ms) il submit può arrivare al server ancora senza la stanza:
         * in quel caso non si mostra "Non in una stanza", si rientra e si rimanda
         * la parola una volta sola. Un secondo fallimento è reale e viene esposto.
         */
        if (res.accepted || !/non in una stanza/i.test(res.reason ?? '')) return res;

        const { roomCode, playerId } = get();
        if (!roomCode || !playerId) return res;
        const rejoinOk = await new Promise<boolean>((resolve) => {
          socket.emit('room:rejoin', { code: roomCode, playerId }, (r) => resolve('ok' in r && r.ok));
        });
        return rejoinOk ? send() : res;
      },

      leaveRoom: () => {
        const code = get().roomCode;
        if (code) getSocket().emit('room:leave', { code });
        // Uscendo si dimenticano gli avversari: le loro clip non servono più e i
        // blob vanno liberati (altrimenti restano in memoria per la sessione).
        clearOpponentClipCache();
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
      // Chiave storica: prefisso `boggle-it` (nome precedente del gioco). Contiene le
      // preferenze salvate (nickname, avatar, difficoltà, audio) e va mantenuta per non
      // azzerarle a chi ha già giocato. Non è visibile all'utente.
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
  // `getState` serve al rientro dopo riconnessione e al retry del submit.
  const get = useAppStore.getState;

  const onRoomUpdate = (room: RoomState) => {
    // In multiplayer la musica la scegle l'host: vince sulla preferenza locale.
    if (room.musicId !== undefined) {
      audio.setMusicTrack(room.musicId);
      useAppStore.setState({ audioSettings: audio.getSettings() });
    }
    set({ room });
    // Scarica in lobby le clip degli avversari: quando trovano una parola deve
    // sentirsi la LORO registrazione, non quella di chi ascolta (vedi
    // `playOpponentWord`). Il download è idempotente: le clip già in cache
    // non vengono richieste di nuovo.
    const st = useAppStore.getState();
    void syncOpponentClips(room, st.playerId, activeToken());
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
    avatar: string;
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
      /*
       * Avversario: notifica "+N" accanto al nome.
       *
       * Suono: l'ESULTANZA COMPLETA della parola trovata, ma a volume ridotto
       * (vedi `playOpponentWord`). Prima era un ding generico: sentire il motivo
       * vero — più lungo per le parole lunghe — fa capire a colpo d'orecchio se
       * l'avversario sta trovando parole lunghe o solo parole corte.
       */
      audio.playOpponentWord(p.wordLength, p.playerId);
      const opponentEvents = [
        ...s.opponentEvents,
        {
          id: Date.now() + Math.random(),
          playerId: p.playerId,
          nickname: p.nickname,
          avatar: p.avatar,
          // La foto è un URL pubblico servito dal server: la notifica mostra la
          // stessa immagine che si vede in classifica.
          photoUrl: s.room?.players.find((pl) => pl.id === p.playerId)?.photoUrl,
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
  /*
   * Voce di un altro giocatore della stanza.
   *
   * L'audio non passa dallo store: sarebbero 2 KB sedici volte al secondo, e un
   * aggiornamento di stato a ogni pacchetto. Va dritto al motore audio, che lo
   * accoda e lo suona. Lo store riceve solo l'elenco di CHI sta parlando, per
   * gli indicatori.
   */
  const onVoiceAudio = (p: VoiceAudioPayload) => voiceChat.receive(p);
  /*
   * Countdown 3-2-1 a ogni round: il numero arriva dal server.
   *
   * Si passa SUBITO alla schermata di gioco, anche se la griglia del nuovo round
   * non è ancora arrivata (`game:roundStart` viene emesso alla fine del
   * countdown): senza, la sovrapposizione non comparirebbe mai perché si
   * resterebbe nella schermata di riepilogo. La schermata di gioco sa mostrare
   * il countdown anche senza griglia.
   */
  const onCountdown = (p: { seconds: number }) =>
    set({ countdown: p.seconds, screen: 'mp-game', grid: null });
  const onError = (p: { message: string }) => set({ errorMessage: p.message });

  /**
   * Riconnessione TRASPARENTE del socket.
   *
   * Socket.IO riconnette da solo e assegna un NUOVO `socket.id`, ma il server
   * lega stanza e giocatore proprio a quell'id: dopo la riconnessione il mapping
   * è perso e `game:submitWord` rispondeva "Non in una stanza" mentre il
   * giocatore era ancora in partita. Qui, appena il socket torna connesso e lo
   * store sa di essere in una stanza, si chiede il rientro con i dati già
   * posseduti (`roomCode` + `playerId`).
   *
   * Perché ascoltare `connect` invece di gestire l'errore del submit: il mapping
   * va ripristinato PRIMA che l'utente provi a inviare una parola. Rileggere
   * l'errore e rimandare la parola funzionerebbe solo per il primo submit e
   * lascerebbe comunque la griglia senza stato per qualche istante.
   */
  const onConnect = () => {
    const { roomCode, playerId } = useAppStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('room:rejoin', { code: roomCode, playerId }, (res) => {
      if ('ok' in res && res.ok) {
        set({ room: res.state });
        return;
      }
      /*
       * Rientro rifiutato: la stanza non esiste più (chiusa/scaduta) o il
       * giocatore è stato rimosso. Meglio uscire in modo pulito che restare in
       * una schermata di gioco che non può più inviare nulla. `leaveRoom` emette
       * anche `room:leave`, ma è un no-op lato server se la stanza è sparita.
       */
      get().leaveRoom();
      set({ errorMessage: 'La stanza è stata chiusa: sei tornato alla home.' });
    });
  };

  socket.on('room:update', onRoomUpdate);
  socket.on('game:roundStart', onRoundStart);
  socket.on('game:playerWord', onPlayerWord);
  socket.on('game:roundEnd', onRoundEnd);
  socket.on('game:gameEnd', onGameEnd);
  socket.on('game:countdown', onCountdown);
  socket.on('voice:audio', onVoiceAudio);
  socket.on('error', onError);
  socket.on('connect', onConnect);

  return () => {
    socket.off('room:update', onRoomUpdate);
    socket.off('game:roundStart', onRoundStart);
    socket.off('game:playerWord', onPlayerWord);
    socket.off('game:roundEnd', onRoundEnd);
    socket.off('game:gameEnd', onGameEnd);
    socket.off('game:countdown', onCountdown);
    socket.off('voice:audio', onVoiceAudio);
    socket.off('error', onError);
    socket.off('connect', onConnect);
  };
}

export type { PlayerPublic };
