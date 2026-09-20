import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Grid as GridModel } from '@boggle/shared';
import { SwipeController, gridAreAdjacent, type Layout } from '../game/swipe.js';
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
 * Griglia con swipe. Il percorso è renderizzato come trailer SVG luminoso
 * che collega i centri delle celle selezionate.
 *
 * Il riconoscimento delle celle è delegato a `SwipeController`
 * (settori angolari + deadzone + isteresi): vedi `game/cellTracker.ts`.
 */
export function GridBoard({ grid, selectedPath, onPathChange, onCommit, flashError }: GridBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [centers, setCenters] = useState<{ x: number; y: number }[]>([]);

  // Callback e griglia via ref: lo SwipeController si crea UNA volta sola e non
  // viene distrutto a metà gesture quando il parent re-renderizza.
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const onPathChangeRef = useRef(onPathChange);
  onPathChangeRef.current = onPathChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  // Suono di selezione: lo emettiamo quando il percorso si estende, non ad ogni move.
  const lastPathLenRef = useRef(0);

  /**
   * Layout fresco al momento della chiamata: i centri delle celle sono in
   * coordinate locali al container. Rileggere il DOM ad ogni punto (invece di
   * salvare i centri in stato) evita misure stale durante scroll/resize.
   */
  const buildLayout = useCallback((): Layout => {
    const size = gridRef.current.size;
    const centers: ({ x: number; y: number } | null)[] = new Array(size * size).fill(null);
    const container = containerRef.current;
    if (!container) return { size, centers };
    const cRect = container.getBoundingClientRect();
    for (let i = 0; i < centers.length; i++) {
      const el = cellRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      centers[i] = {
        x: r.left - cRect.left + r.width / 2,
        y: r.top - cRect.top + r.height / 2,
      };
    }
    return { size, centers };
  }, []);

  const areAdjacent = useRef(gridAreAdjacent(() => gridRef.current)).current;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const controller = new SwipeController(
      el,
      () => gridRef.current,
      {
        getLayout: buildLayout,
        areAdjacent,
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
      { startToleranceScale: 1.3 },
    );
    return () => controller.destroy();
  }, [areAdjacent, buildLayout]);
  // Aggiorna i centri delle celle per il trail SVG (su resize e nuovo layout).
  useLayoutEffect(() => {
    const update = () => {
      const layout = buildLayout();
      setCenters(
        layout.centers.map((c) => c ?? { x: 0, y: 0 }),
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
  }, [grid, buildLayout]);

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
