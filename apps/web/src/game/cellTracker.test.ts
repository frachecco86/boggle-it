import { describe, expect, it } from 'vitest';
import { CellPathTracker, DEFAULT_TUNING, type Layout } from './cellTracker.js';

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

/*
 * Regressione sui difetti segnalati giocando:
 *  1. lo swipe era iper-sensibile: per attivare una cella bastava sfiorarla di
 *     pochi pixel;
 *  2. il gesto DIAGONALE scivolava sulla cella ortogonale se non era preciso.
 * I test qui sotto fissano le soglie nuove (più tolleranti) e le proteggono da
 * future regressioni: sono le due cose che l'utente ha chiesto esplicitamente.
 */
describe('CellPathTracker — tolleranza dello swipe', () => {
  it('NON attiva la cella accanto sfiorandola di pochi pixel', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    // ~25% della cella verso destra: era sufficiente per superare la deadzone 0.28.
    t.move({ x: center(0).x + PITCH * 0.25, y: center(0).y });
    expect([...t.currentPath]).toEqual([0]);
  });

  it('attiva la cella accanto quando il dito ci arriva davvero', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move(center(1));
    expect([...t.currentPath]).toEqual([0, 1]);
  });

  it('resta sulla diagonale anche con una deviazione più marcata (30%)', () => {
    const { t, center } = tracker();
    const start = center(0);
    const target = center(6); // (1,1)
    t.begin(start);
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    // Gesto diagonale impreciso: 30% di scarto sull'asse X.
    t.move({ x: start.x + dx + Math.abs(dx) * 0.3, y: start.y + dy });
    expect([...t.currentPath]).toEqual([0, 6]);
  });

  it('un movimento quasi orizzontale resta orizzontale', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move({ x: center(0).x + PITCH, y: center(0).y + PITCH * 0.15 });
    expect([...t.currentPath]).toEqual([0, 1]);
  });

  it('lo swipe avanti non viene annullato dai campioni interpolati', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    // Movimento lungo e veloce in diagonale: viene campionato internamente.
    t.move(center(3 * SIZE + 3));
    // Il percorso deve contenere la diagonale, non tornare indietro.
    expect([...t.currentPath]).toEqual([0, 6, 12, 18]);
  });
});

/*
 * Regressione sul terzo difetto segnalato giocando: le celle si accendevano e
 * spegnevano con troppa facilità. Tre cause, tutte coperte qui:
 *  1. la soglia di ATTIVAZIONE era sotto il confine geometrico fra le celle
 *     (0.5), quindi la cella si accendeva prima che il dito uscisse da quella
 *     corrente;
 *  2. la soglia di UNDO era quasi uguale a quella di attivazione: nessuna
 *     isteresi, quindi un tremolio spegneva e riaccendeva la stessa cella;
 *  3. i micro-movimenti venivano processati uno per uno invece di accumularsi.
 */
describe('CellPathTracker — attivazione e isteresi', () => {
  it('la soglia di attivazione sta OLTRE il confine fra le celle', () => {
    // Il confine geometrico è a 0.5 passi: sotto quella distanza la cella vicina
    // non deve accendersi, altrimenti si attiva "sfiorando il pixel".
    expect(DEFAULT_TUNING.deadZone).toBeGreaterThan(0.5);
    // L'undo deve essere più severo dell'attivazione (isteresi vera).
    expect(DEFAULT_TUNING.backDeadZone).toBeGreaterThan(DEFAULT_TUNING.deadZone);
  });

  it('NON attiva la cella vicina appena oltre metà strada', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    // 52% del passo: oltre il centro geometrico, ma sotto la nuova soglia 0.56.
    t.move({ x: center(0).x + PITCH * 0.52, y: center(0).y });
    expect([...t.currentPath]).toEqual([0]);
  });

  it('attiva la cella vicina superando la soglia', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move({ x: center(0).x + PITCH * 0.6, y: center(0).y });
    expect([...t.currentPath]).toEqual([0, 1]);
  });

  it('un tremolio di pochi pixel sul confine non accende/spegne la cella', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    // Attiva la cella 1 in modo deciso.
    t.move(center(1));
    expect([...t.currentPath]).toEqual([0, 1]);
    // Ora oscilla di pochi pixel attorno alla posizione, senza tornare davvero
    // verso la cella 0: il percorso NON deve cambiare.
    for (let i = 0; i < 12; i++) {
      t.move({
        x: center(1).x + (i % 2 ? -3 : 3),
        y: center(1).y + (i % 2 ? 2 : -2),
      });
      expect([...t.currentPath]).toEqual([0, 1]);
    }
  });

  it('i micro-movimenti si ACCUMULANO invece di essere ignorati', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    // Molti passi piccoli (2 px, sotto la soglia minMove ~4.8 px) che sommati
    // superano una cella: il filtro anti-tremolio NON deve bloccare lo swipe.
    const step = PITCH / 40; // 2 px
    for (let x = step; x <= PITCH * 1.05; x += step) {
      t.move({ x: center(0).x + x, y: center(0).y });
    }
    expect([...t.currentPath]).toEqual([0, 1]);
  });

  it('l\'undo richiede un movimento indietro DECISO', () => {
    const { t, center } = tracker();
    t.begin(center(0));
    t.move(center(1));
    t.move(center(2));
    expect([...t.currentPath]).toEqual([0, 1, 2]);
    // Torna indietro di poco (sotto backDeadZone): la cella 2 resta selezionata.
    t.move({ x: center(2).x - PITCH * 0.3, y: center(2).y });
    expect([...t.currentPath]).toEqual([0, 1, 2]);
    // Torna indietro in modo deciso: l'ultimo passo viene annullato.
    t.move(center(1));
    expect([...t.currentPath]).toEqual([0, 1]);
  });

  it('garantisce l\'isteresi anche con una configurazione sbagliata', () => {
    // Con una tuning che viola l'isteresi (backDeadZone <= deadZone) il tracker
    // deve correggerla da solo, altrimenti la cella tremolerebbe sul confine.
    const l = layout();
    const t = new CellPathTracker(
      {
        getLayout: () => l,
        areAdjacent: (a, b) => {
          const ar = Math.floor(a / SIZE), ac = a % SIZE;
          const br = Math.floor(b / SIZE), bc = b % SIZE;
          const dr = Math.abs(ar - br), dc = Math.abs(ac - bc);
          return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
        },
        onPathChange: () => {},
      },
      { ...DEFAULT_TUNING, deadZone: 0.4, backDeadZone: 0.4 },
    );
    const center = (i: number) => l.centers[i]!;
    t.begin(center(0));
    t.move(center(1));
    expect([...t.currentPath]).toEqual([0, 1]);
    // Piccolo ritorno verso la cella 0: NON deve annullare (isteresi corretta).
    t.move({ x: center(1).x - PITCH * 0.45, y: center(1).y });
    expect([...t.currentPath]).toEqual([0, 1]);
  });
});
