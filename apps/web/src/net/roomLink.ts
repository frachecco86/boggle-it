/**
 * Link di invito a una stanza multiplayer.
 *
 * Perché un modulo a sé: costruire e leggere l'URL è **logica pura** (nessun
 * socket, nessuno store) e sbagliarla significa che l'invito non funziona —
 * cioè la persona invitata apre un link che non porta da nessuna parte. Qui si
 * può testare senza browser, passando l'URL come stringa.
 *
 * Formato scelto: `?stanza=K7QM2P` sull'URL dell'app.
 *  - **Query e non `#hash`**: il frammento non arriva al server e alcuni client
 *    di posta/chat lo tagliano.
 *  - **Si condivide l'indirizzo da cui si gioca**, non quello del server delle
 *    stanze: chi apre il link carica l'app (che sa già a quale server parlare,
 *    perché l'indirizzo è compilato nel bundle) e poi entra nella stanza.
 *  - Il parametro viene **tolto dall'indirizzo** appena letto: un invito si
 *    consuma una volta sola e tornando alla home non ricompare il codice della
 *    stanza di prima.
 */

/** Nome del parametro nell'URL: `…/?stanza=K7QM2P`. */
export const ROOM_QUERY_PARAM = 'stanza';

/** Minimo e massimo di caratteri accettati per un codice stanza. */
const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 6;

/**
 * Normalizza un codice: maiuscole, senza separatori o caratteri strani.
 * Ritorna `null` se non può essere un codice valido (link sbagliato o manomesso).
 */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < MIN_CODE_LENGTH || code.length > MAX_CODE_LENGTH) return null;
  return code;
}

/** Indirizzo attuale, con un valore di ripiego per gli ambienti senza `window` (test). */
function currentHref(): string {
  return typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
}

/**
 * Link da mandare a un amico per farlo entrare nella stanza.
 *
 * L'URL di partenza è quello da cui si sta giocando, quindi il link vale sia nel
 * sito sia nell'app pubblicata (frontend e server possono stare su domini diversi).
 */
export function roomUrl(code: string, href: string = currentHref()): string {
  const url = new URL(href);
  const valid = normalizeRoomCode(code);
  if (valid) url.searchParams.set(ROOM_QUERY_PARAM, valid);
  else url.searchParams.delete(ROOM_QUERY_PARAM);
  // Il frammento non serve e confonderebbe il link.
  url.hash = '';
  return url.toString();
}

/** Testo dell'invito: il codice c'è anche scritto, per chi preferisce digitarlo. */
export function roomShareText(code: string): string {
  return `Entra nella mia stanza di Sbooble! Codice: ${code}`;
}

/** Codice stanza presente nell'URL, se l'indirizzo è un invito. */
export function roomCodeFromUrl(href: string = currentHref()): string | null {
  try {
    return normalizeRoomCode(new URL(href).searchParams.get(ROOM_QUERY_PARAM));
  } catch {
    return null;
  }
}

/** Il minimo che serve da `window` per consumare l'invito (così si può testare). */
export interface UrlWindow {
  location: { href: string };
  history: { replaceState: (data: unknown, unused: string, url?: string) => void };
}

/**
 * Legge l'invito dall'indirizzo **e lo toglie**.
 *
 * Toglierlo è voluto: senza, ogni volta che si torna alla home (dopo una partita,
 * o ricaricando) il codice della vecchia stanza ricomparirebbe nel campo "Entra",
 * come se l'invito fosse appena arrivato.
 */
export function consumeRoomCodeFromUrl(win: UrlWindow = window): string | null {
  const code = roomCodeFromUrl(win.location.href);
  if (!code) return null;
  try {
    const url = new URL(win.location.href);
    url.searchParams.delete(ROOM_QUERY_PARAM);
    win.history.replaceState(null, '', url.toString());
  } catch {
    /* indirizzo non manipolabile: il codice è comunque stato letto */
  }
  return code;
}
