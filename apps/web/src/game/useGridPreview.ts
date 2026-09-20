import { useEffect, useRef, useState } from 'react';
import type { Difficulty, GridSize } from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';

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
      const url = `${SERVER_BASE}/preview?gridSize=${gridSize}&difficulty=${encodeURIComponent(difficulty)}`;

      fetch(url, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as PreviewResult;
        })
        .then((data) => setState({ loading: false, data, error: null }))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setState((prev) => ({
            loading: false,
            data: prev.data,
            error: 'Anteprima non disponibile (server offline)',
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
