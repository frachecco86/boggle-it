/**
 * Variante delle schede in vigore (`schedaVariantFor`).
 *
 * REGRESSIONE: lo store aveva una copia locale della regola rimasta ferma a
 * "le ale esistono solo su 5×5". Con l'admin impostato su `ale`, una partita
 * 4×4 o 6×6 ricadeva su `standard`: il foglio "Impostazioni partita" mostrava
 * "Standard" e si giocavano le schede sbagliate, mentre il server (che usa la
 * funzione condivisa) serviva correttamente le Ale su ogni griglia.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Lo store è creato con il middleware `persist`, che tocca `localStorage` già
 * all'import. I test del web girano in ambiente Node (nessun jsdom nel repo),
 * quindi si fornisce uno stub minimo PRIMA di importare il modulo.
 */
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const { useAppStore } = await import('./store.js');

/** Imposta la configurazione globale come farebbe `refreshAppConfig`. */
function setAdminVariant(variant: 'standard' | 'full' | 'ale'): void {
  useAppStore.setState({ appConfig: { defaultSchedaVariant: variant } });
}

describe('schedaVariantFor', () => {
  beforeEach(() => setAdminVariant('standard'));

  it('con admin su `ale` la variante vale su TUTTE le griglie', () => {
    setAdminVariant('ale');
    for (const size of [4, 5, 6] as const) {
      expect(useAppStore.getState().schedaVariantFor(size)).toBe('ale');
    }
  });

  it('non declassa a `standard` fuori dal 5×5 (regressione)', () => {
    // Il difetto: 4×4 e 6×6 tornavano `standard`.
    setAdminVariant('ale');
    expect(useAppStore.getState().schedaVariantFor(4)).not.toBe('standard');
    expect(useAppStore.getState().schedaVariantFor(6)).not.toBe('standard');
  });

  it('con admin su `full` la variante vale su tutte le griglie', () => {
    setAdminVariant('full');
    for (const size of [4, 5, 6] as const) {
      expect(useAppStore.getState().schedaVariantFor(size)).toBe('full');
    }
  });

  it('con admin su `standard` resta standard ovunque', () => {
    for (const size of [4, 5, 6] as const) {
      expect(useAppStore.getState().schedaVariantFor(size)).toBe('standard');
    }
  });
});
