import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Grid as GridModel } from '@boggle/shared';
import { SwipeController, type SwipePoint } from '../game/swipe.js';

interface GridBoardProps {
  grid: GridModel;
  selectedPath: readonly number[];
  onPathChange: (path: number[]) => void;
  onCommit: (path: number[]) => void;
  shake?: boolean;
}

/**
 * Griglia con swipe. Il percorso e' renderizzato come trailer SVG luminoso
 * che collega i centri delle celle selezionate.
 */
export function GridBoard({ grid, selectedPath, onPathChange, onCommit, shake }: GridBoardProps) {
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

  // Hit test: usa i rect delle celle (aggiornati al layout corrente).
  const hitTestRef = useRef((p: SwipePoint): number | null => {
    const container = containerRef.current;
    if (!container) return null;
    const cRect = container.getBoundingClientRect();
    const x = p.x + cRect.left;
    const y = p.y + cRect.top;
    for (let i = 0; i < cellRefs.current.length; i++) {
      const el = cellRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const controller = new SwipeController(el, () => gridRef.current, {
      hitTest: (p) => hitTestRef.current(p),
      onPathChange: (path) => onPathChangeRef.current(path),
      onCommit: (path) => onCommitRef.current(path),
    });
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
      className={`grid-board${shake ? ' shake' : ''}`}
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
