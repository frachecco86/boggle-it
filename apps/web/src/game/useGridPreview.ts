import { useEffect, useRef, useState } from 'react';
import type { Difficulty, GridSize } from '@boggle/shared';
import { loadRandomScheda } from './schedeLoader.js';

export interface PreviewResult {
  gridSize: GridSize;
  difficulty: Difficulty;
  grid: string[];
  wordCount: number | null;
  sampleWords: string[];
  truncated: boolean;
}

interface PreviewState {
  loading: boolean;
  data: PreviewResult | null;
  error: string | null;
}

/**
 * Chiede al server un'anteprima: una griglia reale risolta col dizionario,
 * così il numero di parole trovabili è quello vero (non una stima).
 *
 * La richiesta è debounced: cambiando rapidamente le impostazioni non si
 * tempesta il server. Il trie del solver è lazy e viene costruito al primo uso.
 */
export function useGridPreview(
  gridSize: GridSize,
  difficulty: Difficulty,
  enabled = true,
): PreviewState {
  const [state, setState] = useState<PreviewState>({ loading: false, data: null, error: null });
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      // Server se raggiungibile, altrimenti scheda dal bundle (app offline).
      void loadRandomScheda(gridSize, difficulty)
        .then((scheda) => {
          if (controller.signal.aborted) return;
          if (!scheda) throw new Error('Nessuna scheda disponibile');
          setState({
            loading: false,
            data: {
              gridSize,
              difficulty,
              grid: scheda.grid.split('\n').map((row) => row.toUpperCase()),
              wordCount: scheda.words.length,
              sampleWords: [...scheda.words].sort((a, b) => b.length - a.length).slice(0, 8),
              truncated: false,
            },
            error: null,
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setState((prev) => ({
            loading: false,
            data: prev.data,
            error: 'Anteprima non disponibile',
          }));
        });
    }, 350);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [gridSize, difficulty, enabled]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return state;
}
