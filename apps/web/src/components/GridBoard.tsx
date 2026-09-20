import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Grid as GridModel } from '@boggle/shared';
import { SwipeController, type SwipePoint } from '../game/swipe.js';
import { audio } from '../audio/AudioEngine.js';

interface GridBoardProps {
  grid: GridModel;
  selectedPath: readonly number[];
  onPathChange: (path: number[]) => void;
  onCommit: (path: number[]) => void;
  /** Flash rosso discreto su parola non valida (niente scuotimento). */
  flashError?: boolean;
}

/**
 * Griglia con swipe. Il percorso e' renderizzato come trailer SVG luminoso
 * che collega i centri delle celle selezionate.
 */
export function GridBoard({ grid, selectedPath, onPathChange, onCommit, flashError }: GridBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [centers, setCenters] = useState<{ x: number; y: number }[]>([]);

  // Callback e griglia via ref: lo SwipeController si crea UNA volta sola e non
  // viene distrutto a meta' gesture quando il parent re-renderizza.
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const onPathChangeRef = useRef(onPathChange);
  onPathChangeRef.current = onPathChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  // Suono di selezione: lo emettiamo quando il percorso si estende, non ad ogni move.
  const lastPathLenRef = useRef(0);

  /**
   * Hit-test: sceglie la cella col CENTRO più vicino al punto, non semplicemente
   * il rettangolo che lo contiene. Questo elimina le zone morte dei gap e degli
   * angoli arrotondati, e rende le diagonali molto più facili.
   *
   * `preferDiagonalFrom` aggiunge un bonus alle celle DIAGONALI adiacenti all'ultima
   * selezionata: muovendosi in diagonale il dito devia verso le celle laterali, e
   * senza questo bonus si accendono le lettere attorno invece di quella voluta.
   */
  const hitTestRef = useRef(
    (
      p: SwipePoint,
      opts?: { preferDiagonalFrom?: number; toleranceScale?: number },
    ): number | null => {
      const container = containerRef.current;
      if (!container) return null;
      const cRect = container.getBoundingClientRect();
      const x = p.x + cRect.left;
      const y = p.y + cRect.top;

      const grid = gridRef.current;
      const fromIdx = opts?.preferDiagonalFrom;
      const from = fromIdx !== undefined ? grid.tiles[fromIdx] : undefined;
      // Il bonus diagonale vale solo per celle ADIACENTI all'ultima: così non
      // "salta" mai a celle lontane, aiuta solo a disambiguare le 8 vicine.
      const DIAGONAL_BONUS = 0.28;

      let best: number | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestSize = 0;

      for (let i = 0; i < cellRefs.current.length; i++) {
        const el = cellRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(x - cx, y - cy);

        let score = dist;
        // Bonus diagonale: riduce la distanza effettiva della cella diagonale,
        // facendola vincere quando il dito è fra la laterale e la diagonale.
        if (from) {
          const tile = grid.tiles[i];
          if (tile) {
            const chebyshev = Math.max(
              Math.abs(tile.row - from.row),
              Math.abs(tile.col - from.col),
            );
            const isDiagonal =
              chebyshev === 1 &&
              Math.abs(tile.row - from.row) === 1 &&
              Math.abs(tile.col - from.col) === 1;
            if (isDiagonal) score -= r.width * DIAGONAL_BONUS;
          }
        }

        if (score < bestScore) {
          bestScore = score;
          best = i;
          bestSize = Math.max(r.width, r.height);
        }
      }

      if (best === null) return null;
      // Tolleranza: si accetta una cella se il punto è entro un raggio generoso
      // dal suo centro (metà diagonale della cella × scala).
      const tolerance = bestSize * 0.75 * (opts?.toleranceScale ?? 1);
      return bestScore <= tolerance ? best : null;
    },
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const controller = new SwipeController(
      el,
      () => gridRef.current,
      {
        hitTest: (p, opts) => hitTestRef.current(p, opts),
        onPathChange: (path) => {
          if (path.length > lastPathLenRef.current) audio.play('tap');
          lastPathLenRef.current = path.length;
          onPathChangeRef.current(path);
        },
        onCommit: (path) => {
          lastPathLenRef.current = 0;
          onCommitRef.current(path);
        },
      },
      {
        // Dimensione cella per l'interpolazione degli swipe veloci.
        getCellSize: () => {
          const first = cellRefs.current.find(Boolean);
          return first ? first.getBoundingClientRect().width : 48;
        },
      },
    );
    return () => controller.destroy();
  }, []);


  // Aggiorna i centri delle celle per il trail SVG (su resize e nuovo layout).
  useLayoutEffect(() => {
    const update = () => {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      setCenters(
        cellRefs.current.map((el) => {
          if (!el) return { x: 0, y: 0 };
          const r = el.getBoundingClientRect();
          return { x: r.left - cRect.left + r.width / 2, y: r.top - cRect.top + r.height / 2 };
        }),
      );
    };
    update();
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [grid]);

  const points = selectedPath
    .map((i) => centers[i])
    .filter((p): p is { x: number; y: number } => Boolean(p));
  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div
      ref={containerRef}
      className={`grid-board${flashError ? ' grid-board--error' : ''}`}
      style={{ ['--grid-size' as string]: grid.size }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="grid-trail" aria-hidden>
        {polyPoints && (
          <>
            <polyline className="grid-trail__glow" points={polyPoints} />
            <polyline className="grid-trail__line" points={polyPoints} />
          </>
        )}
      </svg>
      <div className="grid-cells" style={{ gridTemplateColumns: `repeat(${grid.size}, 1fr)` }}>
        {grid.tiles.map((tile) => {
          const pathIndex = selectedPath.indexOf(tile.index);
          const selected = pathIndex >= 0;
          return (
            <div
              key={tile.index}
              ref={(el) => {
                cellRefs.current[tile.index] = el;
              }}
              className={`tile${selected ? ' tile--selected' : ''}`}
              style={{
                animationDelay: `${(tile.row + tile.col) * 40}ms`,
                ['--order' as string]: pathIndex,
              }}
            >
              <span className="tile__letter">{tile.display}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
