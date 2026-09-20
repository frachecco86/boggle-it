import type { Grid } from '@boggle/shared';
import { CellPathTracker, gridAreAdjacent, type Layout, type Point, type TrackerTuning } from './cellTracker.js';

export type SwipePoint = Point;

export interface SwipeCallbacks {
  /** Layout corrente della griglia (centri + size). */
  getLayout: () => Layout;
  /** true se due indici sono adiacenti. */
  areAdjacent: (a: number, b: number) => boolean;
  /** Chiamato quando il percorso cambia (aggiunta/undo), anche a percorso vuoto. */
  onPathChange: (path: number[]) => void;
  /** Chiamato al rilascio: il percorso è definitivo. */
  onCommit: (path: number[]) => void;
}

export interface SwipeOptions {
  /** Tolleranza iniziale sul primo tocco (1 = mezza cella). */
  startToleranceScale?: number;
  /** Parametri di riconoscimento (deadzone, diagonali, isteresi). */
  tuning?: TrackerTuning;
  /** true se il pointer ha origine su un elemento interattivo da ignorare (bottoni). */
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
}

/**
 * Gesto di swipe indipendente dal DOM: riceve punti in coordinate locali
 * all'elemento e delega il riconoscimento delle celle a `CellPathTracker`.
 *
 * Il gesto è NO-OP se il percorso è vuoto (nessun punto di partenza valido),
 * così un tocco fuori griglia non muove nulla.
 */
export class SwipeGesture {
  private readonly tracker: CellPathTracker;
  private active = false;

  constructor(
    private readonly callbacks: SwipeCallbacks,
    private readonly options: SwipeOptions = {},
  ) {
    this.tracker = new CellPathTracker(
      {
        getLayout: callbacks.getLayout,
        areAdjacent: callbacks.areAdjacent,
        onPathChange: callbacks.onPathChange,
      },
      options.tuning,
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  get currentPath(): readonly number[] {
    return this.tracker.currentPath;
  }

  pointerDown(point: SwipePoint): boolean {
    if (this.active) return false;
    const started = this.tracker.begin(point, this.options.startToleranceScale ?? 1.3);
    if (started) this.active = true;
    return started;
  }

  pointerMove(point: SwipePoint): boolean {
    if (!this.active) return false;
    return this.tracker.move(point);
  }

  /** Rilascia: ritorna il percorso finale (o [] se il gesto non era attivo). */
  pointerUp(): number[] {
    if (!this.active) return [];
    this.active = false;
    const path = this.tracker.end();
    if (path.length > 0) this.callbacks.onCommit(path);
    return path;
  }

  /** Annulla senza committare (pointercancel, layout change, nuovo round). */
  cancel(): void {
    this.active = false;
    this.tracker.reset();
  }

  reset(): void {
    this.cancel();
  }
}

/**
 * Swipe su una griglia con Pointer Events (mouse + touch + pen).
 *
 * Riconoscimento: vedi `CellPathTracker` — settori angolari + deadzone +
 * isteresi al posto del "centro più vicino", che sulle diagonali selezionava
 * le celle ortogonali.
 */
export class SwipeController {
  private pointerId: number | null = null;
  private readonly gesture: SwipeGesture;

  constructor(
    private readonly element: HTMLElement,
    getGrid: () => Grid,
    callbacks: SwipeCallbacks,
    private readonly options: SwipeOptions = {},
  ) {
    this.gesture = new SwipeGesture(callbacks, options);
    // `getGrid` è accettato per compatibilità: l'adiacenza arriva dai callbacks.
    void getGrid;

    // Listener sul WINDOW: il capture può interrompersi (cambio schermata,
    // re-render, gesto di sistema) e in quel caso pointerup/pointercancel non
    // arriverebbero più sull'elemento, lasciandolo "agganciato" per sempre.
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('blur', this.onWindowBlur);
  }

  destroy(): void {
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('blur', this.onWindowBlur);
  }

  get isActive(): boolean {
    return this.gesture.isActive;
  }

  get currentPath(): readonly number[] {
    return this.gesture.currentPath;
  }

  reset(): void {
    this.abort();
  }

  private localPoint(e: PointerEvent): SwipePoint {
    const rect = this.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    // Ignora tasto destro / secondari.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!this.element.contains(e.target as Node)) return;
    if (this.options.shouldIgnoreTarget?.(e.target)) return;
    // Self-healing: un pointerup perso (browser mobile, gesture interrotta) non
    // deve bloccare per sempre lo swipe. Un nuovo tocco su un NUOVO pointer
    // riparte azzerando lo stato sporco.
    if (this.pointerId !== null && this.pointerId !== e.pointerId) this.abort();
    if (this.pointerId !== null) return;

    const started = this.gesture.pointerDown(this.localPoint(e));
    if (!started) return;

    this.pointerId = e.pointerId;
    try {
      this.element.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer non attivo (es. eventi sintetici nei test) */
    }
    // Evita selezione testo / gesti di compatibilità durante il drag.
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.gesture.isActive) return;
    // Movimento di un altro dito: ignorato senza toccare il percorso corrente.
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    if (this.gesture.pointerMove(this.localPoint(e))) e.preventDefault();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.gesture.isActive) return;
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    // SwipeGesture.pointerUp() ha già chiamato onCommit con il percorso finale.
    this.gesture.pointerUp();
    // Il pointerup arriva mentre il capture è ancora attivo: rilascia subito.
    // `onPointerCancel` (via lostpointercapture) è ora un no-op se lo stato è pulito,
    // quindi non azzera un gesto nuovo iniziato nel frattempo.
    this.release(e.pointerId);
  };

  /** Riporta il controller a riposo, scartando il gesto in corso. */
  private abort(): void {
    const pointerId = this.pointerId;
    this.pointerId = null;
    this.gesture.cancel();
    if (pointerId !== null) {
      try {
        this.element.releasePointerCapture?.(pointerId);
      } catch {
        /* pointer non attivo */
      }
    }
  }

  private onPointerCancel = (e: PointerEvent): void => {
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    this.abort();
  };

  /** Blur/visibility change (es. app in background): chiude il gesto in corso. */
  private onWindowBlur = (): void => {
    this.abort();
  };

  private release(pointerId: number): void {
    this.pointerId = null;
    try {
      this.element.releasePointerCapture?.(pointerId);
    } catch {
      /* pointer non attivo */
    }
  }
}

export { CellPathTracker, gridAreAdjacent };
export type { Layout, Point, TrackerTuning };
