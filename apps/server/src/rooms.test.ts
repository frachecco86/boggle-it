import { describe, it, expect } from 'vitest';
import { createDictionary } from '@boggle/dictionary';
import { pickScheda, type Grid } from '@boggle/shared';
import { Room, RoomRegistry, clampDuration } from './rooms.js';

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
    // Scala lineare: 'casa' (4 lettere) → 2 punti base
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

  it('produce la timeline delle parole in ordine cronologico', () => {
    const { room } = makeRoomWithGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.addPlayer('p2', 'Bob');
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    const results = room.endRound();
    const p1 = results.find((r) => r.playerId === 'p1')!;
    expect(p1.timeline).toHaveLength(1);
    expect(p1.timeline![0]!.word).toBe('casa');
    // Il raddoppio è già dentro la timeline (2 base + 2 bonus = 4).
    expect(p1.timeline![0]!.points).toBe(4);
    expect(p1.timeline![0]!.unique).toBe(true);
    // `at` è un offset dall'inizio del round, non un timestamp assoluto.
    expect(p1.timeline![0]!.at).toBeGreaterThanOrEqual(0);
    expect(p1.timeline![0]!.at).toBeLessThan(room.roundDurationMs);
  });

  it('la timeline di round contiene solo le parole di QUEL round', () => {
    const room = new Room('TL01', DICT, 4, 2, 'normale', 60_000);
    room.addPlayer('p1', 'Alice');
    // Round 1: griglia forzata 'casa'.
    room.startRound();
    room.grid = fixedGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    const r1 = room.endRound();
    expect(r1[0]!.timeline!.map((w) => w.word)).toEqual(['casa']);
    // Round 2: nessuna parola → timeline vuota, ma `words` accumula la partita.
    room.startRound();
    room.grid = fixedGrid([...Array(16).fill('x')]);
    const r2 = room.endRound();
    expect(r2[0]!.timeline).toHaveLength(0);
    expect(room.players.get('p1')!.words.map((w) => w.word)).toContain('casa');
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

describe('Clip audio condivise in stanza', () => {
  it('addPlayer conserva le fasce audio del profilo e le espone in publicPlayers', () => {
    const room = new Room('SFX01', DICT, 4, 3);
    room.addPlayer('p1', 'Alice', '🐱', {
      id: 'profile-a',
      photoUrl: null,
      sfxSlots: ['3', '5'],
    });
    const [pub] = room.publicState().players;
    expect(pub!.profileId).toBe('profile-a');
    expect(pub!.sfxSlots).toEqual(['3', '5']);
  });

  it('chi non ha registrato clip non espone fasce', () => {
    const room = new Room('SFX02', DICT, 4, 3);
    room.addPlayer('p1', 'Alice', '🐱', { id: 'profile-a', photoUrl: null, sfxSlots: [] });
    const [pub] = room.publicState().players;
    expect(pub!.sfxSlots).toBeUndefined();
  });

  it('registry.sharesRoomWith consente solo a chi è nella stessa stanza', () => {
    const registry = new RoomRegistry(DICT);
    const room = registry.create(4, 1, 'normale', 60_000);
    room.addPlayer('p1', 'Alice', '🐱', { id: 'profile-a', photoUrl: null, sfxSlots: ['3'] });
    room.addPlayer('p2', 'Bob', '🐶', { id: 'profile-b', photoUrl: null, sfxSlots: ['4'] });

    // Stessa stanza: le clip dell'uno sono udibili dall'altro.
    expect(registry.sharesRoomWith('profile-a', 'profile-b')).toBe(true);
    expect(registry.sharesRoomWith('profile-b', 'profile-a')).toBe(true);
    // Se stessi: sempre consentito (è il proprietario).
    expect(registry.sharesRoomWith('profile-a', 'profile-a')).toBe(true);
    // Estraneo: nessuna condivisione.
    expect(registry.sharesRoomWith('profile-c', 'profile-a')).toBe(false);
    expect(registry.sharesRoomWith('profile-a', 'profile-c')).toBe(false);
  });
});

describe('musica della stanza e tracce disabilitate', () => {
  it('una traccia non più suonabile viene sostituita', () => {
    const room = new Room('MUS01', DICT, 4, 3);
    room.setMusic('classica');
    // Il server dice che `classica` è spenta: si passa alla prima attiva.
    room.ensureMusicExists((id) => id !== 'classica', 'overworld');
    expect(room.musicId).toBe('overworld');
  });

  it('una traccia ancora suonabile resta invariata', () => {
    const room = new Room('MUS02', DICT, 4, 3);
    room.setMusic('classica');
    room.ensureMusicExists(() => true, 'overworld');
    expect(room.musicId).toBe('classica');
  });

  it('se tutte le tracce sono spente si ricade sulla predefinita', () => {
    const room = new Room('MUS03', DICT, 4, 3);
    room.setMusic('overworld');
    // Nessun ripiego disponibile: si usa la predefinita, che è nel bundle.
    room.ensureMusicExists(() => false, undefined);
    expect(room.musicId).toBe('classica');
  });

  it('la musica spenta per scelta (`none`) non viene toccata', () => {
    const room = new Room('MUS04', DICT, 4, 3);
    room.setMusic('none');
    room.ensureMusicExists(() => false, 'overworld');
    expect(room.musicId).toBe('none');
  });
});

/*
 * Memoria delle schede giocate: è lei che impedisce di riproporre la stessa
 * scheda due volte nella stessa partita (vedi `randomUnplayed` e `SchedaMemory`).
 * Ha più livelli, e non si azzerano tutti allo stesso momento.
 */
describe('Room: memoria delle schede già viste', () => {
  const fakeScheda = (id: string) =>
    ({
      id,
      size: 4 as const,
      difficulty: 'facile' as const,
      variant: 'standard' as const,
      grid: 'casa\ncasa\ncasa\ncasa',
      words: ['casa'],
      allWords: ['casa'],
      longest: 4,
    });

  it('registra la scheda giocata e la tiene fra i round', () => {
    const room = new Room('SCH01', DICT, 4, 3);
    room.addPlayer('p1', 'Alice');
    expect(room.schedaMemory.all().size).toBe(0);

    room.startRound(fakeScheda('s-1'));
    expect(room.schedaMemory.has('s-1')).toBe(true);
    room.endRound();

    room.startRound(fakeScheda('s-2'));
    // La prima resta in memoria: il terzo round non la ripescherà.
    expect(room.schedaMemory.all()).toEqual(new Set(['s-1', 's-2']));
  });

  it('un round senza scheda (griglia generata) non sporca la memoria', () => {
    const room = new Room('SCH02', DICT, 4, 3);
    room.addPlayer('p1', 'Alice');
    room.startRound();
    expect(room.schedaId).toBeNull();
    expect(room.schedaMemory.all().size).toBe(0);
  });

  it('una scheda giocata entra nei livelli partita E stanza', () => {
    const room = new Room('SCH03', DICT, 4, 3);
    room.addPlayer('p1', 'Alice');
    room.startRound(fakeScheda('s-1'));
    expect(room.schedaMemory.ids('match').has('s-1')).toBe(true);
    expect(room.schedaMemory.ids('room').has('s-1')).toBe(true);
    // Il passato personale NON si accumula qui: è una copia delle cronologie dei
    // presenti, e si carica con `syncPlayerMemory` (vedi `SchedaMemory.record`).
    expect(room.schedaMemory.ids('player').size).toBe(0);
  });
});

/*
 * Il livello `player` della stanza (0.50.0): le cronologie dei presenti si
 * uniscono e la griglia smette di essere «una a caso del gruppo giusto».
 *
 * Il test non tocca SQLite: `syncPlayerMemory` prende una funzione che risponde
 * «quante volte ogni scheda è stata vista sommando questi profili» (nel server è
 * `ProfileStore.playedSchedaCounts`), così si possono provare le tre cose che
 * contano: la somma, chi entra/esce, e cosa succede con nessuno loggato.
 */
describe('Room.syncPlayerMemory: il passato dei presenti decide la griglia di tutti', () => {
  const scheda = (id: string) => ({
    id,
    size: 4 as const,
    difficulty: 'facile' as const,
    variant: 'standard' as const,
    grid: 'casa\ncasa\ncasa\ncasa',
    words: ['casa'],
    allWords: ['casa'],
    longest: 4,
  });

  /** Stanza con i giocatori dati: `null` = anonimo, senza cronologia. */
  function roomWith(...profileIds: Array<string | null>) {
    const room = new Room('MEM01', DICT, 4, 3);
    profileIds.forEach((pid, i) => {
      const id = `p${i + 1}`;
      room.addPlayer(id, `Giocatore ${i + 1}`, '🐱', pid ? { id: pid, photoUrl: null } : null);
    });
    return room;
  }

  /** Cronologia fissa per profilo, con le viste dello stesso id sommate. */
  const histories: Record<string, Record<string, number>> = {
    alice: { 'a': 2, 'b': 1 },
    bob: { 'b': 3, 'c': 1 },
  };
  const lookup = (ids: readonly string[]) => {
    const out = new Map<string, number>();
    for (const id of ids) {
      for (const [scheda, times] of Object.entries(histories[id] ?? {})) {
        out.set(scheda, (out.get(scheda) ?? 0) + times);
      }
    }
    return out;
  };

  it('unisce le cronologie sommandole', () => {
    const room = roomWith('alice', 'bob');
    expect(room.syncPlayerMemory(lookup)).toBe(3);
    expect([...room.schedaMemory.ids('player')].sort()).toEqual(['a', 'b', 'c']);
    // `b` l'hanno vista entrambi: 1 + 3 = 4.
    expect(room.schedaMemory.views('player').get('b')).toBe(4);
    expect(room.schedaMemory.views('player').get('a')).toBe(2);
  });

  it('la pesca preferisce la griglia che nessuno dei presenti ha visto', () => {
    // Pool reale del gruppo: tre schede. Alice e Bob le hanno viste tre su tre…
    const room = roomWith('alice', 'bob');
    room.syncPlayerMemory(lookup);
    const picked = pickScheda([{ id: 'a' }, { id: 'b' }, { id: 'c' }], room.schedaMemory, () => 0);
    // …e infatti tocca a una già vista, ma a QUELLA VISTA DI MENO: `c` (1) e `a`
    // (2) battano `b` (4).
    expect(picked?.relaxed).toEqual(['player']);
    expect(picked?.scheda.id).toBe('c');
    expect(picked?.seenTimes).toBe(1);
  });

  it('chi esce porta via la sua cronologia', () => {
    // Il livello si RICALCOLA: se si accumulasse, la storia di chi è andato via
    // continuerebbe a escludere schede per gente che non c'è più.
    const room = roomWith('alice', 'bob');
    room.syncPlayerMemory(lookup);
    room.removePlayer('p2');
    room.syncPlayerMemory(lookup);
    expect([...room.schedaMemory.ids('player')].sort()).toEqual(['a', 'b']);
    expect(room.schedaMemory.views('player').get('b')).toBe(1);
  });

  it('chi entra aggiunge la sua, anche se era già tutto visto', () => {
    const room = roomWith('alice');
    room.syncPlayerMemory(lookup);
    room.addPlayer('p2', 'Bob', '🐶', { id: 'bob', photoUrl: null });
    room.syncPlayerMemory(lookup);
    expect(room.schedaMemory.views('player').get('c')).toBe(1);
  });

  it('lo stesso profilo su due dispositivi non conta doppio', () => {
    const room = roomWith('alice', 'alice');
    expect(room.profileIds()).toEqual(['alice']);
    room.syncPlayerMemory(lookup);
    expect(room.schedaMemory.views('player').get('a')).toBe(2);
  });

  it('una stanza di soli anonimi non consulta nemmeno lo storico', () => {
    // Non è solo un'ottimizzazione: se la memoria restasse piena dal passato di
    // un profilo nel frattempo uscito, la pesca sarebbe condizionata da chi non
    // c'è più.
    const room = roomWith(null, null);
    let calls = 0;
    room.syncPlayerMemory((ids) => {
      calls += 1;
      return lookup(ids);
    });
    expect(calls).toBe(0);
    expect(room.schedaMemory.ids('player').size).toBe(0);
  });

  it('la rivincita nella stessa stanza non perde la memoria dei presenti', () => {
    // `startNewGame` azzera il livello della partita (la rivincita deve giocare
    // schede nuove) ma NON quello dei presenti: quella resta la loro storia.
    const room = roomWith('alice');
    room.syncPlayerMemory(lookup);
    room.startRound(scheda('z'));
    room.endRound();
    room.startNewGame();
    expect(room.schedaMemory.ids('match').size).toBe(0);
    expect([...room.schedaMemory.ids('player')].sort()).toEqual(['a', 'b']);
  });
});

/*
 * Dove entra un giocatore NUOVO.
 *
 * Due tappe nella regola: prima della 0.47.0 la stanza rifiutava chiunque non
 * fosse arrivato in lobby ("Partita già iniziata"), la 0.48.0 ha aperto fino
 * alla fine del round 1. Dal 0.49.0 la stanza sopravvive alla partita, quindi
 * il "troppo tardi" non lascia più nessuno fuori: si entra e si gioca la
 * partita dopo. La regola vive tutta in `Room.seatForNewPlayer`.
 */
describe('Room.seatForNewPlayer: giocare adesso o mettersi in attesa', () => {
  /** Stanza con l'host, spinta alla fase richiesta senza passare dal timer. */
  function roomAt(opts: {
    phase: Room['phase'];
    currentRound?: number;
    rounds?: number;
  }) {
    const room = new Room('AMM01', DICT, 4, opts.rounds ?? 3);
    room.addPlayer('p1', 'Alice');
    room.currentRound = opts.currentRound ?? 0;
    room.phase = opts.phase;
    return room;
  }

  it('in lobby gioca subito (comportamento storico)', () => {
    expect(roomAt({ phase: 'lobby' }).seatForNewPlayer()).toBe('now');
  });

  it('gioca subito anche al countdown che precede il round 1', () => {
    expect(roomAt({ phase: 'countdown', currentRound: 0 }).seatForNewPlayer()).toBe('now');
  });

  it('gioca subito con il round 1 in corso', () => {
    expect(roomAt({ phase: 'playing', currentRound: 1 }).seatForNewPlayer()).toBe('now');
  });

  it('gioca subito nella pausa dopo il round 1: fa il round successivo', () => {
    expect(roomAt({ phase: 'roundEnd', currentRound: 1, rounds: 3 }).seatForNewPlayer()).toBe('now');
  });

  it('gioca subito al countdown del round 2 (di round ne ha saltato uno)', () => {
    expect(roomAt({ phase: 'countdown', currentRound: 1 }).seatForNewPlayer()).toBe('now');
  });

  it('dal round 2 in poi entra in attesa della prossima partita', () => {
    // Non è più un rifiuto: entra nella stanza (stesso codice, stessi amici) e
    // gioca subito la partita dopo. Il confine del round 2 resta, cambia il
    // premio: nessuno si ritrova in una classifica già fatta a metà.
    expect(roomAt({ phase: 'playing', currentRound: 2 }).seatForNewPlayer()).toBe('nextMatch');
    expect(roomAt({ phase: 'playing', currentRound: 3 }).seatForNewPlayer()).toBe('nextMatch');
    expect(roomAt({ phase: 'roundEnd', currentRound: 2, rounds: 3 }).seatForNewPlayer()).toBe(
      'nextMatch',
    );
  });

  it('a partita conclusa entra in attesa della rivincita', () => {
    expect(roomAt({ phase: 'gameEnd', currentRound: 3, rounds: 3 }).seatForNewPlayer()).toBe(
      'nextMatch',
    );
  });

  it('con un solo round, la pausa dopo il round 1 è già fine partita', () => {
    // round 1 = ultimo round: non c'è un round successivo da giocare, quindi chi
    // arriva adesso aspetta la partita nuova.
    expect(roomAt({ phase: 'roundEnd', currentRound: 1, rounds: 1 }).seatForNewPlayer()).toBe(
      'nextMatch',
    );
    // Il round 1 in corso, invece, si può ancora raggiungere.
    expect(roomAt({ phase: 'playing', currentRound: 1, rounds: 1 }).seatForNewPlayer()).toBe('now');
  });

  it('un round in corso è in corso anche a partita conclusa sulla carta', () => {
    // `isGameOver()` guarda i round GIOCATI: con un solo round, mentre il round 1
    // è in corso restituisce true. Chi decide la sede non deve confondersi,
    // altrimenti un minuto di ritardo costerebbe l'attesa di una partita intera.
    const room = roomAt({ phase: 'playing', currentRound: 1, rounds: 1 });
    expect(room.isGameOver()).toBe(true);
    expect(room.seatForNewPlayer()).toBe('now');
  });
});

/*
 * «Gioca ancora»: la stessa stanza gioca una partita nuova.
 *
 * È il cuore della 0.49.0. Quello che conta qui è cosa si azzera e cosa NO:
 * «partita nuova» deve voler dire «schede nuove», «stessi amici» deve voler
 * dire «stesso codice, stessa musica, nessuno che riscrive il link».
 */
describe('Room.startNewGame: rigiocare nella stessa stanza', () => {
  const fakeScheda = (id: string) =>
    ({
      id,
      size: 4 as const,
      difficulty: 'facile' as const,
      variant: 'standard' as const,
      grid: 'casa\ncasa\ncasa\ncasa',
      words: ['casa'],
      allWords: ['casa'],
      longest: 4,
    });

  /** Stanza con due giocatori che hanno già giocato un round. */
  function playedRoom() {
    const room = new Room('RVN01', DICT, 4, 2, 'normale', 60_000);
    room.addPlayer('p1', 'Alice');
    room.addPlayer('p2', 'Bob');
    room.startRound(fakeScheda('s-1'));
    room.grid = fixedGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    room.endRound();
    return room;
  }

  it('riporta la stanza in lobby con i punteggi azzerati', () => {
    const room = playedRoom();
    expect(room.players.get('p1')!.totalScore).toBeGreaterThan(0);

    room.startNewGame();

    expect(room.phase).toBe('lobby');
    expect(room.currentRound).toBe(0);
    expect(room.isGameOver()).toBe(false);
    for (const p of room.players.values()) {
      expect(p.totalScore).toBe(0);
      expect(p.roundScore).toBe(0);
      expect(p.words).toEqual([]);
      expect(p.roundWords.size).toBe(0);
      expect(p.roundTimeline).toEqual([]);
    }
  });

  it('non tocca l identità della stanza: codice, giocatori, host, impostazioni, musica', () => {
    const room = playedRoom();
    room.setMusic('overworld');
    const before = room.publicState();

    room.startNewGame();
    const after = room.publicState();

    expect(after.code).toBe(before.code);
    expect(after.hostId).toBe(before.hostId);
    expect(after.gridSize).toBe(before.gridSize);
    expect(after.difficulty).toBe(before.difficulty);
    expect(after.rounds).toBe(before.rounds);
    expect(after.roundDurationMs).toBe(before.roundDurationMs);
    expect(after.maxPlayers).toBe(before.maxPlayers);
    expect(after.schedaVariant).toBe(before.schedaVariant);
    expect(after.musicId).toBe('overworld');
    expect(after.players.map((p) => p.id)).toEqual(before.players.map((p) => p.id));
    // La classifica finale non passa nei dati pubblici: i punteggi sono 0.
    expect(after.players.every((p) => p.score === 0)).toBe(true);
  });

  it('conta le partite: la rivincita è la numero 2', () => {
    const room = playedRoom();
    expect(room.matchNumber).toBe(1);
    room.startNewGame();
    expect(room.matchNumber).toBe(2);
    expect(room.publicState().matchNumber).toBe(2);
    room.startRound(fakeScheda('s-9'));
    room.endRound();
    room.startNewGame();
    expect(room.matchNumber).toBe(3);
  });

  it('la rivincita pescherà schede nuove: resta la memoria della stanza', () => {
    const room = playedRoom();
    room.startRound(fakeScheda('s-2'));
    room.endRound();
    expect(room.schedaMemory.ids('match').size).toBe(2);

    room.startNewGame();

    // `match` vuoto: si può ripescare liberamente. `room` pieno: la pesca
    // esclude comunque le schede della partita finita (test del catalogo).
    expect(room.schedaMemory.ids('match').size).toBe(0);
    expect([...room.schedaMemory.ids('room')]).toEqual(['s-1', 's-2']);
  });

  it('azzera la scheda in gioco e quella scelta in lobby', () => {
    const room = playedRoom();
    room.grid = fixedGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.schedaId = 's-1';
    room.pendingSchedaId = 's-3';
    room.startNewGame();
    expect(room.grid).toBeNull();
    expect(room.schedaId).toBeNull();
    // La pending era la scheda scelta per un round della partita finita:
    // riesumarla significherebbe rigiocare la griglia di cinque minuti prima.
    expect(room.pendingSchedaId).toBeNull();
  });

  it('rimette in gioco la partita nuova: i round ripartono da uno', () => {
    const room = playedRoom();
    room.startNewGame();
    const { grid, endsAt } = room.startRound(fakeScheda('s-7'));
    expect(room.currentRound).toBe(1);
    expect(room.phase).toBe('playing');
    expect(grid.tiles).toHaveLength(16);
    expect(endsAt).toBeGreaterThan(Date.now());
    // E il punteggio riparte da zero: non si somma alla partita precedente.
    room.grid = fixedGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    expect(room.players.get('p1')!.totalScore).toBe(2);
  });

  it('dichiara la nuova partita non ancora registrata in classifica', () => {
    const room = playedRoom();
    room.gamesPersisted = true;
    room.startNewGame();
    // Se restasse true, la seconda partita non verrebbe mai salvata.
    expect(room.gamesPersisted).toBe(false);
  });
});

/*
 * Chi arriva quando la partita non è più raggiungibile, si SIEDE.
 *
 * Un giocatore in attesa è in stanza a tutti gli effetti (compare nella lista,
 * può parlare) ma non gioca la partita corrente: niente parole, niente
 * classifica, niente partite salvate. La partizione sta in `Room.matchPlayers`.
 */
describe('Room: chi aspetta la prossima partita', () => {
  function roomPlaying() {
    const room = new Room('ATT01', DICT, 4, 2, 'normale', 60_000);
    room.addPlayer('p1', 'Alice');
    room.startRound();
    room.grid = fixedGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    return room;
  }

  /** Giocatore «in attesa», come lo crea `room:join` con `seat = nextMatch`. */
  function seated(room: Room, id: string, nickname: string) {
    const p = room.addPlayer(id, nickname);
    p.waiting = true;
    return p;
  }

  it('non può inviare parole', () => {
    const room = roomPlaying();
    seated(room, 'p9', 'Ritardatario');
    const res = room.submitWord('p9', 'casa', [0, 1, 2, 3]);
    expect(res.accepted).toBe(false);
    expect(res.reason).toMatch(/attesa/);
    // Chi gioca, invece, può.
    expect(room.submitWord('p1', 'casa', [0, 1, 2, 3]).accepted).toBe(true);
  });

  it('non compare nei risultati del round né nella classifica finale', () => {
    const room = roomPlaying();
    seated(room, 'p9', 'Ritardatario');
    room.submitWord('p1', 'casa', [0, 1, 2, 3]);
    expect(room.endRound().map((r) => r.playerId)).toEqual(['p1']);
    expect(room.finalScores().map((r) => r.playerId)).toEqual(['p1']);
  });

  it('è comunque visibile in stanza, col suo segnaposto', () => {
    const room = roomPlaying();
    seated(room, 'p9', 'Ritardatario');
    const waiting = room.publicState().players.find((p) => p.id === 'p9');
    expect(waiting?.waiting).toBe(true);
    expect(room.publicState().players.find((p) => p.id === 'p1')?.waiting).toBeUndefined();
  });

  it('occupa un posto in stanza', () => {
    const room = new Room('ATT02', DICT, 4, 1, 'normale', 60_000, 2);
    room.addPlayer('p1', 'Alice');
    seated(room, 'p9', 'Ritardatario');
    expect(room.isFull).toBe(true);
  });

  it('il suo socket è escluso dagli eventi del round', () => {
    const room = roomPlaying();
    const waiting = seated(room, 'p9', 'Ritardatario');
    waiting.socketId = 'sock-9';
    room.players.get('p1')!.socketId = 'sock-1';
    expect(room.waitingSockets()).toEqual(['sock-9']);
  });

  it('con la partita nuova smette di aspettare', () => {
    const room = roomPlaying();
    seated(room, 'p9', 'Ritardatario');
    room.endRound();
    room.startRound();
    room.endRound();

    room.startNewGame();

    expect(room.players.get('p9')!.waiting).toBe(false);
    // E da quel momento gioca: la parola viene accettata.
    room.startRound();
    room.grid = fixedGrid(['c', 'a', 's', 'a', ...Array(12).fill('x')]);
    expect(room.submitWord('p9', 'casa', [0, 1, 2, 3]).accepted).toBe(true);
  });
});

/*
 * Pulizia delle stanze.
 *
 * Dal 0.49.0 una stanza ferma alla classifica finale è un posto utile (lì si
 * decide se giocare ancora), quindi non si cancella per età anagrafica: si
 * cancella quando non c'è più nessuno connesso da tempo.
 */
describe('RoomRegistry.cleanup: stanze abbandonate', () => {
  function registryWithRoom() {
    const registry = new RoomRegistry(DICT);
    const room = registry.create(4, 1, 'normale', 60_000);
    room.addPlayer('p1', 'Alice');
    return { registry, room };
  }

  it('una stanza alla classifica finale resta aperta se qualcuno è connesso', () => {
    const { registry, room } = registryWithRoom();
    room.phase = 'gameEnd';
    room.roundEndsAt = Date.now() - 60 * 60_000;
    expect(registry.cleanup()).toBe(0);
    expect(registry.get(room.code)).toBeDefined();
  });

  it('la stessa stanza, con nessuno connesso da dieci minuti, si chiude', () => {
    const { registry, room } = registryWithRoom();
    room.phase = 'gameEnd';
    room.players.get('p1')!.connected = false;
    room.lastActivityAt = Date.now() - 11 * 60_000;
    expect(registry.cleanup()).toBe(1);
    expect(registry.get(room.code)).toBeUndefined();
  });

  it('si chiude anche una lobby abbandonata, non solo una partita finita', () => {
    const { registry, room } = registryWithRoom();
    room.players.get('p1')!.connected = false;
    room.lastActivityAt = Date.now() - 11 * 60_000;
    expect(registry.cleanup()).toBe(1);
  });

  it('chi ha giocato da poco non viene mai buttato fuori', () => {
    const { registry, room } = registryWithRoom();
    room.phase = 'gameEnd';
    room.lastActivityAt = Date.now();
    room.players.get('p1')!.connected = false;
    expect(registry.cleanup()).toBe(0);
  });

  it('una stanza senza giocatori si chiude subito', () => {
    const { registry, room } = registryWithRoom();
    room.removePlayer('p1');
    expect(registry.cleanup()).toBe(1);
  });
});
