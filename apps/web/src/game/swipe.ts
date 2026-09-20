import type { Grid } from '@boggle/shared';

export interface SwipePoint {
  x: number;
  y: number;
}

/** Opzioni di hit-test: permettono di favorire una cella diagonale. */
export interface HitTestOptions {
  /**
   * Indice dell'ultima cella selezionata. Se presente, l'hit-test prova a
   * preferire una cella DIAGONALE adiacente a questa: rende le diagonali
   * molto più facili da tracciare senza "accendere" le celle laterali.
   */
  preferDiagonalFrom?: number;
  /** Moltiplicatore del raggio di tolleranza (default 1). */
  toleranceScale?: number;
}

export interface SwipeCallbacks {
  /** Cella col centro più vicino al punto, o null se fuori tolleranza. */
  hitTest: (p: SwipePoint, options?: HitTestOptions) => number | null;
  /** Chiamato quando il percorso cambia (aggiunta/undo). */
  onPathChange: (path: number[]) => void;
  /** Chiamato al rilascio: il percorso e' definitivo. */
  onCommit: (path: number[]) => void;
}

export interface SwipeOptions {
  /** Dimensione tipica di una cella in px: usata per interpolare i movimenti veloci. */
  getCellSize?: () => number;
}

/**
 * Gestione dello swipe sulla griglia con Pointer Events (mouse + touch + pen).
 *
 * Perché è più preciso di un semplice "trova la cella sotto il dito":
 *  1. **Centro più vicino**: il punto non deve cadere dentro la cella (i gap tra le
 *     celle e gli angoli arrotondati creano zone morte). Basta avvicinarsi al centro.
 *  2. **Bias diagonale**: muovendosi in diagonale, il dito devia naturalmente verso
 *     le celle laterali. Se la cella diagonale è plausibile la preferiamo, così non
 *     si "accendono" le lettere attorno.
 *  3. **Interpolazione**: su swipe veloci il pointer salta da una cella a una lontana.
 *     Interpoliamo tra i due punti per non perdere le celle intermedie.
 */
export class SwipeController {
  private path: number[] = [];
  private active = false;
  private lastHit: number | null = null;
  private lastPoint: SwipePoint | null = null;
  private pointerId: number | null = null;

  constructor(
    private readonly element: HTMLElement,
    private readonly getGrid: () => Grid,
    private readonly callbacks: SwipeCallbacks,
    private readonly options: SwipeOptions = {},
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
    this.lastPoint = null;
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
    const p = this.localPoint(e);
    // Tolleranza ampia sul primo tocco: è più facile iniziare la parola.
    const idx = this.callbacks.hitTest(p, { toleranceScale: 1.3 });
    if (idx === null) return;
    this.active = true;
    this.pointerId = e.pointerId;
    this.path = [idx];
    this.lastHit = idx;
    this.lastPoint = p;
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
    const p = this.localPoint(e);
    const from = this.lastPoint ?? p;

    // Interpolazione: se il dito si è mosso molto dall'ultimo evento, campioniamo
    // alcuni punti intermedi, così non perdiamo le celle attraversate.
    const cellSize = this.options.getCellSize?.() ?? 48;
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.min(8, Math.ceil(distance / (cellSize * 0.4))));

    let changed = false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const sample: SwipePoint = { x: from.x + dx * t, y: from.y + dy * t };
      if (this.applyPoint(sample)) changed = true;
    }
    this.lastPoint = p;
    if (changed) {
      e.preventDefault();
      this.callbacks.onPathChange([...this.path]);
    }
  };

  /**
   * Prova ad estendere/accorciare il percorso con un punto campionato.
   * Ritorna true se il percorso è cambiato.
   */
  private applyPoint(p: SwipePoint): boolean {
    const last = this.path[this.path.length - 1];
    const idx = this.callbacks.hitTest(p, {
      preferDiagonalFrom: last,
      toleranceScale: 1,
    });
    if (idx === null) return false;
    if (idx === this.lastHit) return false;

    // Undo: tornando sulla penultima cella si annulla l'ultimo passo.
    const penultimo = this.path[this.path.length - 2];
    if (idx === penultimo) {
      this.path.pop();
      this.lastHit = idx;
      return true;
    }
    if (this.path.includes(idx)) return false; // niente celle ripetute

    const grid = this.getGrid();
    if (last !== undefined && !areAdjacentByIndex(grid, last, idx)) return false;

    this.path.push(idx);
    this.lastHit = idx;
    return true;
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.active) return;
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    const path = [...this.path];
    this.active = false;
    this.path = [];
    this.lastHit = null;
    this.lastPoint = null;
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
