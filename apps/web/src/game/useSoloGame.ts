import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateGrid,
  isValidPath,
  pathMatchesWord,
  scoreForWord,
  wordFromPath,
  type FoundWord,
  type Grid,
  type GridSize,
  type Tile,
} from '@boggle/shared';
import { SwipeController, type SwipePoint } from './swipe.js';
import type { Dictionary } from '@boggle/dictionary';

export type WordFeedback = { kind: 'valid'; word: string; points: number } | { kind: 'invalid'; word: string; reason: string };

interface UseSoloGameOptions {
  dictionary: Dictionary;
  gridSize: GridSize;
  rounds: number;
  roundDurationMs?: number;
}

export interface SoloGameState {
  phase: 'idle' | 'playing' | 'roundEnd' | 'gameEnd';
  round: number;
  grid: Grid | null;
  found: FoundWord[];
  score: number;
  selectedPath: number[];
  currentWord: string;
  timeLeftMs: number;
  feedback: WordFeedback | null;
  roundScores: number[];
  missedWords: string[];
}

const DEFAULT_ROUND_MS = 180_000;

/** Logica completa del single player: round, timer, validazione, punteggio. */
export function useSoloGame(options: UseSoloGameOptions) {
  const { dictionary, gridSize, rounds, roundDurationMs = DEFAULT_ROUND_MS } = options;

  const [phase, setPhase] = useState<SoloGameState['phase']>('idle');
  const [round, setRound] = useState(0);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [found, setFound] = useState<FoundWord[]>([]);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [selectedPath, setSelectedPath] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<WordFeedback | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(roundDurationMs);
  const [missedWords, setMissedWords] = useState<string[]>([]);

  const gridRef = useRef<Grid | null>(null);
  gridRef.current = grid;
  const foundRef = useRef<FoundWord[]>([]);
  foundRef.current = found;

  const score = useMemo(() => found.reduce((sum, f) => sum + f.points, 0), [found]);
  const currentWord = useMemo(
    () => (grid ? wordFromPath(grid, selectedPath) : ''),
    [grid, selectedPath],
  );

  const startRound = useCallback(
    (roundNumber: number) => {
      const g = generateGrid(gridSize);
      setGrid(g);
      setRound(roundNumber);
      setFound([]);
      setSelectedPath([]);
      setFeedback(null);
      setMissedWords([]);
      setPhase('playing');
      const end = Date.now() + roundDurationMs;
      setDeadline(end);
      setTimeLeftMs(roundDurationMs);
    },
    [gridSize, roundDurationMs],
  );

  const start = useCallback(() => {
    setRoundScores([]);
    startRound(1);
  }, [startRound]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
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
  }, [phase, deadline, score]);

  const commitPath = useCallback(
    (path: number[]) => {
      const g = gridRef.current;
      if (!g || path.length === 0) return;
      const word = wordFromPath(g, path);
      if (!isValidPath(g, path)) return;
      if (word.length < 3) {
        setFeedback({ kind: 'invalid', word, reason: 'Minimo 3 lettere' });
        return;
      }
      if (!pathMatchesWord(g, path, word)) return;
      if (foundRef.current.some((f) => f.word === word)) {
        setFeedback({ kind: 'invalid', word, reason: 'Già trovata' });
        return;
      }
      if (!dictionary.has(word)) {
        setFeedback({ kind: 'invalid', word, reason: 'Non nel dizionario' });
        return;
      }
      const points = scoreForWord(word);
      setFound((prev) => [...prev, { word, points, at: Date.now() }]);
      setFeedback({ kind: 'valid', word, points });
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(30);
    },
    [dictionary],
  );

  const nextRound = useCallback(() => {
    if (round >= rounds) {
      setPhase('gameEnd');
      return;
    }
    startRound(round + 1);
  }, [round, rounds, startRound]);

  const totalScore = useMemo(() => roundScores.reduce((a, b) => a + b, 0) + score, [roundScores, score]);

  return {
    state: {
      phase,
      round,
      grid,
      found,
      score,
      selectedPath,
      currentWord,
      timeLeftMs,
      feedback,
      roundScores,
      missedWords,
    } satisfies SoloGameState,
    totalScore,
    start,
    commitPath,
    setSelectedPath,
    nextRound,
    clearFeedback: () => setFeedback(null),
  };
}

export { SwipeController };
export type { SwipePoint, Tile };
