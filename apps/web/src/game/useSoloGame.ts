import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isValidPath,
  pathMatchesWord,
  rowsToGrid,
  scoreForWord,
  wordFromPath,
  type Difficulty,
  type FoundWord,
  type Grid,
  type GridSize,
  type Scheda,
} from '@boggle/shared';
import { loadRandomScheda } from './schedeLoader.js';
import { audio } from '../audio/AudioEngine.js';
import { activeToken } from './profileStore.js';
import { submitGame } from './statsClient.js';
import { useAppStore } from '../state/store.js';

export type WordFeedback =
  | { kind: 'valid'; word: string; points: number }
  | { kind: 'invalid'; word: string; reason: string }
  /** Parola corretta ma gia' trovata: feedback e suono diversi. */
  | { kind: 'duplicate'; word: string; reason: string };

interface UseSoloGameOptions {
  gridSize: GridSize;
  difficulty: Difficulty;
  rounds: number;
  roundDurationMs: number;
}

export interface SoloGameState {
  phase: 'idle' | 'countdown' | 'playing' | 'roundEnd' | 'gameEnd';
  round: number;
  grid: Grid | null;
  /** Scheda giocata nel round corrente (griglia + tutte le parole trovabili). */
  scheda: Scheda | null;
  found: FoundWord[];
  score: number;
  selectedPath: number[];
  currentWord: string;
  timeLeftMs: number;
  feedback: WordFeedback | null;
  roundScores: number[];
  /** Parole trovate in questo round (per il riepilogo). */
  missedWords: string[];
  /** Esito della registrazione della partita in classifica (a fine partita). */
  saveStatus: 'idle' | 'anonymous' | 'saving' | 'saved' | 'failed';
  /** true mentre si carica la scheda dal server. */
  loading: boolean;
}

/**
 * Logica completa del single player: round, timer, validazione, punteggio.
 *
 * Le griglie non sono generate al volo: ogni round pesca una SCHEDA dal catalogo
 * del server. Così la partita è riproducibile e le parole valide arrivano
 * pre-calcolate (niente solver nel client).
 *
 * Punteggio: `lunghezza − 2`. In single player NON c'è raddoppio (non esistono
 * avversari con cui essere "unici").
 */
export function useSoloGame(options: UseSoloGameOptions) {
  const { gridSize, difficulty, rounds, roundDurationMs } = options;

  const [phase, setPhase] = useState<SoloGameState['phase']>('idle');
  /** Scheda scelta nell'anteprima, in attesa che il countdown finisca. */
  const pendingSchedaRef = useRef<Scheda | null>(null);
  /**
   * Numero del round che il countdown avvierà.
   *
   * Serve perché il countdown 3-2-1 ora precede OGNI round, non solo il primo:
   * `beginRound` deve sapere se sta partendo il round 1 o uno successivo.
   */
  const pendingRoundRef = useRef(1);
  const [round, setRound] = useState(0);
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [found, setFound] = useState<FoundWord[]>([]);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [selectedPath, setSelectedPath] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<WordFeedback | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(roundDurationMs);
  const [missedWords, setMissedWords] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const grid = useMemo(() => (scheda ? rowsToGrid(scheda.grid) : null), [scheda]);
  const gridRef = useRef<Grid | null>(null);
  gridRef.current = grid;
  const schedaRef = useRef<Scheda | null>(null);
  schedaRef.current = scheda;
  const foundRef = useRef<FoundWord[]>([]);
  foundRef.current = found;
  /** true quando la partita conclusa è già stata inviata alla classifica. */
  const savedRef = useRef(false);
  /**
   * Esito della registrazione della partita in classifica.
   *  - `idle`: non ancora conclusa
   *  - `anonymous`: nessun profilo attivo, la partita non è classificabile
   *  - `saving` / `saved` / `failed`
   */
  const [saveStatus, setSaveStatus] = useState<'idle' | 'anonymous' | 'saving' | 'saved' | 'failed'>('idle');

  const score = useMemo(() => found.reduce((sum, f) => sum + f.points, 0), [found]);
  const currentWord = useMemo(
    () => (grid ? wordFromPath(grid, selectedPath) : ''),
    [grid, selectedPath],
  );

  const startRound = useCallback(
    async (roundNumber: number, prescelta?: Scheda) => {
      setLoading(true);
      setLoadError(null);
      setPhase('playing');
      setSelectedPath([]);
      setFeedback(null);
      setMissedWords([]);
      try {
        // La scheda può arrivare dall'anteprima (scelta dal giocatore) oppure
        // essere pescata a caso per i round successivi.
        const next = prescelta ?? (await loadRandomScheda(gridSize, difficulty));
        if (!next) throw new Error('Nessuna scheda disponibile');
        setScheda(next);
        // Serve al catalogo Parole per il filtro "solo la scheda in corso".
        useAppStore.setState({ currentSchedaId: next.id });
        setFound([]);
        setRound(roundNumber);
        const end = Date.now() + roundDurationMs;
        setDeadline(end);
        setTimeLeftMs(roundDurationMs);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [gridSize, difficulty, roundDurationMs],
  );

  /**
   * Avvia la partita. `prescelta` è la scheda scelta nell'anteprima.
   *
   * Non si parte subito: si entra in `countdown`, che mostra 3-2-1 con animazione
   * e suoni. Al termine `beginRound` fa partire davvero il timer, così i secondi
   * di gioco non si consumano durante il conto alla rovescia.
   */
  const start = useCallback(
    (prescelta?: Scheda) => {
      savedRef.current = false;
      setRoundScores([]);
      // La scheda resta in attesa: la userà beginRound.
      pendingSchedaRef.current = prescelta ?? null;
      pendingRoundRef.current = 1;
      setPhase('countdown');
    },
    [],
  );

  /** Chiamato dal countdown quando ha finito: qui parte il round vero. */
  const beginRound = useCallback(() => {
    const prescelta = pendingSchedaRef.current ?? undefined;
    const roundNumber = pendingRoundRef.current;
    pendingSchedaRef.current = null;
    void startRound(roundNumber, prescelta);
  }, [startRound]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing' || loading) return;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setTimeLeftMs(left);
      if (left <= 0) {
        setPhase('roundEnd');
        setRoundScores((prev) => [...prev, score]);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, deadline, score, loading]);

  const commitPath = useCallback((path: number[]) => {
    const g = gridRef.current;
    if (!g || path.length === 0) return;
    const word = wordFromPath(g, path);
    if (!isValidPath(g, path)) return;
    if (word.length < 3) {
      audio.play('invalid');
      setFeedback({ kind: 'invalid', word, reason: 'Minimo 3 lettere' });
      return;
    }
    if (!pathMatchesWord(g, path, word)) return;
    if (foundRef.current.some((f) => f.word === word)) {
      // Parola corretta ma ripetuta: suono e colore distinti dall'errore.
      audio.play('already-found');
      setFeedback({ kind: 'duplicate', word, reason: 'Già trovata' });
      return;
    }
    // Validazione contro le parole della SCHEDA, non contro il dizionario intero:
    // la scheda dice esattamente cosa è componibile e valido.
    const inScheda = schedaRef.current?.words.includes(word) ?? false;
    if (!inScheda) {
      audio.play('invalid');
      setFeedback({ kind: 'invalid', word, reason: 'Non una parola valida' });
      return;
    }
    const points = scoreForWord(word);
    setFound((prev) => [...prev, { word, points, at: Date.now() }]);
    // Motivo musicale crescente in base alla lunghezza della parola.
    audio.playWordFound(word.length);
    setFeedback({ kind: 'valid', word, points });
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(30);
  }, []);

  /**
   * Passa al round successivo, oppure chiude la partita.
   *
   * Prima di chiudere aggiunge il punteggio dell'ultimo round a `roundScores`:
   * senza questo, il totale inviato alla classifica NON includeva l'ultimo round.
   */
  const nextRound = useCallback(() => {
    if (round >= rounds) {
      // Ultimo round: consolida il punteggio prima di chiudere.
      savedRef.current = false;
      setRoundScores((prev) => [...prev, score]);
      // A fine partita mostriamo TUTTE le parole dell'ultima scheda non trovate.
      const trovate = new Set(foundRef.current.map((f) => f.word));
      setMissedWords((schedaRef.current?.words ?? []).filter((w) => !trovate.has(w)));
      setPhase('gameEnd');
      return;
    }
    savedRef.current = false;
    /*
     * Countdown 3-2-1 anche fra un round e l'altro: è parte del ritmo, come nel
     * Boggle originale. La scheda nuova viene pescata solo alla fine del
     * countdown (in `beginRound`), così i secondi di gioco non si consumano
     * durante il conto alla rovescia.
     */
    pendingSchedaRef.current = null;
    pendingRoundRef.current = round + 1;
    setPhase('countdown');
  }, [round, rounds, score, startRound]);

  /**
   * Punteggio totale della partita.
   *
   * ATTENZIONE al doppio conteggio: a fine round il punteggio viene aggiunto a
   * `roundScores`. Sommare anche `score` lo contava due volte (con 2 round da 50
   * e 30 il totale dava 110 invece di 80). `score` è il parziale del round IN
   * CORSO, quindi va aggiunto solo mentre si gioca.
   */
  const totalScore = useMemo(
    () => roundScores.reduce((a, b) => a + b, 0) + (phase === 'playing' ? score : 0),
    [roundScores, score, phase],
  );

  /**
   * Registra la partita conclusa per la classifica.
   *
   * `savedRef` impedisce di inviarla due volte: `gameEnd` può essere raggiunto e
   * poi rivalutato, e in StrictMode gli effect girano due volte in sviluppo.
   *
   * La registrazione NON deve bloccare il gioco (offline, server giù), ma non
   * deve nemmeno fallire in SILENZIO: prima l'utente non aveva modo di sapere
   * perché la partita non compariva in classifica. Ora l'esito è esposto in
   * `state.saveStatus` e mostrato nel riepilogo.
   */
  useEffect(() => {
    if (phase !== 'gameEnd' || savedRef.current) return;
    savedRef.current = true;
    const token = activeToken();
    if (!token) {
      // Senza profilo la partita non è classificabile: è una scelta, non un errore.
      setSaveStatus('anonymous');
      return;
    }

    const found = foundRef.current;
    const words = found.map((f) => f.word);
    const longest = words.reduce((best, w) => (w.length > best.length ? w : best), '');
    setSaveStatus('saving');
    void submitGame(
      {
        // `totalScore` ora è corretto: `roundScores` contiene già l'ultimo round.
        score: totalScore,
        words: words.length,
        wordCount: schedaRef.current?.words.length ?? 0,
        longest,
        difficulty,
        gridSize,
        mode: 'solo',
        schedaId: schedaRef.current?.id ?? null,
        // Elenco completo: senza, il server sapeva solo QUANTE parole erano state
        // trovate e le statistiche personali non potevano mostrarle.
        foundWords: found.map((f) => ({ word: f.word, points: f.points })),
      },
      token,
    ).then((res) => {
      // `submitGame` ritorna null sia in caso di rete assente sia di rifiuto
      // del server: in entrambi i casi la partita non è entrata in classifica.
      setSaveStatus(res ? 'saved' : 'failed');
    });
    // `roundScores` fra le dipendenze: al momento di `gameEnd` l'ultimo round
    // potrebbe non essere ancora stato consolidato.
  }, [phase, totalScore, difficulty, gridSize, roundScores]);

  return {
    state: {
      phase,
      round,
      grid,
      scheda,
      found,
      score,
      selectedPath,
      currentWord,
      timeLeftMs,
      feedback,
      roundScores,
      missedWords,
      saveStatus,
      loading,
    } satisfies SoloGameState,
    loadError,
    totalScore,
    start,
    beginRound,
    commitPath,
    setSelectedPath,
    nextRound,
    clearFeedback: () => setFeedback(null),
  };
}

export { SwipeController } from './swipe.js';
export type { SwipePoint } from './swipe.js';
export type { Tile } from '@boggle/shared';
