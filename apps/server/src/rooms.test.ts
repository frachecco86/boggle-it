import { describe, it, expect } from 'vitest';
import { createDictionary } from '@boggle/dictionary';
import type { Grid } from '@boggle/shared';
import { Room, clampDuration } from './rooms.js';

/** Griglia fissa di test: tutte le lettere note, layout 4x4. */
function fixedGrid(letters: string[]): Grid {
  return {
    size: 4,
    tiles: letters.map((letter, index) => ({
      index,
      row: Math.floor(index / 4),
      col: index % 4,
      letter,
      display: letter === 'q' ? 'Qu' : letter.toUpperCase(),
    })),
  };
}

const DICT = createDictionary(['casa', 'caso', 'reo', 'era', 'ala', 'quadro', 'quad']);

function makeRoomWithGrid(letters: string[]) {
  const room = new Room('TEST01', DICT, 4, 3);
  room.addPlayer('p1', 'Alice');
  room.startRound();
  // Sostituisce la griglia generata con una deterministica
  const grid = fixedGrid(letters);
  room.grid = grid;
  return { room, grid };
}

describe('Room.submitWord', () => {
  it('accetta una parola valida e assegna i punti', () => {
    // c a s a / ...
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    const res = room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    expect(res.accepted).toBe(true);
    expect(res.word).toBe('casa');
    // Regola Boggle: 'casa' (4 lettere) → 2 punti base
    expect(res.points).toBe(2);
    expect(room.players.get('p1')!.totalScore).toBe(2);
  });

  it('rifiuta un percorso non adiacente', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    // 0 -> 2 non adiacenti (salta la 1)
    const res = room.submitWord('p1', 'casa', [0, 2, 1, 3]);
    expect(res.accepted).toBe(false);
    expect(res.reason).toMatch(/percorso/i);
  });

  it('rifiuta una parola non presente nel dizionario', () => {
    const { room } = makeRoomWithGrid(['z', 'z', 'z', 'z', ...Array(12).fill('x')]);
    const res = room.submitWord('p1', 'zzz', [0, 1, 2]);
    expect(res.accepted).toBe(false);
    expect(res.reason).toMatch(/dizionario/i);
  });

  it('rifiuta una parola che non corrisponde al percorso', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    const res = room.submitWord('p1', 'era', [0, 1, 2, 3]);
    expect(res.accepted).toBe(false);
    expect(res.reason).toMatch(/percorso/i);
  });

  it('rifiuta un duplicato dello stesso giocatore', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    expect(room.submitWord('p1', 'casa', [0, 1, 2, 3]).accepted).toBe(true);
    const dup = room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    expect(dup.accepted).toBe(false);
    expect(dup.reason).toMatch(/gia/i);
  });

  it('consente la stessa parola a giocatori diversi', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.addPlayer('p2', 'Bob');
    expect(room.submitWord('p1', 'casa', [0, 1, 2, 3]).accepted).toBe(true);
    expect(room.submitWord('p2', 'casa', [0, 1, 2, 3]).accepted).toBe(true);
    // I punti base vengono accreditati subito; il raddoppio si applica a fine round.
    expect(room.players.get('p1')!.totalScore).toBe(2);
    expect(room.players.get('p2')!.totalScore).toBe(2);
  });

  it('raddoppia i punti se la parola è trovata da un solo giocatore', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.addPlayer('p2', 'Bob');
    room.submitWord('p1', 'casa', [0, 1, 2, 3]); // trovata solo da p1
    const results = room.endRound();
    const p1 = results.find((r) => r.playerId === 'p1')!;
    // 'casa' = 2 punti base, raddoppiati a 4 perché nessun altro l'ha trovata
    expect(p1.roundScore).toBe(4);
    expect(p1.totalScore).toBe(4);
    expect(p1.uniqueWords).toContain('casa');
  });

  it('NON raddoppia se la stessa parola è trovata da più giocatori', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.addPlayer('p2', 'Bob');
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    room.submitWord('p2', 'casa', [0, 1, 2, 3]);
    const results = room.endRound();
    for (const r of results) {
      expect(r.roundScore).toBe(2); // base, senza raddoppio
      expect(r.uniqueWords ?? []).not.toContain('casa');
    }
  });

  it('rifiuta dopo la scadenza del round', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.roundEndsAt = Date.now() - 1;
    const res = room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    expect(res.accepted).toBe(false);
    expect(res.reason).toMatch(/tempo/i);
  });

  it('gestisce la faccia Qu', () => {
    // 'q' vale 'qu': q + a + d = "quad" (parola di 4 lettere con 3 celle)
    const { room } = makeRoomWithGrid(['q', 'a', 'd', 'r', 'o', ...Array(11).fill('x')]);
    const res = room.submitWord('p1', 'quad', [0, 1, 2]);
    expect(res.accepted).toBe(true);
    expect(res.word).toBe('quad');
    // 'quad' = 4 lettere → 2 punti base
    expect(res.points).toBe(2);
  });
});

describe('Room lifecycle', () => {
  it('calcola i risultati di fine round ordinati', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.addPlayer('p2', 'Bob');
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    const results = room.endRound();
    expect(results[0]!.nickname).toBe('Alice');
    expect(results[0]!.roundScore).toBe(4); // base 2 raddoppiata (unica)
    expect(room.phase).toBe('roundEnd');
  });

  it('termina la partita dopo il numero di round configurato', () => {
    const room = new Room('TEST02', DICT, 4, 2);
    room.addPlayer('p1', 'Alice');
    expect(room.isGameOver()).toBe(false);
    room.startRound();
    expect(room.isGameOver()).toBe(false);
    room.startRound();
    expect(room.isGameOver()).toBe(true);
  });

  it('trasferisce l host se l host esce', () => {
    const room = new Room('TEST03', DICT, 4, 3);
    room.addPlayer('p1', 'Alice');
    room.addPlayer('p2', 'Bob');
    expect(room.hostId).toBe('p1');
    room.removePlayer('p1');
    expect(room.hostId).toBe('p2');
  });
});

describe('Difficoltà e durata round', () => {
  it('applica la difficoltà alla stanza', () => {
    const room = new Room('DIFF01', DICT, 5, 3, 'difficile', 90_000);
    expect(room.difficulty).toBe('difficile');
    expect(room.roundDurationMs).toBe(90_000);
    const state = room.publicState();
    expect(state.difficulty).toBe('difficile');
    expect(state.roundDurationMs).toBe(90_000);
  });

  it('genera griglie diverse per difficoltà diverse', () => {
    const counts: Record<string, number> = {};
    const vowels = 'aeiou';
    for (const diff of ['facile', 'normale', 'difficile'] as const) {
      let v = 0;
      let total = 0;
      for (let i = 0; i < 60; i++) {
        const room = new Room(`D${diff}`, DICT, 4, 1, diff, 60_000);
        room.addPlayer('p', 'X');
        const { grid } = room.startRound();
        for (const t of grid.tiles) {
          total++;
          if (vowels.includes(t.letter) || t.letter === 'q') v++;
        }
      }
      counts[diff] = v / total;
    }
    // La difficoltà facile deve avere più vocali della difficile.
    expect(counts.facile!).toBeGreaterThan(counts.difficile!);
    expect(counts.facile!).toBeGreaterThan(0.35);
    expect(counts.difficile!).toBeLessThan(0.42);
  });

  it('clampDuration accetta i valori nei limiti di sicurezza', () => {
    // Le tre durate della UI.
    expect(clampDuration(90_000)).toBe(90_000);
    expect(clampDuration(120_000)).toBe(120_000);
    expect(clampDuration(180_000)).toBe(180_000);
    // Valori intermedi sono accettati (utili per i test e per durate future).
    expect(clampDuration(95_000)).toBe(95_000);
    expect(clampDuration(5_000)).toBe(5_000);
    // Fuori dai limiti di sicurezza: si torna al default (mai un round istantaneo o infinito).
    expect(clampDuration(1_000)).toBe(180_000);
    expect(clampDuration(60 * 60_000)).toBe(180_000);
    expect(clampDuration('boh')).toBe(180_000);
  });
});

describe('Numero massimo di giocatori', () => {
  it('la stanza parte con 8 posti di default', () => {
    const room = new Room('MP01', DICT, 4, 3, 'normale', 180_000);
    expect(room.maxPlayers).toBe(8);
    expect(room.publicState().maxPlayers).toBe(8);
    expect(room.isFull).toBe(false);
  });

  it('rispetta il limite di 2 giocatori (sfida a 2)', () => {
    const room = new Room('MP02', DICT, 4, 3, 'normale', 180_000, 2);
    expect(room.maxPlayers).toBe(2);
    room.addPlayer('p1', 'Anna');
    expect(room.isFull).toBe(false);
    room.addPlayer('p2', 'Bruno');
    expect(room.isFull).toBe(true);
  });

  it('rispetta il limite di 4', () => {
    const room = new Room('MP03', DICT, 4, 3, 'normale', 180_000, 4);
    for (let i = 0; i < 4; i++) room.addPlayer(`p${i}`, `G${i}`);
    expect(room.isFull).toBe(true);
    expect(room.players.size).toBe(4);
  });

  it('il limite si può cambiare e vale per i NUOVI ingressi', () => {
    const room = new Room('MP04', DICT, 4, 3, 'normale', 180_000, 8);
    room.addPlayer('p1', 'Anna');
    room.addPlayer('p2', 'Bruno');
    room.addPlayer('p3', 'Carla');
    // L'host stringe il limite a 2: i presenti NON vengono espulsi.
    room.maxPlayers = 2;
    expect(room.players.size).toBe(3);
    expect(room.isFull).toBe(true);
    // Un nuovo ingresso non è possibile.
    expect(room.isFull).toBe(true);
  });
});
