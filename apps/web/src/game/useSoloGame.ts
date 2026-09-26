import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptedWords,
  findWordPath,
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
// Il passo dell'animazione del suggerimento vive in GridBoard (insieme alle
// frecce): qui serve per calcolare quando spegnere il suggerimento.
import { HINT_STEP_MS } from '../components/GridBoard.js';
import { audio } from '../audio/AudioEngine.js';
import { activeToken } from './profileStore.js';
import { submitGame } from './statsClient.js';
import { useAppStore } from '../state/store.js';

export type WordFeedback =
  | { kind: 'valid'; word: string; points: number }
  | { kind: 'invalid'; word: string; reason: string }
  /** Parola corretta ma gia' trovata: feedback e suono diversi. */
  | { kind: 'duplicate'; word: string; reason: string };

/**
 * Quanto resta l'esito della parola nel rettangolo sopra la griglia.
 *
 * Un secondo: si legge il punteggio e si torna subito a "Componi una parola".
 * Prima l'esito era una nuvoletta in fondo allo schermo che restava 2,6 secondi:
 * durava più del necessario e copriva la parte bassa della griglia.
 */
export const FEEDBACK_VISIBLE_MS = 1000;

interface UseSoloGameOptions {
  gridSize: GridSize;
  difficulty: Difficulty;
  rounds: number;
  roundDurationMs: number;
  /** Modalità apprendimento: tempo infinito + suggerimento + definizioni. */
  learningMode?: boolean;
}

export interface SoloGameState {
  /**
   * Fasi della partita. Non c'è uno stato "pronto": si entra direttamente nel
   * countdown, perché una schermata di conferma prima di giocare era (a) una
   * seconda schermata per iniziare e (b) il posto dove si vedeva la scheda in
   * anticipo.
   */
  phase: 'countdown' | 'playing' | 'roundEnd' | 'gameEnd';
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
  /**
   * Percorso della parola suggerita, da animare sulla griglia.
   * Presente solo mentre il suggerimento è in corso (modalità apprendimento).
   */
  hintPath: number[] | null;
  /** La parola suggerita (testo), mostrata nel riquadro di composizione. */
  hintWord: string | null;
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
  const { gridSize, difficulty, rounds, roundDurationMs, learningMode = false } = options;

  const [phase, setPhase] = useState<SoloGameState['phase']>('countdown');
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
  /** Suggerimento in corso: percorso da animare e parola (solo apprendimento). */
  const [hintPath, setHintPath] = useState<number[] | null>(null);
  const [hintWord, setHintWord] = useState<string | null>(null);
  /** Timer che spegne il suggerimento dopo l'animazione. */
  const hintTimerRef = useRef<number | null>(null);

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

  /*
   * L'esito della parola (punti, "già trovata", "non valida") resta finché il
   * giocatore non ricomincia: NON si spegne da solo dopo un tempo fisso. Prima
   * spariva dopo 1 secondo, quindi il punteggio si leggeva solo con la coda
   * dell'occhio. Ora compare quando si rilascia la parola e resta visibile fino
   * a quando si tocca una nuova lettera (vedi `setSelectedPath` più sotto).
   */

  const currentWord = useMemo(
    () => (grid ? wordFromPath(grid, selectedPath) : ''),
    [grid, selectedPath],
  );

  /** Spegne il suggerimento (percorso e parola) e ferma il timer. */
  const clearHint = useCallback(() => {
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setHintPath(null);
    setHintWord(null);
  }, []);

  /**
   * Mostra un suggerimento: pesca una parola NON ancora trovata, ne calcola il
   * percorso e lo anima sulla griglia. Disponibile solo in modalità apprendimento.
   *
   * Preferisce le parole più lunghe: sono quelle che danno più punti e quelle che
   * un principiante fa più fatica a vedere. Se nessuna parola è componibile in
   * un percorso legale, non fa nulla (non deve sembrare un tasto rotto).
   */
  const requestHint = useCallback((): boolean => {
    if (!learningMode) return false;
    const g = gridRef.current;
    const s = schedaRef.current;
    if (!g || !s) return false;
    const trovate = new Set(foundRef.current.map((f) => f.word));
    const candidate = [...acceptedWords(s)]
      .filter((w) => !trovate.has(w) && w.length >= 3)
      .sort((a, b) => b.length - a.length || a.localeCompare(b, 'it'));
    for (const word of candidate) {
      const path = findWordPath(g, word);
      if (!path) continue;
      setHintPath(path);
      setHintWord(word);
      // La parola suggerita precedente non vale più: si spegne subito.
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
      /*
       * Durata dell'ANIMAZIONE sulla griglia: si accende una cella ogni
       * `HINT_STEP_MS` (lo stesso passo delle frecce, vedi `GridBoard`), poi le
       * celle tornano normali. Solo il PERCORSO si spegne: la parola resta nel
       * riquadro (vedi sotto) perché si possa leggerla e aprirne la definizione.
       */
      hintTimerRef.current = window.setTimeout(() => {
        hintTimerRef.current = null;
        setHintPath(null);
      }, 1600 + path.length * HINT_STEP_MS);
      return true;
    }
    return false;
  }, [learningMode]);

  const startRound = useCallback(
    async (roundNumber: number) => {
      setLoading(true);
      setLoadError(null);
      setPhase('playing');
      setSelectedPath([]);
      setFeedback(null);
      setMissedWords([]);
      clearHint();
      try {
        /*
         * La scheda si pesca a caso: nessun giocatore la conosce in anticipo.
         * I criteri (standard / full criteria) sono la scelta del giocatore,
         * fatta in home e salvata nello store.
         */
        const next = await loadRandomScheda(gridSize, difficulty, useAppStore.getState().schedaVariant);
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
   * Avvia (o riavvia) la partita.
   *
   * Non si parte subito: si entra in `countdown`, che mostra 3-2-1 con animazione
   * e suoni. Al termine `beginRound` fa partire davvero il timer, così i secondi
   * di gioco non si consumano durante il conto alla rovescia.
   *
   * La scheda NON si scegle più prima: viene pescata a caso alla fine del
   * countdown, quindi nessuno la vede in anticipo.
   */
  const start = useCallback(() => {
    savedRef.current = false;
    setRoundScores([]);
    pendingRoundRef.current = 1;
    setPhase('countdown');
  }, []);

  /** Chiamato dal countdown quando ha finito: qui parte il round vero. */
  const beginRound = useCallback(() => {
    void startRound(pendingRoundRef.current);
  }, [startRound]);

  // Timer. In modalità apprendimento il tempo è INFINITO: si esce dal round
  // solo a mano, così si può cercare con calma e usare i suggerimenti senza
  // pressione (è una modalità per imparare, non per gareggiare).
  useEffect(() => {
    if (phase !== 'playing' || loading || learningMode) return;
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
  }, [phase, deadline, score, loading, learningMode]);

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
    // Validazione contro l'insieme ACCETTATO della scheda: con le schede di
    // formato 2 è tutto il dizionario componibile sulla griglia, quindi una
    // parola rara fuori fascia vale lo stesso. Le schede di formato 1 ripiegano
    // sulle sole parole attese.
    const accepted = schedaRef.current ? acceptedWords(schedaRef.current) : [];
    if (!accepted.includes(word)) {
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
        // Parole che si potevano trovare (insieme accettato): è il totale della
        // scheda che il server mostra nelle statistiche.
        wordCount: schedaRef.current ? acceptedWords(schedaRef.current).length : 0,
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
      hintPath,
      hintWord,
    } satisfies SoloGameState,
    loadError,
    totalScore,
    start,
    beginRound,
    commitPath,
    setSelectedPath: (path: number[]) => {
      /*
       * Toccare una nuova lettera spegne l'esito della parola precedente e il
       * suggerimento: è il gesto che dice "sto componendo". Se il percorso è
       * vuoto (il dito è stato ritirato senza comporre) restano, così non si
       * perdono leggendo un undo.
       */
      if (path.length > 0) {
        setFeedback(null);
        clearHint();
      }
      setSelectedPath(path);
    },
    nextRound,
    clearFeedback: () => setFeedback(null),
    requestHint,
    clearHint,
  };
}

export { SwipeController } from './swipe.js';
export type { SwipePoint } from './swipe.js';
export type { Tile } from '@boggle/shared';
