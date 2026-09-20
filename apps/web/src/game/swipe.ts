import type { Grid } from '@boggle/shared';

export interface SwipePoint {
  x: number;
  y: number;
}

export interface SwipeCallbacks {
  /** Ritorna l'indice della cella sotto il punto, o null. */
  hitTest: (p: SwipePoint) => number | null;
  /** Chiamato quando il percorso cambia (aggiunta/undo). */
  onPathChange: (path: number[]) => void;
  /** Chiamato al rilascio: il percorso e' definitivo. */
  onCommit: (path: number[]) => void;
}

/**
 * Gestione dello swipe sulla griglia con Pointer Events (mouse + touch + pen).
 * Regole:
 *  - si parte premendo su una cella
 *  - passando su celle adiacenti si estende il percorso
 *  - tornando sull'ultima cella precedente si annulla l'ultimo passo
 *  - rilasciando si conferma
 */
export class SwipeController {
  private path: number[] = [];
  private active = false;
  private lastHit: number | null = null;
  private pointerId: number | null = null;
  /** Cache delle celle gia' passate per hit test economico. */
  constructor(
    private readonly element: HTMLElement,
    private readonly getGrid: () => Grid,
    private readonly callbacks: SwipeCallbacks,
  ) {
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerUp);
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('pointerleave', this.onPointerUp);
  }

  get isActive(): boolean {
    return this.active;
  }

  get currentPath(): readonly number[] {
    return this.path;
  }

  /** Reset esterno (es. nuovo round). */
  reset(): void {
    this.active = false;
    this.path = [];
    this.lastHit = null;
    this.pointerId = null;
    this.callbacks.onPathChange([]);
  }

  private localPoint(e: PointerEvent): SwipePoint {
    const rect = this.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Ignora click con tasto destro / secondari
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const idx = this.callbacks.hitTest(this.localPoint(e));
    if (idx === null) return;
    this.active = true;
    this.pointerId = e.pointerId;
    this.path = [idx];
    this.lastHit = idx;
    try {
      this.element.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer non attivo (es. eventi sintetici) */
    }
    e.preventDefault();
    this.callbacks.onPathChange([...this.path]);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.active) return;
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    const idx = this.callbacks.hitTest(this.localPoint(e));
    if (idx === null) return;
    if (idx === this.lastHit) return;

    const last = this.path[this.path.length - 1];
    // Undo: se torno sulla penultima cella, rimuovo l'ultima
    const penultimo = this.path[this.path.length - 2];
    if (idx === penultimo) {
      this.path.pop();
      this.lastHit = idx;
      e.preventDefault();
      this.callbacks.onPathChange([...this.path]);
      return;
    }
    if (this.path.includes(idx)) return; // niente celle ripetute

    const grid = this.getGrid();
    if (last !== undefined && !areAdjacentByIndex(grid, last, idx)) return;

    this.path.push(idx);
    this.lastHit = idx;
    e.preventDefault();
    this.callbacks.onPathChange([...this.path]);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.active) return;
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    const path = [...this.path];
    this.active = false;
    this.path = [];
    this.lastHit = null;
    this.pointerId = null;
    try {
      this.element.releasePointerCapture?.(e.pointerId);
    } catch {
      /* pointer non attivo */
    }
    this.callbacks.onPathChange([]);
    if (path.length > 0) this.callbacks.onCommit(path);
  };
}

function areAdjacentByIndex(grid: Grid, a: number, b: number): boolean {
  const ta = grid.tiles[a];
  const tb = grid.tiles[b];
  if (!ta || !tb) return false;
  const dr = Math.abs(ta.row - tb.row);
  const dc = Math.abs(ta.col - tb.col);
  return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
}
