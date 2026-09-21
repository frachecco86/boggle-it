/**
 * Profili giocatore: dati condivisi fra client e server.
 *
 * Un profilo ha:
 *  - credenziali (nick + password) gestite dal server, mai in chiaro;
 *  - un avatar emoji (sempre disponibile, zero asset);
 *  - una FOTO opzionale (immagine 256×256 trasformata nel browser con i filtri);
 *  - fino a 5 CLIP AUDIO personali, una per fascia di lunghezza parola;
 *  - la preferenza musicale.
 *
 * Foto e audio sono **privati**: il server li tiene per il proprietario e non
 * li mostra agli altri. L'avatar emoji è invece pubblico e appare in classifica.
 */
import type { MusicChoice } from './music.js';

/** Fasce di lunghezza per le clip audio registrate dal giocatore. */
export const SFX_SLOTS = ['3', '4', '5', '6', '7plus'] as const;
export type SfxSlot = (typeof SFX_SLOTS)[number];

/** Etichetta leggibile di una fascia. */
export const SFX_SLOT_LABELS: Record<SfxSlot, string> = {
  '3': '3 lettere',
  '4': '4 lettere',
  '5': '5 lettere',
  '6': '6 lettere',
  '7plus': '7 o più lettere',
};

/** Fasce che hanno una clip caricata sul server. */
export function isSfxSlot(value: unknown): value is SfxSlot {
  return typeof value === 'string' && (SFX_SLOTS as readonly string[]).includes(value);
}

export interface ProfileSfx {
  slot: SfxSlot;
  /** URL relativo servito dal server (richiede token), es. `/profiles/me/sfx/3`. */
  url: string;
  /** Durata in millisecondi, per l'interfaccia. */
  durationMs: number;
  /** Timestamp Unix (ms) dell'ultimo aggiornamento, per la cache-busting. */
  updatedAt: number;
}

export interface ProfilePublic {
  id: string;
  nickname: string;
  /** Avatar emoji pubblico, sempre presente. */
  avatar: string;
  /** true se il profilo ha una foto caricata. */
  hasPhoto: boolean;
  /** URL della foto, presente solo per il proprietario (le foto sono private). */
  photoUrl?: string;
  /** Timestamp foto per il cache-busting. */
  photoUpdatedAt?: number;
}

export interface ProfilePrivate extends ProfilePublic {
  createdAt: number;
  sfx: ProfileSfx[];
  /**
   * Traccia musicale preferita: id di una traccia del catalogo, oppure `'none'`.
   * Gli id non sono più solo quelli inclusi nel bundle: l'admin può aggiungere
   * tracce a runtime, quindi è una stringa validata dal server.
   */
  musicId: MusicChoice;
}

/* ------------------------------------------------------------------ */
/* Messaggi HTTP (non Socket.IO)                                       */
/* ------------------------------------------------------------------ */

export interface RegisterPayload {
  nickname: string;
  password: string;
  avatar: string;
}

export interface LoginPayload {
  nickname: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  profile: ProfilePrivate;
}

export interface UpdateProfilePayload {
  avatar?: string;
  musicId?: MusicChoice;
}

export interface ErrorResponse {
  error: string;
}

/** Limiti dimensionali delle risorse profilo. */
export const PROFILE_LIMITS = {
  /** Foto: JPEG 256×256, ~15-30 KB. Tetto prudente. */
  photoMaxBytes: 400 * 1024,
  /** Clip audio: WebM/Opus a 32 kbps, 3 secondi = ~12 KB. */
  sfxMaxBytes: 512 * 1024,
  sfxMaxDurationMs: 4000,
  nicknameMaxLength: 20,
  passwordMinLength: 6,
} as const;
