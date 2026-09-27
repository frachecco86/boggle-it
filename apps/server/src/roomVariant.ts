/**
 * Quale variante di scheda vale per una partita, e chi la decide.
 *
 * PERCHÉ ESISTE QUESTO FILE
 * -------------------------
 * Dal 0.35.0 la variante delle schede è una scelta dell'**admin**, non del
 * giocatore: vale per il single player e per ogni stanza, e l'host non la può
 * cambiare. Il client ha smesso di inviarla.
 *
 * Il server però continuava a leggerla dal payload in `room:create` con fallback
 * `'standard'`: non arrivando più nessun valore, **ogni stanza nasceva standard**
 * e il multiplayer ignorava l'impostazione dell'admin (che si vedeva invece in
 * single player e in home). `room:configure` faceva già la cosa giusta — due
 * copie della stessa regola, una aggiornata e una no.
 *
 * Qui la regola è una sola, così le due rotte non possono più divergere.
 */
import { schedaVariantForSize, type GridSize, type SchedaVariant } from '@boggle/shared';

/**
 * Variante effettiva di una partita: quella dell'admin, adattata alla griglia.
 *
 * `_clientVariant` esiste per documentare che un valore inviato dal client — anche
 * quello di una versione vecchia dell'app — viene **ignorato di proposito**: la
 * scelta non è sua. Il parametro c'è per rendere esplicito il rifiuto invece di
 * lasciare il dubbio che sia stato solo dimenticato.
 */
export function resolveRoomVariant(
  adminVariant: SchedaVariant,
  gridSize: GridSize,
  _clientVariant?: unknown,
): SchedaVariant {
  return schedaVariantForSize(adminVariant, gridSize);
}
