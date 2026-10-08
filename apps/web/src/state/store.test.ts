/**
 * Variante delle schede in vigore (`schedaVariantFor`).
 *
 * REGRESSIONE: lo store aveva una copia locale della regola rimasta ferma a
 * "le ale esistono solo su 5×5". Con l'admin impostato su `ale`, una partita
 * 4×4 o 6×6 ricadeva su `standard`: il foglio "Impostazioni partita" mostrava
 * "Standard" e si giocavano le schede sbagliate, mentre il server (che usa la
 * funzione condivisa) serviva correttamente le Ale su ogni griglia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Lo store è creato con il middleware `persist`, che tocca `localStorage` già
 * all'import. I test del web girano in ambiente Node (nessun jsdom nel repo),
 * quindi si fornisce uno stub minimo PRIMA di importare il modulo.
 */
const memory = new Map<string, string>();
const storageStub = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
};
vi.stubGlobal('localStorage', storageStub);

const { useAppStore } = await import('./store.js');

/** Imposta la configurazione globale come farebbe `refreshAppConfig`. */
function setAdminVariant(variant: 'standard' | 'full' | 'ale'): void {
  useAppStore.setState({ appConfig: { defaultSchedaVariant: variant } });
}

describe('schedaVariantFor', () => {
  beforeEach(() => setAdminVariant('standard'));

  it('con admin su `ale` la variante vale su TUTTE le griglie', () => {
    setAdminVariant('ale');
    for (const size of [4, 5, 6] as const) {
      expect(useAppStore.getState().schedaVariantFor(size)).toBe('ale');
    }
  });

  it('non declassa a `standard` fuori dal 5×5 (regressione)', () => {
    // Il difetto: 4×4 e 6×6 tornavano `standard`.
    setAdminVariant('ale');
    expect(useAppStore.getState().schedaVariantFor(4)).not.toBe('standard');
    expect(useAppStore.getState().schedaVariantFor(6)).not.toBe('standard');
  });

  it('con admin su `full` la variante vale su tutte le griglie', () => {
    setAdminVariant('full');
    for (const size of [4, 5, 6] as const) {
      expect(useAppStore.getState().schedaVariantFor(size)).toBe('full');
    }
  });

  it('con admin su `standard` resta standard ovunque', () => {
    for (const size of [4, 5, 6] as const) {
      expect(useAppStore.getState().schedaVariantFor(size)).toBe('standard');
    }
  });
});

/*
 * «Gioca ancora»: lo stato del client quando la stessa stanza inizia una
 * partita nuova.
 *
 * È il punto dove una classe sbagliata si vedrebbe a schermo: se restassero
 * `finalScores` o `roundResults`, la sala d'attesa mostrerebbe il podio di una
 * partita i cui punteggi sono appena stati azzerati.
 *
 * `applyNewMatch` e lo store si prendono dallo STESSO import dinamico: scrivere
 * in un'istanza e leggere dall'altra fa fallire tutto senza un motivo visibile.
 * E infatti questo describe sta prima di `absoluteMusicTrack`, che chiama
 * `vi.resetModules()`: dopo, un `import('./store.js')` costruisce un modulo
 * nuovo il cui `persist` non trova più lo `localStorage` finto (rumore su
 * stderr, e una seconda copia dello store).
 */
describe('applyNewMatch', () => {
  /** Store già piazzato alla classifica finale della partita 2, in `summary`. */
  async function storeAfterFinalMatch() {
    const mod = await import('./store.js');
    const store = mod.useAppStore;
    store.setState({
      screen: 'summary',
      roomCode: 'ABC123',
      playerId: 'p1',
      room: {
        code: 'ABC123',
        hostId: 'p1',
        gridSize: 4,
        difficulty: 'normale',
        rounds: 3,
        roundDurationMs: 120_000,
        maxPlayers: 8,
        currentRound: 3,
        phase: 'gameEnd',
        matchNumber: 2,
        players: [
          { id: 'p1', nickname: 'Alice', avatar: '🦊', score: 0, connected: true, isHost: true },
          {
            id: 'p9',
            nickname: 'Ritardatario',
            avatar: '🐼',
            score: 0,
            connected: true,
            isHost: false,
            waiting: true,
          },
        ],
      },
      grid: { size: 4, tiles: [] },
      currentSchedaId: '4-normale-001',
      roundEndsAt: 123,
      roundDurationMs: 180_000,
      roundResults: [
        { playerId: 'p1', nickname: 'Alice', roundScore: 9, totalScore: 20, words: ['casa'] },
      ],
      finalScores: [
        { playerId: 'p1', nickname: 'Alice', roundScore: 0, totalScore: 20, words: [] },
      ],
      missedWords: ['parola'],
      liveWords: [{ playerId: 'p1', nickname: 'Alice', word: 'casa', points: 2, wordLength: 4 }],
      opponentEvents: [],
      countdown: null,
      roomNotice: null,
    });
    return { store, applyNewMatch: mod.applyNewMatch };
  }

  /** Lo stato della stanza quando il server annuncia la partita nuova. */
  const announced = (room: NonNullable<ReturnType<typeof useAppStore.getState>['room']>) => ({
    ...room,
    phase: 'lobby' as const,
    currentRound: 0,
    matchNumber: 3,
    roundDurationMs: 90_000,
    // Il server ha già liberato chi aspettava: non è più in attesa.
    players: room.players.map(({ waiting: _waiting, ...p }) => p),
  });

  it('riporta in sala attesa e dimentica la partita finita', async () => {
    const { store, applyNewMatch } = await storeAfterFinalMatch();
    applyNewMatch(announced(store.getState().room!));

    const s = store.getState();
    expect(s.screen).toBe('lobby');
    // La classifica finale NON deve sopravvivere: i punteggi sono azzerati.
    expect(s.finalScores).toBeNull();
    expect(s.roundResults).toBeNull();
    expect(s.missedWords).toEqual([]);
    expect(s.liveWords).toEqual([]);
    // Né devono restare in giro la griglia o il timer del round precedente.
    expect(s.grid).toBeNull();
    expect(s.currentSchedaId).toBeNull();
    expect(s.roundEndsAt).toBe(0);
    expect(s.countdown).toBeNull();
    // La stanza è sempre la stessa: codice e identità non cambiano.
    expect(s.roomCode).toBe('ABC123');
    expect(s.room?.code).toBe('ABC123');
    expect(s.room?.matchNumber).toBe(3);
    // La durata del round si riallinea a quella della stanza: l'host può
    // cambiarla fra una partita e l'altra.
    expect(s.roundDurationMs).toBe(90_000);
  });

  it('mette in gioco chi aspettava la partita precedente', async () => {
    const { store, applyNewMatch } = await storeAfterFinalMatch();
    expect(store.getState().room?.players.find((p) => p.id === 'p9')?.waiting).toBe(true);
    applyNewMatch(announced(store.getState().room!));
    expect(store.getState().room?.players.find((p) => p.id === 'p9')?.waiting).toBeUndefined();
  });

  it('racconta cosa è successo con un avviso in sala attesa', async () => {
    const { store, applyNewMatch } = await storeAfterFinalMatch();
    applyNewMatch(announced(store.getState().room!));
    expect(store.getState().roomNotice).toMatch(/Nuova partita/);

    store.getState().clearRoomNotice();
    expect(store.getState().roomNotice).toBeNull();
  });
});
/*
 * URL delle tracce musicali.
 *
 * REGRESSIONE (APK): le tracce caricate dall'admin hanno `file` relativo al
 * server (`/music/up-xxx/file`). Nell'APK la WebView serve il bundle da
 * `https://localhost`, quindi un percorso relativo cercava il file DENTRO l'app
 * invece che sul server: la musica "non si sentiva" senza alcun errore.
 *
 * **Perché il server lo mette il test.** `absoluteMusicTrack` usa `SERVER_BASE`,
 * che in `net/socket.ts` è una **costante di modulo** letta da `import.meta.env`.
 * Dipendeva dunque dal `.env` di chi esegue i test: con `VITE_SERVER_URL=` vuoto
 * (la config di chi sviluppa col proxy di Vite, e il default di chi non ha un
 * server suo) non c'era alcun server da anteporre e il test falliva pur con la
 * logica giusta. `stubEnv` + `resetModules` + import dinamico costruiscono il
 * modulo con il server voluto, così il risultato non cambia fra un portatile e la
 * CI — e si può verificare anche il caso same-origin.
 */
describe('absoluteMusicTrack', () => {
  const REMOTE = 'https://boggle-it-production.up.railway.app';

  /** Re-importa lo store **come se l'app fosse compilata con `serverUrl`**. */
  async function storeBuiltWith(serverUrl: string) {
    vi.resetModules();
    vi.stubEnv('VITE_SERVER_URL', serverUrl);
    return import('./store.js');
  }

  /** Traccia caricata dall'admin: il file vive sul server. */
  const uploaded = {
    id: 'up-1',
    label: 'X',
    mood: '',
    credits: '',
    file: '/music/up-1/file',
    uploaded: true,
  };

  afterEach(() => vi.unstubAllEnvs());

  it('con un server remoto rende assoluto il percorso delle tracce caricate', async () => {
    const { absoluteMusicTrack } = await storeBuiltWith(REMOTE);
    const track = absoluteMusicTrack(uploaded);
    expect(track.file).toBe(`${REMOTE}/music/up-1/file`);
    expect(track.file).not.toBe('/music/up-1/file');
    expect(track.file.startsWith('http')).toBe(true);
    expect(track.file.endsWith('/music/up-1/file')).toBe(true);
  });

  it('senza server remoto (monolite o sviluppo) il percorso resta relativo', async () => {
    // `file` è già corretto rispetto all'origine che serve la pagina: non c'è
    // nulla da assolutizzare, e la musica funziona anche con la rete assente.
    const { absoluteMusicTrack } = await storeBuiltWith('');
    expect(absoluteMusicTrack(uploaded).file).toBe('/music/up-1/file');
  });

  it('lascia relativo il percorso delle tracce del bundle', async () => {
    const { absoluteMusicTrack } = await storeBuiltWith(REMOTE);
    const track = absoluteMusicTrack({
      id: 'classica',
      label: 'Classica',
      mood: '',
      credits: '',
      file: '/audio/tracks/classica.mp3',
    });
    expect(track.file).toBe('/audio/tracks/classica.mp3');
  });

  it('non tocca un URL già assoluto', async () => {
    const { absoluteMusicTrack } = await storeBuiltWith(REMOTE);
    const track = absoluteMusicTrack({
      id: 'up-2',
      label: 'Y',
      mood: '',
      credits: '',
      file: 'https://cdn.example/music/y.mp3',
      uploaded: true,
    });
    expect(track.file).toBe('https://cdn.example/music/y.mp3');
  });
});
