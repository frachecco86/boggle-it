/**
 * Punteggio Boggle: 1 punto per una parola di 3 lettere, poi un punto in più per
 * ogni lettera aggiuntiva.
 *
 * Formula: lunghezza − 2
 *   3 lettere  → 1 punto
 *   4          → 2
 *   5          → 3
 *   6          → 4
 *   7          → 5
 *   8          → 6
 *   9          → 7
 *   10         → 8
 *
 * Perché non una formula più piatta: con ⌊lunghezza/3⌋ una parola da 9 lettere
 * valeva solo 3 punti, come tre parole da 3 lettere, pur essendo molto più
 * difficile da trovare. Le parole lunghe vanno premiate: sono il cuore del gioco.
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
  return len - 2;
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
