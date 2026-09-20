/**
 * Avatar: una selezione curata di emoji.
 *
 * Perché emoji e non immagini: zero asset da scaricare, nessuna licenza,
 * resa identica su ogni dispositivo, e occupano 0 KB nel bundle.
 */

export const AVATARS = [
  // Animali
  '🐱', '🐶', '🦊', '🐼', '🐸', '🦁', '🐵', '🐨',
  '🦉', '🐧', '🐙', '🦄', '🐝', '🐢', '🦋', '🐬',
  // Faccine e personaggi
  '😎', '🤓', '😺', '🤖', '👻', '🎃', '👽', '🦖',
  // Oggetti e simboli divertenti
  '⚽', '🎲', '🍕', '🌈', '🚀', '⭐', '🔥', '🎈',
] as const;

export type Avatar = (typeof AVATARS)[number];

export const DEFAULT_AVATAR: Avatar = '🐱';

export function isAvatar(value: unknown): value is Avatar {
  return typeof value === 'string' && (AVATARS as readonly string[]).includes(value);
}

/** Sceglie un avatar deterministico dal nickname (per chi non ne ha scelto uno). */
export function avatarFromNickname(nickname: string): Avatar {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = (hash * 31 + nickname.charCodeAt(i)) >>> 0;
  }
  return AVATARS[hash % AVATARS.length]!;
}
