/**
 * Test del link di invito alla stanza.
 *
 * Perché contano: il link è l'unica cosa che l'invitato riceve. Se il codice non
 * viene letto (o viene letto sbagliato) l'invito è un link morto, e ce ne si
 * accorge solo quando qualcuno prova a entrare.
 *
 * Qui l'URL è **sempre passato come stringa**: nessun browser, nessun mock.
 */
import { describe, expect, it } from 'vitest';
import {
  consumeRoomCodeFromUrl,
  normalizeRoomCode,
  roomCodeFromUrl,
  roomShareText,
  roomUrl,
} from './roomLink.js';

const BASE = 'https://sbooble.example/app/';

describe('codice stanza', () => {
  it('accetta solo codici plausibili', () => {
    expect(normalizeRoomCode('k7qm2p')).toBe('K7QM2P');
    expect(normalizeRoomCode(' k7qm-2p ')).toBe('K7QM2P');
    expect(normalizeRoomCode('ABC')).toBeNull(); // troppo corto
    expect(normalizeRoomCode('ABCDEFG')).toBeNull(); // troppo lungo
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode(null)).toBeNull();
    expect(normalizeRoomCode(42)).toBeNull();
  });

  it('normalizza il codice dentro il link condiviso', () => {
    expect(roomUrl('k7qm2p', BASE)).toBe(`${BASE}?stanza=K7QM2P`);
  });

  it('sostituisce un invito precedente invece di accumularlo', () => {
    expect(roomUrl('NEW123', `${BASE}?stanza=OLD123`)).toBe(`${BASE}?stanza=NEW123`);
  });

  it('toglie il frammento e conserva gli altri parametri', () => {
    expect(roomUrl('K7QM2P', `${BASE}?theme=dark#gioco`)).toBe(`${BASE}?theme=dark&stanza=K7QM2P`);
  });

  it('con un codice non valido non inventa un invito', () => {
    expect(roomUrl('X', `${BASE}?stanza=OLD123`)).toBe(BASE);
  });

  it('legge il codice dal link aperto', () => {
    expect(roomCodeFromUrl(`${BASE}?stanza=K7QM2P`)).toBe('K7QM2P');
    expect(roomCodeFromUrl(`${BASE}?stanza=k7qm2p&x=1`)).toBe('K7QM2P');
    expect(roomCodeFromUrl(BASE)).toBeNull();
    expect(roomCodeFromUrl(`${BASE}?stanza=ABC`)).toBeNull(); // incompleto
    expect(roomCodeFromUrl('non un url')).toBeNull();
  });

  it('il testo dell\'invito contiene il codice, per chi lo digita a mano', () => {
    expect(roomShareText('K7QM2P')).toContain('K7QM2P');
  });
});

describe('invito consumato una volta sola', () => {
  /** Finto `window`: registra quello che viene scritto nell'indirizzo. */
  function fakeWindow(href: string) {
    const history: string[] = [];
    return {
      history,
      win: {
        location: { href },
        history: {
          replaceState: (_data: unknown, _unused: string, url?: string) => {
            history.push(String(url));
          },
        },
      },
    };
  }

  it('legge il codice e lo toglie dall\'indirizzo', () => {
    const { win, history } = fakeWindow(`${BASE}?stanza=K7QM2P`);
    expect(consumeRoomCodeFromUrl(win)).toBe('K7QM2P');
    expect(history).toEqual([BASE]);
  });

  it('senza invito non tocca l\'indirizzo', () => {
    const { win, history } = fakeWindow(BASE);
    expect(consumeRoomCodeFromUrl(win)).toBeNull();
    expect(history).toEqual([]);
  });

  it('un indirizzo manomesso non fa esplodere nulla', () => {
    const { win } = fakeWindow('non un url');
    expect(consumeRoomCodeFromUrl(win)).toBeNull();
  });
});
