import { describe, expect, it } from 'vitest';
import { CellPathTracker, type Layout } from './cellTracker.js';

const SIZE = 5;
const PITCH = 80;

/** Layout sintetico: griglia regolare con gap, come a schermo. */
function layout(size = SIZE, pitch = PITCH): Layout {
  const centers: { x: number; y: number }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      centers.push({ x: 40 + c * pitch, y: 40 + r * pitch });
    }
  }
  return { size, centers };
}

function tracker(size = SIZE, pitch = PITCH) {
  const l = layout(size, pitch);
  const changes: number[][] = [];
  const t = new CellPathTracker({
    getLayout: () => l,
    areAdjacent: (a, b) => {
      const ar = Math.floor(a / size);
      const ac = a % size;
      const br = Math.floor(b / size);
      const bc = b % size;
      const dr = Math.abs(ar - br);
      const dc = Math.abs(ac - bc);
      return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
    },
    onPathChange: (p) => changes.push([...p]),
  });
  const center = (index: number) => l.centers[index]!;
  return { t, changes, center };
}

describe('CellPathTracker — diagonali', () => {
  it('segue una diagonale perfetta', () => {
    const { t, center } = tracker();
    // (0,0) -> (3,3)
    t.begin(center(0));
    for (let i = 1; i <= 3; i++) t.move(center(i * SIZE + i));
    expect([...t.currentPath]).toEqual([0, 6, 12, 18]);
  });

  it('sceglie la diagonale anche con deviazione verso la laterale (20%)', () => {
    const { t, center } = tracker();
    const start = center(0);
    const target = center(6); // (1,1)
    t.begin(start);
    // muoviti verso la diagonale ma deviando del 20% verso destra
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    t.move({ x: start.x + dx + Math.abs(dx) * 0.2, y: start.y + dy });
    expect([...t.currentPath]).toEqual([0, 6]);
  });

  it('riconosce una diagonale verso l\'alto (dy negativo)', () => {
    const { t, center } = tracker();
    t.begin(center(12)); // (2,2)
    t.move(center(6)); // (1,1)
    expect([...t.currentPath]).toEqual([12, 6]);
  });

  it('traccia un percorso a zig-zag incrociato senza celle sbagliate', () => {
    const { t, center } = tracker();
    // (0,1) -> (1,2) -> (2,1) -> (3,0): diagonali alternate destra/sinistra
    const path = [1, 7, 11, 15];
    t.begin(center(path[0]!));
    for (const idx of path.slice(1)) t.move(center(idx));
    expect([...t.currentPath]).toEqual(path);
  });

  it('non seleziona la laterale restando fermi sul centro', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move(center(0));
    expect([...t.currentPath]).toEqual([0]);
  });

  it('sceglie la ortogonale per un movimento orizzontale netto', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move({ x: center(0).x + PITCH, y: center(0).y + 4 });
    expect([...t.currentPath]).toEqual([0, 1]);
  });

  it('non cambia cella dentro la deadzone', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move({ x: center(0).x + PITCH * 0.2, y: center(0).y + PITCH * 0.2 });
    expect([...t.currentPath]).toEqual([0]);
  });

  it('interpola uno swipe veloce non perdendo le celle intermedie', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    // salto diretto da (0,0) a (0,4) senza eventi intermedi
    t.move(center(4));
    expect([...t.currentPath]).toEqual([0, 1, 2, 3, 4]);
  });

  it('annulla l\'ultimo passo tornando indietro', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move(center(1));
    t.move(center(2));
    t.move(center(1)); // undo
    expect([...t.currentPath]).toEqual([0, 1]);
  });

  it('non ripete celle già usate', () => {
    const { t, center } = tracker();
    t.begin(center(1)); // (0,1)
    t.move(center(6)); // (1,1)
    t.move(center(2)); // (0,2)
    t.move(center(1)); // cella già usata e non penultima: ignorata
    expect([...t.currentPath]).toEqual([1, 6, 2]);
  });

  it('ignora i punti fuori griglia', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    const outside = { x: center(0).x - PITCH * 5, y: center(0).y - PITCH * 5 };
    expect(t.move(outside)).toBe(false);
    expect([...t.currentPath]).toEqual([0]);
  });

  it('begin fallisce fuori dalla griglia', () => {
    const { t } = tracker();
    expect(t.begin({ x: -200, y: -200 })).toBe(false);
    expect([...t.currentPath]).toEqual([]);
  });

  it('end ritorna il percorso finale e resetta', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move(center(6));
    expect(t.end()).toEqual([0, 6]);
    expect([...t.currentPath]).toEqual([]);
  });

  it('funziona anche su griglia 4x4 e 6x6', () => {
    for (const size of [4, 6]) {
      const { t, center } = tracker(size);
      const last = size - 1;
      t.begin(center(0));
      for (let i = 1; i <= last; i++) t.move(center(i * size + i));
      expect([...t.currentPath]).toEqual(
        Array.from({ length: size }, (_, i) => i * size + i),
      );
    }
  });

  it('robusto al tremolio sul bordo fra due celle', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move(center(6)); // diagonale confermata
    // tremolio attorno al confine fra la diagonale e la laterale, senza
    // superare la soglia di isteresi in modo netto
    for (let i = 0; i < 6; i++) {
      const jitter = { x: center(6).x + (i % 2 ? -14 : 14), y: center(6).y + 6 };
      t.move(jitter);
    }
    expect([...t.currentPath]).toEqual([0, 6]);
  });
});
