/**
 * Punteggio Boggle CLASSICO (scala non lineare a soglie).
 *
 * Tabella:
 *   3 lettere   → 1 punto
 *   4 lettere   → 1 punto
 *   5 lettere   → 2 punti
 *   6 lettere   → 3 punti
 *   7 lettere   → 5 punti
 *   8 o più     → 11 punti
 *
 * PERCHÉ a soglie: la parola lunga è il momento memorabile del gioco e deve
 * pesare molto più di due parole corte. La scala lineare `lunghezza − 2`
 * premiava troppo poco le parole da 8+ (una da 8 valeva 6 punti, meno di tre
 * parole da 4). La tabella è quella classica del Boggle ed è riconoscibile da
 * chi ha già giocato: nessuna regola da imparare.
 *
 * Da 8 lettere in su i punti NON crescono più (9, 10, 13 valgono tutte 11):
 * è il tetto della scala classica.
 *
 * Nel multiplayer una parola trovata da UN SOLO giocatore vale doppio (vedi
 * `scoreForRound`).
 */
export const MIN_WORD_LENGTH = 3;
export const MAX_WORD_LENGTH = 16;

/** Punti base per una parola di data lunghezza (0 se non valida). */
export function scoreForLength(length: number): number {
  if (length < MIN_WORD_LENGTH) return 0;
  if (length <= 4) return 1;
  if (length === 5) return 2;
  if (length === 6) return 3;
  if (length === 7) return 5;
  return 11; // 8 o più
}

/** Punti base per una parola di data lunghezza (0 se non valida). */
export function scoreForWord(word: string): number {
  return scoreForLength(word.length);
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
