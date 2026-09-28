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
  publicAppHref,
  ROOM_QUERY_PARAM,
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

/*
 * Il link di invito non deve mai puntare a `localhost`: nell'APK l'origine della
 * WebView è `https://localhost`, che esiste solo dentro il telefono. Un invito
 * così è inutile per chi lo riceve (bug "Il link multiplayer creato dall' apk è
 * un link localhost").
 */
describe('roomLink — invito da APK (origine localhost)', () => {
  const REMOTE = 'https://boggle-it-production.up.railway.app';

  it("dall'APK il link punta al server, non a localhost", () => {
    const link = roomUrl('K7QM2P', 'https://localhost/');
    expect(link).not.toContain('localhost');
    expect(link).toContain(ROOM_QUERY_PARAM);
    expect(link).toContain('K7QM2P');
  });

  it('publicAppHref sostituisce origini locali con il server remoto', () => {
    for (const local of ['https://localhost/', 'https://localhost/index.html', 'http://127.0.0.1:5173/']) {
      expect(publicAppHref(local, REMOTE)).toBe(`${REMOTE}/`);
    }
  });

  it('su web (origine pubblica) il link resta quello da cui si gioca', () => {
    const href = 'https://sbooble.example/app';
    expect(publicAppHref(href, REMOTE)).toBe(href);
    expect(roomUrl('K7QM2P', href)).toContain('sbooble.example');
  });

  it('senza server remoto configurato non inventa un indirizzo', () => {
    // Sviluppo: Vite gira su localhost e non c'è `VITE_SERVER_URL`.
    expect(publicAppHref('http://localhost:5173/', '')).toBe('http://localhost:5173/');
  });

  it('un indirizzo non valido non fa esplodere la costruzione del link', () => {
    expect(publicAppHref('non-un-url', REMOTE)).toBe('non-un-url');
  });
});
