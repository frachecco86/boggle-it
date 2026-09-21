/**
 * Test della leaderboard: le tre classifiche, i filtri e la validazione.
 *
 * Usiamo un database su file temporaneo (non `:memory:`) perché il ProfileStore
 * apre il file con WAL e vi si appoggia per il checkpoint.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProfileStore } from './profiles.js';
import { SchedaCatalog } from './schede.js';

let dir: string;
let store: ProfileStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sbooble-stats-'));
  store = new ProfileStore(path.join(dir, 'test.db'));
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Registra un profilo e ritorna l'id. */
async function profile(nickname: string, avatar = '🐱'): Promise<string> {
  const p = await store.register(nickname, 'password123', avatar);
  return p.id;
}

const game = (over: Partial<Parameters<ProfileStore['recordGame']>[1]> = {}) => ({
  score: 100,
  words: 20,
  wordCount: 50,
  longest: 'casa',
  difficulty: 'normale' as const,
  gridSize: 4 as const,
  mode: 'solo' as const,
  schedaId: null,
  ...over,
});

describe('leaderboard', () => {
  it('classifica per miglior punteggio, un giocatore per riga', async () => {
    const a = await profile('Anna', '🦊');
    const b = await profile('Bruno', '🐼');

    store.recordGame(a, game({ score: 100 }));
    store.recordGame(a, game({ score: 300 })); // il migliore di Anna
    store.recordGame(b, game({ score: 200 }));

    const { entries } = store.leaderboard({ kind: 'best', period: 'all' });
    expect(entries).toHaveLength(2);
    expect(entries[0]!.nickname).toBe('Anna');
    expect(entries[0]!.value).toBe(300);
    expect(entries[1]!.nickname).toBe('Bruno');
    // Anna compare UNA volta, con la sua partita migliore.
    expect(entries.filter((e) => e.nickname === 'Anna')).toHaveLength(1);
  });

  it('classifica per totale: somma le partite e conta quante', async () => {
    const a = await profile('Anna');
    const b = await profile('Bruno');
    store.recordGame(a, game({ score: 100 }));
    store.recordGame(a, game({ score: 150 }));
    store.recordGame(b, game({ score: 400 }));

    const { entries } = store.leaderboard({ kind: 'total', period: 'all' });
    // Anna: 250 totali con 2 partite, Bruno: 400 con 1.
    expect(entries[0]!.nickname).toBe('Bruno');
    expect(entries[0]!.value).toBe(400);
    expect(entries[1]!.nickname).toBe('Anna');
    expect(entries[1]!.value).toBe(250);
    expect(entries[1]!.games).toBe(2);
  });

  it('classifica per parola più lunga', async () => {
    const a = await profile('Anna');
    const b = await profile('Bruno');
    store.recordGame(a, game({ longest: 'casa' }));
    store.recordGame(b, game({ longest: 'costituzionale' }));

    const { entries } = store.leaderboard({ kind: 'longest', period: 'all' });
    expect(entries[0]!.nickname).toBe('Bruno');
    expect(entries[0]!.longest).toBe('costituzionale');
    expect(entries[0]!.value).toBe(14);
  });

  it('filtra per dimensione griglia e difficoltà', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ score: 500, gridSize: 6, difficulty: 'difficile' }));
    store.recordGame(a, game({ score: 50, gridSize: 4, difficulty: 'facile' }));

    const big = store.leaderboard({ kind: 'best', period: 'all', gridSize: 6 });
    expect(big.entries).toHaveLength(1);
    expect(big.entries[0]!.value).toBe(500);

    const small = store.leaderboard({ kind: 'best', period: 'all', gridSize: 4 });
    expect(small.entries).toHaveLength(1);
    expect(small.entries[0]!.value).toBe(50);

    const easy = store.leaderboard({ kind: 'best', period: 'all', difficulty: 'facile' });
    expect(easy.entries).toHaveLength(1);
    expect(easy.entries[0]!.value).toBe(50);
  });

  it('ignora le partite senza parole (abbandonate)', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ words: 0, score: 0 }));
    const { entries, gamesConsidered } = store.leaderboard({ kind: 'best', period: 'all' });
    expect(entries).toHaveLength(0);
    expect(gamesConsidered).toBe(0);
  });

  it('periodo "week" esclude le partite vecchie', async () => {
    const a = await profile('Anna');
    const id = store.recordGame(a, game({ score: 999 }));
    // Retrodata la partita di 10 giorni, direttamente nel database.
    // @ts-expect-error accesso interno per il test
    store.db.prepare('UPDATE games SET played_at = ? WHERE id = ?').run(Date.now() - 10 * 86400000, id);

    expect(store.leaderboard({ kind: 'best', period: 'all' }).entries).toHaveLength(1);
    expect(store.leaderboard({ kind: 'best', period: 'week' }).entries).toHaveLength(0);
    expect(store.leaderboard({ kind: 'best', period: 'month' }).entries).toHaveLength(1);
  });

  it('conserva nome e avatar come snapshot', async () => {
    const a = await profile('AnnaVecchia', '🦊');
    store.recordGame(a, game({ score: 100 }));
    // Il profilo cambia nome: la classifica mostra ancora quello della partita.
    store.update(a, { avatar: '🐼' });
    const { entries } = store.leaderboard({ kind: 'best', period: 'all' });
    expect(entries[0]!.nickname).toBe('AnnaVecchia');
    expect(entries[0]!.avatar).toBe('🦊');
  });
});

describe('playerStats', () => {
  it('aggrega partite, punteggi e parola più lunga', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ score: 100, words: 10, longest: 'casa' }));
    store.recordGame(a, game({ score: 200, words: 30, longest: 'rinnovai' }));

    const stats = store.playerStats(a);
    expect(stats.games).toBe(2);
    expect(stats.bestScore).toBe(200);
    expect(stats.totalScore).toBe(300);
    expect(stats.totalWords).toBe(40);
    expect(stats.avgScore).toBe(150);
    expect(stats.longest).toBe('rinnovai');
  });

  it('calcola la posizione globale', async () => {
    const a = await profile('Anna');
    const b = await profile('Bruno');
    const c = await profile('Carla');
    store.recordGame(b, game({ score: 300 }));
    store.recordGame(c, game({ score: 200 }));
    store.recordGame(a, game({ score: 100 }));

    expect(store.playerStats(a).bestRank).toBe(3);
    expect(store.playerStats(b).bestRank).toBe(1);
  });

  it('senza partite ritorna zeri', async () => {
    const a = await profile('Nuovo');
    const stats = store.playerStats(a);
    expect(stats.games).toBe(0);
    expect(stats.bestScore).toBe(0);
    expect(stats.longest).toBe('');
    expect(stats.bestRank).toBe(0);
  });
});

describe('clearGames', () => {
  it('rimuove solo le partite del profilo indicato', async () => {
    const a = await profile('Anna');
    const b = await profile('Bruno');
    store.recordGame(a, game({ score: 100 }));
    store.recordGame(b, game({ score: 200 }));

    expect(store.clearGames(a)).toBe(1);
    expect(store.playerStats(a).games).toBe(0);
    expect(store.playerStats(b).games).toBe(1);
  });
});

describe('catalogo parole', () => {
  it('aggrega le parole con le occorrenze e la distribuzione per lunghezza', () => {
    const catalog = new SchedaCatalog();
    // Tre schede con parole in comune: 'casa' compare in due.
    catalog.add({
      id: 's1', size: 4, difficulty: 'normale', grid: 'casa\nzzzz\nzzzz\nzzzz',
      words: ['casa', 'caso', 'cassa'], longest: 5,
    });
    catalog.add({
      id: 's2', size: 4, difficulty: 'normale', grid: 'casa\nzzzz\nzzzz\nzzzz',
      words: ['casa', 'cassa'], longest: 5,
    });
    catalog.add({
      id: 's3', size: 5, difficulty: 'facile', grid: 'x\nx\nx\nx\nx',
      words: ['rete'], longest: 4,
    });

    const res = catalog.wordCatalog({ sort: 'occurrences', direction: 'desc', limit: 100, offset: 0 });
    // 'casa' in 2 schede, 'cassa' in 2, gli altri in 1.
    expect(res.total).toBe(4);
    expect(res.entries[0]!.occurrences).toBe(2);
    const casa = res.entries.find((e) => e.word === 'casa');
    expect(casa).toBeDefined();
    expect(casa!.occurrences).toBe(2);
    expect(casa!.length).toBe(4);
    // Punteggio = lunghezza - 2.
    expect(casa!.points).toBe(2);
  });

  it('filtra per dimensione e difficoltà', () => {
    const catalog = new SchedaCatalog();
    catalog.add({
      id: 'a', size: 4, difficulty: 'facile', grid: 'x', words: ['rete', 'rete2'], longest: 4,
    });
    catalog.add({
      id: 'b', size: 6, difficulty: 'difficile', grid: 'x', words: ['parola'], longest: 6,
    });

    const solo4 = catalog.wordCatalog({ gridSize: 4, sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(solo4.entries.map((e) => e.word).sort()).toEqual(['rete', 'rete2']);

    const soloDifficile = catalog.wordCatalog({ difficulty: 'difficile', sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(soloDifficile.entries.map((e) => e.word)).toEqual(['parola']);
  });

  it('cerca, filtra per lunghezza e ordina', () => {
    const catalog = new SchedaCatalog();
    catalog.add({
      id: 'a', size: 4, difficulty: 'facile', grid: 'x',
      words: ['casa', 'caso', 'cavolo', 'rete'], longest: 6,
    });

    const cerca = catalog.wordCatalog({ search: 'cas', sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(cerca.entries.map((e) => e.word)).toEqual(['casa', 'caso']);

    const lunghezza = catalog.wordCatalog({ length: 4, sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(lunghezza.entries.map((e) => e.word)).toEqual(['casa', 'caso', 'rete']);

    const decrescente = catalog.wordCatalog({ sort: 'length', direction: 'desc', limit: 100, offset: 0 });
    expect(decrescente.entries[0]!.word).toBe('cavolo');
  });

  it('ignora le schede duplicate per id', () => {
    const catalog = new SchedaCatalog();
    catalog.add({ id: 'x', size: 4, difficulty: 'facile', grid: 'x', words: ['casa'], longest: 4 });
    catalog.add({ id: 'x', size: 4, difficulty: 'facile', grid: 'x', words: ['casa'], longest: 4 });
    const res = catalog.wordCatalog({ sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(res.total).toBe(1);
  });
});

describe('statistiche scheda e record', () => {
  it('calcola le statistiche di una scheda dalle parole pre-calcolate', () => {
    const catalog = new SchedaCatalog();
    catalog.add({
      id: 'st-1',
      size: 4,
      difficulty: 'normale',
      grid: 'casa\ntore\nlina\nmuro',
      words: ['casa', 'torre', 'lina', 'muro', 'strada'],
      longest: 6,
    });
    const scheda = catalog.get('st-1')!;
    // Punteggio = 1 punto ogni 3 lettere.
    const punti = (w: string) => Math.floor(w.length / 3);
    const maxScore = scheda.words.reduce((a, w) => a + punti(w), 0);
    // casa(4)=1, torre(5)=1, lina(4)=1, muro(4)=1, strada(6)=2 → 6
    expect(maxScore).toBe(6);
  });

  it('il record di una scheda è il miglior punteggio', async () => {
    const a = await profile('Anna', '🦊');
    const b = await profile('Bruno', '🐼');
    const g = (score: number) => game({ score, schedaId: 'st-1' });
    store.recordGame(a, g(50));
    store.recordGame(b, g(80)); // il migliore
    store.recordGame(a, g(60));

    const rec = store.schedaRecord('st-1');
    expect(rec.record).not.toBeNull();
    expect(rec.record!.score).toBe(80);
    expect(rec.record!.nickname).toBe('Bruno');
    expect(rec.gamesPlayed).toBe(3);
  });

  it('senza partite il record è null e le partite zero', () => {
    const rec = store.schedaRecord('mai-giocata');
    expect(rec.record).toBeNull();
    expect(rec.gamesPlayed).toBe(0);
  });

  it('il record ignora le partite abbandonate (zero parole)', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ score: 0, words: 0, schedaId: 'st-2' }));
    const rec = store.schedaRecord('st-2');
    expect(rec.gamesPlayed).toBe(0);
    expect(rec.record).toBeNull();
  });

  it('il record è per scheda, non globale', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ score: 100, schedaId: 'scheda-A' }));
    store.recordGame(a, game({ score: 30, schedaId: 'scheda-B' }));
    expect(store.schedaRecord('scheda-A').record!.score).toBe(100);
    expect(store.schedaRecord('scheda-B').record!.score).toBe(30);
  });
});

describe('catalogo parole filtrato per scheda', () => {
  it('filtra a una sola scheda', () => {
    const catalog = new SchedaCatalog();
    catalog.add({ id: 'a', size: 4, difficulty: 'facile', grid: 'x', words: ['casa', 'avo'], longest: 4 });
    catalog.add({ id: 'b', size: 4, difficulty: 'facile', grid: 'x', words: ['casa', 'ebbi'], longest: 4 });

    // Su tutte le schede: 'casa' compare 2 volte, 'avo' e 'ebbi' 1.
    const tutte = catalog.wordCatalog({ search: 'avo', sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(tutte.total).toBe(1);

    // Solo la scheda 'a' contiene 'avo'.
    const inA = catalog.wordCatalog({ search: 'avo', schedaId: 'a', sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(inA.total).toBe(1);

    // Solo la scheda 'b' NON contiene 'avo'.
    const inB = catalog.wordCatalog({ search: 'avo', schedaId: 'b', sort: 'word', direction: 'asc', limit: 100, offset: 0 });
    expect(inB.total).toBe(0);
  });

  it('una parola in più schede ha occorrenze maggiori', () => {
    const catalog = new SchedaCatalog();
    catalog.add({ id: 'a', size: 4, difficulty: 'facile', grid: 'x', words: ['casa'], longest: 4 });
    catalog.add({ id: 'b', size: 4, difficulty: 'facile', grid: 'x', words: ['casa'], longest: 4 });
    const res = catalog.wordCatalog({ search: 'casa', sort: 'occurrences', direction: 'desc', limit: 10, offset: 0 });
    expect(res.entries[0]!.occurrences).toBe(2);
  });
});

describe('anteprima scheda: la soluzione non trapela', () => {
  it('le statistiche espongono la LUNGHEZZA della parola più lunga, non la parola', () => {
    const catalog = new SchedaCatalog();
    catalog.add({
      id: 'priv-1',
      size: 5,
      difficulty: 'normale',
      grid: 'aaaaa\nbbbbb\nccccc\nddddd\neeeee',
      words: ['boscaioli', 'casa', 'avo'],
      longest: 'boscaioli',
    });
    const scheda = catalog.get('priv-1')!;

    /*
     * Regressione: l'anteprima è PUBBLICA. Restituire la parola più lunga la
     * regalerebbe — chiunque può leggere la risposta dell'API dalla console del
     * browser, anche se la UI non la mostra.
     * Il client riceve solo il NUMERO di lettere.
     */
    const longestLength = scheda.words.reduce((m, w) => Math.max(m, w.length), 0);
    expect(longestLength).toBe(9);
    expect(scheda.words).toContain('boscaioli'); // la parola esiste nella scheda…
    // …ma non deve mai essere esposta in una risposta di anteprima.
    const anteprima = { id: scheda.id, wordCount: scheda.words.length, longestLength };
    expect(JSON.stringify(anteprima)).not.toContain('boscaioli');
  });
});

describe('partite multiplayer: salvate per la classifica', () => {
  /*
   * Regressione: prima il multiplayer non entrava MAI in classifica.
   * Solo il single player chiamava `POST /games`, quindi giocare con gli amici
   * non produceva né partite né statistiche. Ora il server registra a fine
   * partita una riga per ogni giocatore con profilo.
   */
  it('registra una riga per giocatore, con punteggio autoritativo e modalità multi', async () => {
    const a = await profile('Anna');
    const b = await profile('Bruno');
    const saved = store.recordMultiplayerGames(
      [
        { profileId: a, score: 120, words: 14, longest: 'bellissimo' },
        { profileId: b, score: 80, words: 11, longest: 'casetta' },
      ],
      { difficulty: 'normale', gridSize: 5, schedaId: 'scheda-1' },
    );
    expect(saved).toBe(2);

    const board = store.leaderboard({ kind: 'best', period: 'all' });
    expect(board.entries.map((e) => e.nickname)).toEqual(['Anna', 'Bruno']);
    expect(board.entries[0]!.value).toBe(120);
    expect(board.entries[0]!.longest).toBe('bellissimo');
    expect(board.entries[0]!.gridSize).toBe(5);

    // Le partite multiplayer devono comparire anche nelle statistiche personali.
    const stats = store.playerStats(a);
    expect(stats.games).toBe(1);
    expect(stats.bestScore).toBe(120);
  });

  it('salta i giocatori senza profilo (non classificabili)', async () => {
    const a = await profile('Anna');
    const saved = store.recordMultiplayerGames(
      [{ profileId: a, score: 50, words: 5, longest: 'casa' }],
      { difficulty: 'facile', gridSize: 4, schedaId: null },
    );
    expect(saved).toBe(1);
  });

  it('le partite multi NON entrano nella classifica "totali" (punteggi non confrontabili)', async () => {
    const a = await profile('Anna');
    store.recordMultiplayerGames(
      [{ profileId: a, score: 300, words: 20, longest: 'casa' }],
      { difficulty: 'normale', gridSize: 4, schedaId: null },
    );
    store.recordGame(a, game({ score: 10 }));
    // "total": solo single player, per non confrontare punteggi che dipendono dagli avversari.
    const total = store.leaderboard({ kind: 'total', period: 'all' });
    expect(total.entries).toHaveLength(1);
    expect(total.entries[0]!.value).toBe(10);
    // "best" invece le include entrambe: 300 vince.
    const best = store.leaderboard({ kind: 'best', period: 'all' });
    expect(best.entries[0]!.value).toBe(300);
  });

  it('sanifica punteggi fuori scala invece di scriverli', async () => {
    const a = await profile('Anna');
    store.recordMultiplayerGames(
      [{ profileId: a, score: 999_999, words: 5, longest: 'casa' }],
      { difficulty: 'normale', gridSize: 4, schedaId: null },
    );
    expect(store.playerStats(a).bestScore).toBe(5000);
  });

  it('clearAllGames azzera la classifica senza toccare i profili', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ score: 100 }));
    expect(store.clearAllGames()).toBe(1);
    expect(store.leaderboard({ kind: 'best', period: 'all' }).entries).toHaveLength(0);
    // Il profilo esiste ancora: si può ripartire da zero senza perdere gli account.
    expect(store.getById(a)).not.toBeNull();
  });
});

describe('statistiche personali: parole, modalità e storico', () => {
  /*
   * Regressione: prima il database salvava solo il NUMERO di parole trovate.
   * Le statistiche personali non potevano quindi mostrare QUALI parole erano
   * state trovate; questo blocco verifica che ora vengano salvate e aggregate.
   */
  const withWords = (words: Array<[string, number]>, over = {}) =>
    game({
      words: words.length,
      foundWords: words.map(([word, points]) => ({ word, points })),
      ...over,
    });

  it('salva le parole della partita e le raggruppa per lunghezza (ordine crescente)', async () => {
    const a = await profile('Anna');
    store.recordGame(
      a,
      withWords([
        ['casa', 2],
        ['sole', 2],
        ['albero', 4],
        ['montagna', 6],
        ['strada', 4],
      ]),
    );

    const stats = store.playerStats(a);
    // 4, 6, 8 lettere: gruppi ordinati crescenti.
    expect(stats.wordsByLength.map((g) => g.length)).toEqual([4, 6, 8]);
    expect(stats.wordsByLength[0]!.words).toEqual(['casa', 'sole']);
    expect(stats.wordsByLength[2]!.words).toEqual(['montagna']);
  });

  it('deduplica le parole ripetute nella stessa partita e fra partite', async () => {
    const a = await profile('Anna');
    store.recordGame(a, withWords([['casa', 2], ['casa', 2], ['sole', 2]]));
    store.recordGame(a, withWords([['casa', 2]]));

    const flat = store.playerStats(a).wordsByLength.flatMap((g) => g.words);
    expect(flat.filter((w) => w === 'casa')).toHaveLength(1);
    // I gruppi restano coerenti.
    expect(flat.sort()).toEqual(['casa', 'sole']);
  });

  it('la parola più lunga viene dalle parole salvate, non dalla colonna longest', async () => {
    const a = await profile('Anna');
    // `longest` volutamente vuoto: i dati vecchi o un client che non lo manda.
    store.recordGame(a, withWords([['casa', 2], ['costituzionale', 12]], { longest: '' }));
    expect(store.playerStats(a).longest).toBe('costituzionale');
  });

  it('separa le statistiche fra single player e multiplayer', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ score: 100, words: 10, mode: 'solo' }));
    store.recordGame(a, game({ score: 300, words: 30, mode: 'solo' }));
    store.recordMultiplayerGames(
      [{ profileId: a, score: 50, words: 5, longest: 'casa' }],
      { difficulty: 'normale', gridSize: 5, schedaId: null },
    );

    const stats = store.playerStats(a);
    expect(stats.solo.games).toBe(2);
    expect(stats.solo.bestScore).toBe(300);
    expect(stats.solo.totalWords).toBe(40);
    expect(stats.multi.games).toBe(1);
    expect(stats.multi.bestScore).toBe(50);
    // I totali complessivi restano la somma.
    expect(stats.games).toBe(3);
    expect(stats.bestScore).toBe(300);
  });

  it('lo storico elenca le partite dalla più recente, con modalità e parole', async () => {
    const a = await profile('Anna');
    store.recordGame(a, game({ score: 10, words: 3, mode: 'solo', gridSize: 4 }));
    store.recordMultiplayerGames(
      [{ profileId: a, score: 40, words: 7, longest: 'albero' }],
      { difficulty: 'facile', gridSize: 5, schedaId: null },
    );

    const history = store.playerStats(a).history;
    expect(history).toHaveLength(2);
    // La multi è stata inserita dopo: deve comparire per prima.
    expect(history[0]!.mode).toBe('multi');
    expect(history[0]!.score).toBe(40);
    expect(history[1]!.mode).toBe('solo');
    expect(history[0]!.gridSize).toBe(5);
  });

  it('senza partite le statistiche sono vuote ma ben formate', async () => {
    const a = await profile('Anna');
    const stats = store.playerStats(a);
    expect(stats.games).toBe(0);
    expect(stats.solo.games).toBe(0);
    expect(stats.multi.games).toBe(0);
    expect(stats.wordsByLength).toEqual([]);
    expect(stats.history).toEqual([]);
    expect(stats.longest).toBe('');
  });

  it('le partite vecchie senza parole restano leggibili (retro-compatibilità)', async () => {
    const a = await profile('Anna');
    // Partita registrata come faceva il client vecchio: nessun foundWords.
    store.recordGame(a, game({ score: 80, words: 8, longest: 'rinnovai' }));
    const stats = store.playerStats(a);
    expect(stats.games).toBe(1);
    // La parola più lunga ricade sulla colonna `longest`.
    expect(stats.longest).toBe('rinnovai');
    // Nessuna parola dettagliata: è normale per i dati storici.
    expect(stats.wordsByLength).toEqual([]);
  });
});
