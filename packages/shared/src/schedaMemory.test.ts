import { describe, expect, it } from 'vitest';
import { pickScheda, SCHEDA_MEMORY_LAYERS, SchedaMemory } from './schedaMemory.js';

/** Conteggi di un livello come li produce il server (`playedSchedaCounts`). */
const views = (entries: Array<[string, number]>) => new Map(entries);

/** Pool di soli id: a `pickScheda` interessa solo quello. */
const pool = (ids: string[]) => ids.map((id) => ({ id }));

describe('SchedaMemory', () => {
  it('parte vuota su tutti i livelli', () => {
    const memory = new SchedaMemory();
    for (const layer of SCHEDA_MEMORY_LAYERS) expect(memory.ids(layer).size).toBe(0);
    expect(memory.all().size).toBe(0);
    expect(memory.has('x')).toBe(false);
  });

  it('record mette la scheda nella partita E nella stanza, mai nel passato', () => {
    const memory = new SchedaMemory();
    memory.record('s-1');
    expect(memory.ids('match').has('s-1')).toBe(true);
    expect(memory.ids('room').has('s-1')).toBe(true);
    // Il passato è la cronologia personale: la scrive il server (`played_schede`)
    // e in stanza la si CARICA dai profili dei presenti con `setViews`, non la si
    // accumula round per round (vedi l'intestazione del modulo).
    expect(memory.ids('player').has('s-1')).toBe(false);
  });

  it('startMatch azzera la partita e lascia stare il resto', () => {
    const memory = new SchedaMemory({ player: ['p-old'] });
    memory.record('s-1');
    memory.startMatch();
    expect(memory.ids('match').size).toBe(0);
    expect(memory.ids('room')).toEqual(new Set(['s-1']));
    expect(memory.ids('player')).toEqual(new Set(['p-old']));
  });

  it('il secondo record della stessa partita non cancella il primo', () => {
    const memory = new SchedaMemory();
    memory.record('s-1');
    memory.record('s-2');
    memory.startMatch();
    expect([...memory.ids('room')]).toEqual(['s-1', 's-2']);
  });

  it('setLayer sostituisce (la cronologia dei presenti si ricalcola)', () => {
    const memory = new SchedaMemory({ player: ['a', 'b'] });
    memory.setLayer('player', ['c']);
    expect([...memory.ids('player')]).toEqual(['c']);
    // Chi esce dalla stanza porta via la sua cronologia, non la lascia in dote.
    memory.setLayer('player', []);
    expect(memory.ids('player').size).toBe(0);
  });

  it('setViews porta via anche i conteggi, non solo gli id', () => {
    // Il livello `player` di una stanza si ricalcola da zero a ogni sync: se i
    // conteggi vecchi restassero, una scheda uscita dal livello continuerebbe a
    // pesare nelle scelte.
    const memory = new SchedaMemory({ player: views([['a', 3], ['b', 1]]) });
    expect(memory.views('player').get('a')).toBe(3);
    expect(memory.ids('player')).toEqual(new Set(['a', 'b']));
    memory.setViews('player', views([['c', 2]]));
    expect([...memory.ids('player')]).toEqual(['c']);
    expect(memory.views('player').has('a')).toBe(false);
    expect(memory.views('player').get('c')).toBe(2);
  });

  it('un seme Map vale come id con conteggio, un elenco vale 1', () => {
    // Il costruttore accetta entrambe le forme: il single player passa un
    // elenco di id, la stanza i conteggi dei presenti.
    const fromList = new SchedaMemory({ player: ['a', 'b'] });
    expect(fromList.timesSeen('a')).toBe(1);
    const fromCounts = new SchedaMemory({ player: views([['a', 4]]) });
    expect(fromCounts.timesSeen('a')).toBe(4);
    expect(fromCounts.has('a')).toBe(true);
  });

  it('rigiocare la stessa scheda fa crescere il conteggio della stanza', () => {
    // Serve a preferire, alla pesca successiva, la scheda che la stanza ha
    // proposto una volta invece di quella che ha già ripetuto.
    const memory = new SchedaMemory();
    memory.record('a');
    memory.record('a');
    expect(memory.views('room').get('a')).toBe(2);
    expect(memory.ids('room').size).toBe(1);
  });

  it('has guarda qualunque livello', () => {
    const memory = new SchedaMemory({ player: ['a'] });
    expect(memory.has('a')).toBe(true);
    expect(memory.has('b')).toBe(false);
  });

  it('clear azzera tutto', () => {
    const memory = new SchedaMemory({ match: ['a'], room: ['b'], player: ['c'] });
    memory.clear();
    expect(memory.all().size).toBe(0);
  });
});

describe('pickScheda', () => {
  it('senza memoria pesca nel pool', () => {
    const choice = pickScheda(pool(['a', 'b']), undefined, () => 0);
    expect(choice?.scheda.id).toBe('a');
    expect(choice?.relaxed).toEqual([]);
  });

  it('con il pool vuoto non inventa niente', () => {
    expect(pickScheda([], new SchedaMemory())).toBeNull();
  });

  it('evita tutto ciò che la memoria conosce', () => {
    const memory = new SchedaMemory({ match: ['a'], room: ['b'], player: ['c'] });
    const choice = pickScheda(pool(['a', 'b', 'c', 'd']), memory, () => 0);
    expect(choice?.scheda.id).toBe('d');
    expect(choice?.relaxed).toEqual([]);
  });

  it('sceglie fra le pulite quando ce ne sono più di una', () => {
    const memory = new SchedaMemory({ room: ['a', 'b'] });
    // rng = 0.99 su due candidati deve prendere l'ultimo.
    expect(pickScheda(pool(['a', 'b', 'c', 'd']), memory, () => 0.99)?.scheda.id).toBe('d');
    expect(pickScheda(pool(['a', 'b', 'c', 'd']), memory, () => 0)?.scheda.id).toBe('c');
  });

  it('allenta il passato prima della partita', () => {
    // `a` vista solo in passato, `b` giocata in questa partita: nessuna pulita,
    // e la preferenza (passato) cede mentre il vincolo (partita) tiene.
    const memory = new SchedaMemory({ player: ['a'], match: ['b'] });
    const choice = pickScheda(pool(['a', 'b']), memory, () => 0);
    expect(choice?.scheda.id).toBe('a');
    expect(choice?.relaxed).toEqual(['player']);
  });

  it('allenta la stanza dopo il passato, ma prima della partita', () => {
    // `a` e `b` viste nella stanza, `c` giocata adesso: si molla la stanza e
    // resta la partita. Il livello `player`, vuoto, non compare fra quelli
    // allentati: non ha escluso niente.
    const memory = new SchedaMemory({ room: ['a', 'b'], match: ['c'] });
    const choice = pickScheda(pool(['a', 'b', 'c']), memory, () => 0);
    expect(choice?.scheda.id).toBe('a');
    expect(choice?.relaxed).toEqual(['room']);
  });

  it('quando ha esaurito tutto riparte dal pool', () => {
    // Caso reale: la stanza ha visto ogni scheda del gruppo.
    const memory = new SchedaMemory({ room: ['a', 'b'], match: ['a', 'b'] });
    const choice = pickScheda(pool(['a', 'b']), memory, () => 0.5);
    expect(['a', 'b']).toContain(choice!.scheda.id);
    // La partita è l'ultimo vincolo a cadere: se cade, sono caduti tutti quelli
    // che avevano qualcosa da dire (qui `player` è vuoto e non compare).
    expect(choice?.relaxed).toEqual(['room', 'match']);
  });

  it('un livello vuoto non conta fra quelli allentati', () => {
    // `player` è vuoto (stanza normale): dichiararlo «allentato» racconterebbe
    // una cosa che non è successa.
    const memory = new SchedaMemory({ room: ['a'] });
    const choice = pickScheda(pool(['a']), memory, () => 0);
    expect(choice?.scheda.id).toBe('a');
    expect(choice?.relaxed).toEqual(['room']);
  });

  it('rinunciando al passato sceglie la scheda con la somma di contatori più bassa', () => {
    // Il caso della 0.50.0: quattro giocatori in stanza, pool da tre. `a` e `c`
    // sommano tre viste, `b` una: la griglia tocca a `b` per qualunque sorteggio,
    // perché «nessuno l'ha mai vista» non è più ottenibile.
    const memory = new SchedaMemory({ player: views([['a', 3], ['b', 1], ['c', 3]]) });
    for (const r of [0, 0.33, 0.5, 0.99]) {
      const choice = pickScheda(pool(['a', 'b', 'c']), memory, () => r);
      expect(choice?.scheda.id).toBe('b');
      expect(choice?.relaxed).toEqual(['player']);
      expect(choice?.seenTimes).toBe(1);
    }
  });

  it('«vista di meno» è la SOMMA dei contatori, non il numero di testimoni', () => {
    // Il caso che distingue le due misure: `tutto-uno` è nel passato di sette
    // giocatori una volta cadauno (somma 7), `cento-volte` è nel passato di uno
    // solo ma per cento volte (somma 100). Contando le persone avrebbe vinto
    // `cento-volte` (un testimone contro sette); contando le volte vince
    // `tutto-uno`, ed è la regola voluta: una griglia girata cento volte in
    // stanza è più vista di una girata una volta sola da qualcuno.
    const memory = new SchedaMemory({ player: views([['cento-volte', 100], ['tutto-uno', 7]]) });
    const choice = pickScheda(pool(['cento-volte', 'tutto-uno']), memory, () => 0);
    expect(choice?.scheda.id).toBe('tutto-uno');
    expect(choice?.seenTimes).toBe(7);
    // Non è merito del sorteggio: invertendo il pool la scelta resta.
    expect(pickScheda(pool(['tutto-uno', 'cento-volte']), memory, () => 0.99)?.scheda.id).toBe(
      'tutto-uno',
    );
  });

  it('a pari merito si sorteggia fra le meno viste, non fra tutte', () => {
    // `a` e `c` viste da due, `b` da una: il sorteggio deve poterle scegliere
    // entrambe (`a` con rng 0, `c` con rng 0.99) senza mai passare da `b`.
    const memory = new SchedaMemory({ player: views([['a', 2], ['b', 1], ['c', 2]]) });
    // Con `b` unica meno vista il sorteggio non si esprime: la si toglie.
    const noB = pool(['a', 'c']);
    expect(pickScheda(noB, memory, () => 0)?.scheda.id).toBe('a');
    expect(pickScheda(noB, memory, () => 0.99)?.scheda.id).toBe('c');
    expect(pickScheda(pool(['a', 'b', 'c']), memory, () => 0.99)?.scheda.id).toBe('b');
  });

  it('il conteggio somma i livelli mollati, non quelli che tengono', () => {
    // `a`: vista da 1 giocatore e giocata in questa partita; `b`: vista da 3 ma
    // mai giocata qui. La partita è un vincolo, quindi `a` non è un candidato:
    // resta `b`, con i suoi tre «già visto» addosso.
    const memory = new SchedaMemory({ player: views([['a', 1], ['b', 3]]), match: ['a'] });
    const choice = pickScheda(pool(['a', 'b']), memory, () => 0);
    expect(choice?.scheda.id).toBe('b');
    expect(choice?.relaxed).toEqual(['player']);
    expect(choice?.seenTimes).toBe(3);
  });

  it('quando tutto è già visto preferisce la meno vista anche fra i livelli duri', () => {
    // La stanza ha giocato due volte `a` e una volta `b`, e non c'è altro:
    // cadono stanza e partita, e si ripiega su `b`, la meno proposta.
    const memory = new SchedaMemory();
    memory.record('a');
    memory.startMatch();
    memory.record('a');
    memory.record('b');
    const choice = pickScheda(pool(['a', 'b']), memory, () => 0);
    expect(choice?.scheda.id).toBe('b');
    expect(choice?.relaxed).toEqual(['room', 'match']);
    // `b` pesa 2 (una volta in stanza e la stessa volta ricopiata nella partita
    // in corso), `a` pesa 3: tutti e due i livelli mollati raccontano una scheda
    // già giocata, quindi si sommano.
    expect(choice?.seenTimes).toBe(2);
    expect(memory.timesSeen('a')).toBe(3);
  });

  it('senza memoria il sorteggio è quello di sempre (un solo rng)', () => {
    // Regressione: la scelta «meno vista» non deve mangiarsi valori di `rng`, o
    // i sorteggi dei pool puliti cambierebbero distribuzione.
    const seen: number[] = [];
    const rng = () => {
      seen.push(0);
      return 0.5;
    };
    pickScheda(pool(['a', 'b', 'c']), new SchedaMemory({ room: ['a'] }), rng);
    expect(seen).toHaveLength(1);
  });

  it('una partita nuova nella stessa stanza ripropone solo ciò che non si è mai visto', () => {
    // Il comportamento voluto dalla 0.49.0: dopo `startMatch` la partita è
    // libera, ma la stanza ha ancora memoria delle griglie giocate.
    const memory = new SchedaMemory();
    memory.record('a');
    memory.record('b');
    memory.startMatch();
    const picked = pickScheda(pool(['a', 'b', 'c']), memory, () => 0);
    expect(picked?.scheda.id).toBe('c');
  });
});
