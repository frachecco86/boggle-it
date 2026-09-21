import type { Grid } from '@boggle/shared';

export interface Point {
  x: number;
  y: number;
}

/** Geometria corrente della griglia, in coordinate locali all'elemento. */
export interface Layout {
  /** Numero di celle per lato. */
  size: number;
  /** Centro di ogni cella, indicizzato per `tile.index`; `null` se non misurabile. */
  centers: (Point | null)[];
}

export interface TrackerHooks {
  /** Layout fresco al momento della chiamata (i centri cambiano con resize/rotazione). */
  getLayout: () => Layout;
  /** true se due indici sono celle adiacenti (8-vicinato). */
  areAdjacent: (a: number, b: number) => boolean;
  onPathChange: (path: number[]) => void;
}

export interface TrackerTuning {
  /**
   * Distanza minima dal centro (in passi) per cambiare cella.
   *
   * Era 0.28 (poco più di un quarto di cella): bastava sfiorare il bordo per
   * attivare la lettera accanto. 0.42 impone di arrivare quasi a metà cella,
   * così una passata veloce non "accende" le celle che si sfiorano soltanto.
   */
  deadZone: number;
  /** Distanza minima per annullare l'ultimo passo (undo), più alta per non farlo per sbaglio. */
  backDeadZone: number;
  /**
   * Sotto questo rapporto min/max il movimento è considerato diagonale.
   *
   * Un valore PIÙ BASSO allarga i settori diagonali: 0.36 corrisponde a una
   * diagonale accettata entro ~±25° dai 45°, quindi il gesto diagonale non
   * scivola più sulla cella ortogonale quando il dito devia un po'.
   */
  diagonalRatio: number;
  /** coseno minimo fra vettore del dito e direzione scelta. */
  alignMin: number;
  /** coseno minimo per CAMBIARE direzione rispetto a quella appena confermata. */
  alignSwitch: number;
  /** Massimo number di celle aggiunte con un singolo campione (anti-runaway). */
  maxChain: number;
}

export const DEFAULT_TUNING: TrackerTuning = {
  deadZone: 0.42,
  backDeadZone: 0.52,
  diagonalRatio: 0.36,
  alignMin: 0.86,
  alignSwitch: 0.95,
  maxChain: 10,
};

/**
 * Trasforma il movimento del dito in un percorso di celle adiacenti.
 *
 * Differenza chiave rispetto a un hit-test "cella più vicina":
 * il centro più vicino divide il piano in settori quadrati, quindi il settore
 * della cella ORTOGONALE arriva fino a 45°. Muovendosi in diagonale il dito
 * finisce quindi spesso nella cella laterale.
 *
 * Qui invece, partendo dall'ultima cella selezionata:
 *  1. si guarda la DIREZIONE del vettore dito→centro, classificata in 8 settori
 *     angolari (diagonali più larghi di 45°±20°, così le diagonali sono facili);
 *  2. si esige che il dito sia oltre una DEADZONE dal centro (niente cambi
 *     mentre si è fermi o tremolanti);
 *  3. si esige un ALLINEAMENTO minimo fra dito e direzione scelta, più severo se
 *     si cambia direzione (ISTERESI): il percorso non "sfarfalla" sul bordo;
 *  4. ogni passo produce una cella ADIACENTE, quindi il percorso è sempre valido.
 */
export class CellPathTracker {
  private path: number[] = [];
  private lastPoint: Point | null = null;
  /** Direzione (dx,dy) dell'ultimo passo confermato: usata per l'isteresi. */
  private committedDir: { dx: number; dy: number } | null = null;

  constructor(
    private readonly hooks: TrackerHooks,
    private readonly tuning: TrackerTuning = DEFAULT_TUNING,
  ) {}

  get currentPath(): readonly number[] {
    return this.path;
  }

  get active(): boolean {
    return this.path.length > 0;
  }

  /** Distanza tipica fra i centri (passo della griglia) in px. */
  private pitch(layout: Layout): number {
    const centers = layout.centers;
    for (let i = 1; i < centers.length; i++) {
      const a = centers[i - 1];
      const b = centers[i];
      if (!a || !b) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > 1) return d;
    }
    return 48;
  }

  /** Cella col centro più vicino al punto, entro un raggio di tolleranza. */
  nearest(point: Point, toleranceScale = 1): number | null {
    const layout = this.hooks.getLayout();
    const pitch = this.pitch(layout);
    const tolerance = pitch * 0.7 * toleranceScale;
    let best: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < layout.centers.length; i++) {
      const c = layout.centers[i];
      if (!c) continue;
      const d = Math.hypot(point.x - c.x, point.y - c.y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best !== null && bestDist <= tolerance ? best : null;
  }

  /** Inizia il percorso dalla cella colpita. Ritorna false se il punto è fuori griglia. */
  begin(point: Point, toleranceScale = 1.3): boolean {
    const idx = this.nearest(point, toleranceScale);
    if (idx === null) return false;
    this.path = [idx];
    this.lastPoint = point;
    this.committedDir = null;
    this.emit();
    return true;
  }

  /**
   * Aggiorna il percorso verso `point`, campionando il segmento percorso.
   * Ritorna true se il percorso è cambiato.
   */
  move(point: Point): boolean {
    if (this.path.length === 0) return false;
    const layout = this.hooks.getLayout();
    const pitch = this.pitch(layout);
    const from = this.lastPoint ?? point;
    const dx = point.x - from.x;
    const dy = point.y - from.y;
    const distance = Math.hypot(dx, dy);

    // Campionamento del segmento: uno swipe veloce non deve saltare le celle.
    const steps = Math.max(1, Math.min(24, Math.ceil(distance / (pitch / 3))));
    let changed = false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      // L'undo è valutato SOLO sull'ultimo campione del segmento.
      //
      // Perché: interpolando, i campioni intermedi possono cadere "indietro"
      // rispetto al centro appena aggiunto. Valutando l'undo anche lì, la cella
      // veniva aggiunta e tolta più volte nella stessa chiamata (l'oscillazione
      // faceva dipendere il risultato dalla parità dei campioni). Ora il passo
      // avanti resta avanti e l'indietro si considera solo sul punto reale del dito.
      const isLastSample = s === steps;
      if (this.step({ x: from.x + dx * t, y: from.y + dy * t }, layout, pitch, isLastSample)) {
        changed = true;
      }
    }
    this.lastPoint = point;
    if (changed) this.emit();
    return changed;
  }

  /** Chiude il gesto e ritorna il percorso finale (poi si resetta). */
  end(): number[] {
    const path = [...this.path];
    this.reset();
    return path;
  }

  reset(): void {
    this.path = [];
    this.lastPoint = null;
    this.committedDir = null;
    this.emit();
  }

  private emit(): void {
    this.hooks.onPathChange([...this.path]);
  }

  /** Un singolo passo greedy: applica deadzone, settore angolare e isteresi. */
  private step(point: Point, layout: Layout, pitch: number, allowUndo: boolean): boolean {
    const size = layout.size;
    let changed = false;

    for (let chain = 0; chain < this.tuning.maxChain; chain++) {
      const last = this.path[this.path.length - 1];
      if (last === undefined) break;
      const center = layout.centers[last];
      if (!center) break;
      const tile = this.tileOf(last, size);
      if (!tile) break;

      const vx = point.x - center.x;
      const vy = point.y - center.y;
      const ax = Math.abs(vx);
      const ay = Math.abs(vy);
      const maxAxis = Math.max(ax, ay);
      if (maxAxis < pitch * this.tuning.deadZone) break;

      const minAxis = Math.min(ax, ay);
      let gx = 0;
      let gy = 0;
      if (maxAxis > 0 && minAxis > maxAxis * this.tuning.diagonalRatio) {
        gx = vx > 0 ? 1 : -1;
        gy = vy > 0 ? 1 : -1;
      } else if (ax >= ay) {
        gx = vx > 0 ? 1 : -1;
      } else {
        gy = vy > 0 ? 1 : -1;
      }

      const len = Math.hypot(vx, vy) || 1;
      const align = (ax * Math.abs(gx) + ay * Math.abs(gy)) / (len * Math.hypot(gx, gy));
      if (align < this.tuning.alignMin) break;

      const row = tile.row + gy;
      const col = tile.col + gx;
      if (row < 0 || col < 0 || row >= size || col >= size) break;
      const target = row * size + col;
      if (!this.hooks.areAdjacent(last, target)) break;

      const penultimo = this.path[this.path.length - 2];
      const switching = this.committedDir !== null && (this.committedDir.dx !== gx || this.committedDir.dy !== gy);

      if (target === penultimo) {
        // Undo: solo su un campione reale (non interpolato) e con movimento deciso,
        // così non si annulla per tremolio né durante un passo in avanti.
        if (!allowUndo) break;
        if (maxAxis < pitch * this.tuning.backDeadZone) break;
        if (align < this.tuning.alignSwitch) break;
        this.path.pop();
        this.committedDir = null;
        this.lastPoint = point;
        changed = true;
        continue;
      }

      if (this.path.includes(target)) break;
      if (switching && align < this.tuning.alignSwitch) break;

      this.path.push(target);
      this.committedDir = { dx: gx, dy: gy };
      changed = true;
    }

    return changed;
  }

  /** Posizione (row/col) della cella a partire dall'indice lineare. */
  private tileOf(index: number, size: number): { row: number; col: number } | null {
    if (index < 0 || index >= size * size) return null;
    return { row: Math.floor(index / size), col: index % size };
  }
}

/** Adattatore: costruisce l'hooks grid-based a partire da un `Grid`. */
export function gridAreAdjacent(getGrid: () => Grid): (a: number, b: number) => boolean {
  return (a, b) => {
    const grid = getGrid();
    const ta = grid.tiles[a];
    const tb = grid.tiles[b];
    if (!ta || !tb) return false;
    const dr = Math.abs(ta.row - tb.row);
    const dc = Math.abs(ta.col - tb.col);
    return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
  };
}
