/**
 * Fascia di colore del punteggio, in base alla LUNGHEZZA della parola.
 *
 * 3 lettere → 3 … da 7 in su → 7. È il contratto fra il rettangolo "Componi"
 * (single player) e il "+N" sopra l'avatar (multiplayer): usano la stessa scala
 * di colori, quindi lo stesso numero si legge allo stesso modo nei due modi.
 *
 * Sta in un modulo a parte perché entrambi i punti lo usano e il valore deve
 * restare identico: se cambiasse in uno solo dei due, i colori non
 * corrisponderebbero più.
 */
export function lengthBucket(length: number): number {
  if (!Number.isFinite(length)) return 3;
  return Math.max(3, Math.min(7, Math.floor(length)));
}
