import { describe, it, expect } from 'vitest';
import { createDictionary } from '@boggle/dictionary';
import type { Grid } from '@boggle/shared';
import { Room } from './rooms.js';

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
    expect(res.points).toBe(1);
    expect(room.players.get('p1')!.totalScore).toBe(1);
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

  it('consente la stessa parola a giocatori diversi (punteggio pieno a tutti)', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.addPlayer('p2', 'Bob');
    expect(room.submitWord('p1', 'casa', [0, 1, 2, 3]).accepted).toBe(true);
    expect(room.submitWord('p2', 'casa', [0, 1, 2, 3]).accepted).toBe(true);
    expect(room.players.get('p1')!.totalScore).toBe(1);
    expect(room.players.get('p2')!.totalScore).toBe(1);
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
    expect(res.points).toBe(1);
  });
});

describe('Room lifecycle', () => {
  it('calcola i risultati di fine round ordinati', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.addPlayer('p2', 'Bob');
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    const results = room.endRound();
    expect(results[0]!.nickname).toBe('Alice');
    expect(results[0]!.roundScore).toBe(1);
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
