/**
 * Test del livello audio: volumi dei motivi e, in particolare, la differenza fra
 * l'esultanza PROPRIA e quella degli AVVERSARI.
 *
 * Perché conta: sentire le parole degli altri a volume pieno sarebbe invasivo;
 * non sentirle affatto toglierebbe un'informazione utile ("come sta andando la
 * partita"). Il test fissa il rapporto fra i due volumi.
 *
 * Il motore usa la Web Audio API, assente in Node: qui la simuliamo con un finto
 * AudioContext che REGISTRA i valori di gain, così possiamo verificare i volumi
 * senza un browser.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

/** Oscillatore finto: registra frequenza e type. */
class FakeOscillator {
  type: OscillatorType = 'sine';
  frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn().mockReturnThis();
  start = vi.fn();
  stop = vi.fn();
}

/** Gain finto: registra i volumi di picco (dove il motore scrive il volume reale). */
class FakeGain {
  gain = {
    value: 1,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn((v: number) => {
      // Il primo ramo (verso l'alto) porta il volume di picco: lo registriamo.
      if (v > 0.001) peaks.push(v);
    }),
  };
  connect = vi.fn().mockReturnThis();
}

let peaks: number[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';
  createGain() {
    return new FakeGain() as unknown as GainNode;
  }
  createOscillator() {
    return new FakeOscillator() as unknown as OscillatorNode;
  }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { value: 0 },
      connect: vi.fn().mockReturnThis(),
    } as unknown as BiquadFilterNode;
  }
  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() } as unknown as MediaElementAudioSourceNode;
  }
  resume() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  peaks = [];
  vi.stubGlobal('window', { AudioContext: FakeAudioContext } as unknown as Window & typeof globalThis);
  vi.stubGlobal('navigator', { vibrate: vi.fn() } as unknown as Navigator);
  /*
   * Il motore crea un `Audio` per la musica appena si attivano le impostazioni
   * (o si sblocca il contesto). In Node non esiste: lo sostituiamo con un finto
   * elemento, altrimenti ogni test che tocca la musica esplode.
   */
  vi.stubGlobal(
    'Audio',
    class {
      loop = false;
      preload = '';
      crossOrigin = '';
      volume = 1;
      src: string;
      paused = true;
      currentTime = 0;
      constructor(src = '') {
        this.src = src;
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
    },
  );
});

/** Importa il motore con il finto AudioContext già installato. */
async function makeEngine() {
  vi.resetModules();
  const { AudioEngine } = await import('./AudioEngine.js');
  const engine = new AudioEngine();
  engine.unlock();
  return engine;
}

/** Picco massimo fra quelli registrati dopo una certa chiamata. */
function loudest(items: number[]): number {
  return items.length === 0 ? 0 : Math.max(...items);
}

describe('AudioEngine — volume delle esultanze', () => {
  it('la propria parola suona a volume pieno, quella dell\'avversario più bassa', async () => {
    const engine = await makeEngine();

    peaks = [];
    engine.playWordFound(5);
    const own = loudest(peaks);

    peaks = [];
    engine.playOpponentWord(5);
    const opponent = loudest(peaks);

    expect(own).toBeGreaterThan(0);
    expect(opponent).toBeGreaterThan(0);
    /*
     * L'avversario si sente, ma più piano.
     *
     * Il rapporto era 0.35 ma era TROPPO basso: il picco scendeva a ~0.066 e,
     * moltiplicato per il volume degli effetti (~0.6), diventava ~0.04 —
     * impercettibile su un telefono. A 0.7 resta distinto ma udibile.
     */
    expect(opponent).toBeLessThan(own);
    expect(opponent / own).toBeCloseTo(0.7, 2);
    // Verifica che il volume assoluto sia udibile, non solo "più basso".
    expect(opponent).toBeGreaterThan(0.08);
  });

  it('la differenza vale per tutte le lunghezze di parola', async () => {
    const engine = await makeEngine();
    for (const len of [3, 4, 5, 6, 7, 9]) {
      peaks = [];
      engine.playWordFound(len);
      const own = loudest(peaks);
      peaks = [];
      engine.playOpponentWord(len);
      const opponent = loudest(peaks);
      expect(opponent).toBeLessThan(own);
    }
  });

  it('non vibra per le parole degli avversari (solo per le proprie)', async () => {
    const engine = await makeEngine();
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate } as unknown as Navigator);

    engine.playOpponentWord(4);
    expect(vibrate).not.toHaveBeenCalled();

    engine.playWordFound(4);
    expect(vibrate).toHaveBeenCalled();
  });

  it('con gli effetti disattivati non suona nulla, nemmeno per gli avversari', async () => {
    const engine = await makeEngine();
    engine.setSettings({ sfxEnabled: false });
    peaks = [];
    engine.playOpponentWord(5);
    engine.playWordFound(5);
    expect(peaks).toHaveLength(0);
  });
});
