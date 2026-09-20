/** Punteggio Boggle classico. */
export const SCORE_TABLE: Record<number, number> = {
  3: 1,
  4: 1,
  5: 2,
  6: 3,
  7: 4,
  8: 5,
};

export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 16;

/** Punti per una parola di data lunghezza (0 se non valida). */
export function scoreForWord(word: string): number {
  const len = word.length;
  if (len < MIN_WORD_LENGTH) return 0;
  if (len >= 8) return 5;
  return SCORE_TABLE[len] ?? 0;
}

/** Codice stanza leggibile: 6 caratteri senza vocali ambigue (I/O/1/0). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6, rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]!;
  }
  return out;
}

/** Normalizza una parola per il lookup: minuscolo, solo a-z, accenti → vocale base. */
export function normalizeWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[àáâ]/g, 'a')
    .replace(/[èéê]/g, 'e')
    .replace(/[ìíî]/g, 'i')
    .replace(/[òóô]/g, 'o')
    .replace(/[ùúû]/g, 'u')
    .replace(/[^a-z]/g, '');
}
