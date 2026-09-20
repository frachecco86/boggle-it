/**
 * Punteggio: 1 punto ogni 3 lettere.
 *
 * Formula: ⌊lunghezza / 3⌋
 *   3-5 lettere  → 1 punto
 *   6-8 lettere  → 2 punti
 *   9-11 lettere → 3 punti
 *   12+ lettere  → 4 punti
 *
 * Prima si usava la regola classica del Boggle (lunghezza − 2), che dava punteggi
 * crescenti e molto alti per le parole lunghe (una parola da 10 valeva 8 punti).
 * Con questa formula le parole lunghe restano avvantaggiate in proporzione, ma i
 * punteggi sono più bassi e leggibili.
 *
 * Nel multiplayer una parola trovata da UN SOLO giocatore vale doppio (vedi
 * `scoreForRound`).
 */
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 16;

/** Punti base per una parola di data lunghezza (0 se non valida). */
export function scoreForWord(word: string): number {
  const len = word.length;
  if (len < MIN_WORD_LENGTH) return 0;
  return Math.floor(len / 3);
}

/**
 * Punti di una parola per il round multiplayer.
 * `unique` = nessun altro giocatore l'ha trovata → punteggio doppio.
 */
export function scoreForRound(word: string, options: { unique?: boolean } = {}): number {
  const base = scoreForWord(word);
  return options.unique ? base * 2 : base;
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
