import { describe, expect, it } from 'vitest';
import { PHOTO_FILTERS } from './photoFilters.js';

/**
 * I filtri lavorano su canvas del browser: qui verifichiamo la parte pura
 * (catalogo e helper), perché il rendering richiede un DOM reale.
 * La verifica visiva dei filtri è coperta dalla prova manuale documentata.
 */
describe('filtri foto', () => {
  it('espone un catalogo coerente e senza duplicati', () => {
    const ids = PHOTO_FILTERS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('originale');
    expect(ids).toContain('cartoon');
    for (const filter of PHOTO_FILTERS) {
      expect(filter.label.length).toBeGreaterThan(0);
      expect(filter.hint.length).toBeGreaterThan(0);
    }
  });
});
