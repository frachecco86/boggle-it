import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { DATA_DIR, EXTRA_SCHEDE_DIR } from './schede.js';

/**
 * Il volume dei dati persistenti è UNO solo (Railway consente un volume per
 * servizio). Questi test bloccano la regressione: le schede generate dall'admin
 * devono stare DENTRO `DATA_DIR`, accanto al database dei profili.
 */
describe('layout dei dati persistenti', () => {
  it('le schede extra stanno dentro DATA_DIR', () => {
    const relative = path.relative(DATA_DIR, EXTRA_SCHEDE_DIR);
    expect(relative).toBe(path.join('', 'schede-extra'));
    // Non deve uscire dalla cartella dati (né essere un percorso assoluto).
    expect(relative.startsWith('..')).toBe(false);
    expect(path.isAbsolute(relative)).toBe(false);
  });

  it('il nome della cartella è stabile e riconoscibile', () => {
    expect(path.basename(EXTRA_SCHEDE_DIR)).toBe('schede-extra');
  });
});
