import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppConfigStore, DEFAULT_APP_CONFIG } from './appConfig.js';

/**
 * La configurazione globale deve sopravvivere ai riavvii (è una scelta di
 * prodotto, non una preferenza del browser) e deve essere tollerante a un file
 * mancante o corrotto: un errore qui impedirebbe di avviare il server.
 */
describe('AppConfigStore', () => {
  it('parte dai default se il file non esiste', () => {
    const store = new AppConfigStore(path.join(mkdtempSync(path.join(tmpdir(), 'cfg-')), 'app-config.json'));
    expect(store.get()).toEqual(DEFAULT_APP_CONFIG);
  });

  it('persiste la variante e la rilegge dopo un riavvio', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cfg-'));
    const file = path.join(dir, 'app-config.json');
    try {
      const store = new AppConfigStore(file);
      store.setDefaultSchedaVariant('ale');
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ defaultSchedaVariant: 'ale' });

      const reopened = new AppConfigStore(file);
      expect(reopened.get().defaultSchedaVariant).toBe('ale');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizza un valore invalido su standard', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cfg-'));
    const file = path.join(dir, 'app-config.json');
    try {
      writeFileSync(file, JSON.stringify({ defaultSchedaVariant: 'boh' }));
      expect(new AppConfigStore(file).get().defaultSchedaVariant).toBe('standard');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('non esplode con un file corrotto', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cfg-'));
    const file = path.join(dir, 'app-config.json');
    try {
      writeFileSync(file, '{ questo non è json');
      expect(new AppConfigStore(file).get()).toEqual(DEFAULT_APP_CONFIG);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
