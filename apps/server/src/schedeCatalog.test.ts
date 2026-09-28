import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SCHEDA_FORMAT_VERSION, type Scheda } from '@boggle/shared';
import { SchedaCatalog } from './schede.js';

/** Crea una scheda minima valida per il catalogo. */
function scheda(id: string, variant: 'standard' | 'full' | 'ale'): Scheda {
  return {
    id,
    size: 4,
    difficulty: 'facile',
    variant,
    grid: 'casa\ncasa\ncasa\ncasa',
    words: ['casa'],
    allWords: ['casa'],
    longest: 4,
  };
}

function writeGroup(dir: string, name: string, schede: Scheda[]): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, name),
    JSON.stringify({ version: SCHEDA_FORMAT_VERSION, generatedAt: '', size: 4, difficulty: 'facile', schede }),
  );
}

/**
 * La cancellazione è irreversibile: questi test bloccano le due invarianti che
 * contano — l'indice in memoria deve restare coerente col disco, e i file non
 * devono restare vuoti (un file vuoto fa sembrare il catalogo più grande).
 */
describe('SchedaCatalog: cancellazione', () => {
  it('rimuove dal disco e dalla memoria, tenendo il file se resta qualcosa', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'schede-'));
    try {
      const extra = path.join(dir, 'extra');
      writeGroup(extra, 'schede-4-facile.json', [scheda('a', 'standard'), scheda('b', 'ale')]);
      const catalog = new SchedaCatalog();
      catalog.add(scheda('a', 'standard'));
      catalog.add(scheda('b', 'ale'));

      const result = catalog.removeWhere((s) => s.variant === 'ale', [extra]);
      expect(result.removed).toBe(1);
      expect(catalog.get('b')).toBeUndefined();
      expect(catalog.get('a')).toBeDefined();

      // Il gruppo non è vuoto: il file resta, con la sola scheda tenuta.
      expect(readdirSync(extra)).toEqual(['schede-4-facile.json']);
      const parsed = JSON.parse(readFileSync(path.join(extra, 'schede-4-facile.json'), 'utf8')) as {
        schede: Scheda[];
      };
      expect(parsed.schede.map((s) => s.id)).toEqual(['a']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('elimina il file quando il gruppo resta vuoto', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'schede-'));
    try {
      const extra = path.join(dir, 'extra');
      writeGroup(extra, 'schede-4-facile.json', [scheda('a', 'standard')]);
      const catalog = new SchedaCatalog();
      catalog.add(scheda('a', 'standard'));

      catalog.removeWhere(() => true, [extra]);
      expect(readdirSync(extra)).toEqual([]);
      expect(catalog.size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('non tocca i file che non contengono schede da cancellare', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'schede-'));
    try {
      const extra = path.join(dir, 'extra');
      writeGroup(extra, 'schede-4-facile.json', [scheda('a', 'standard')]);
      const catalog = new SchedaCatalog();
      catalog.add(scheda('a', 'standard'));

      const before = readFileSync(path.join(extra, 'schede-4-facile.json'), 'utf8');
      const result = catalog.removeWhere((s) => s.variant === 'ale', [extra]);
      expect(result.removed).toBe(0);
      expect(readFileSync(path.join(extra, 'schede-4-facile.json'), 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/*
 * `randomUnplayed` è il fix del bug "nel multiplayer viene mostrata la stessa
 * scheda due volte nella stessa partita": i pool sono piccoli (10-15 schede per
 * griglia/difficoltà/variante), quindi una scelta puramente casuale ripeteva la
 * stessa scheda nel 17-28% delle partite da 3 round.
 */
describe('SchedaCatalog: scelta senza ripetizioni', () => {
  function catalogWith(ids: string[]): SchedaCatalog {
    const catalog = new SchedaCatalog();
    for (const id of ids) catalog.add(scheda(id, 'standard'));
    return catalog;
  }

  it('non ripesca una scheda già giocata', () => {
    const catalog = catalogWith(['a', 'b', 'c']);
    const exclude = new Set(['a', 'b']);
    // Con un solo id disponibile, qualunque valore di `rng` deve darlo.
    for (const r of [0, 0.4, 0.99]) {
      expect(catalog.randomUnplayed(4, 'facile', () => r, 'standard', exclude)?.id).toBe('c');
    }
  });

  it('senza esclusioni si comporta come `random`', () => {
    const catalog = catalogWith(['a', 'b', 'c']);
    expect(catalog.randomUnplayed(4, 'facile', () => 0, 'standard', new Set())?.id).toBe('a');
  });

  it('quando TUTTE sono state giocate riparte da capo, non si blocca', () => {
    const catalog = catalogWith(['a', 'b']);
    const exclude = new Set(['a', 'b']);
    const picked = catalog.randomUnplayed(4, 'facile', () => 0, 'standard', exclude);
    expect(picked).toBeDefined();
    expect(['a', 'b']).toContain(picked!.id);
  });

  it('rispetta la variante come `random`', () => {
    const catalog = new SchedaCatalog();
    catalog.add(scheda('std', 'standard'));
    catalog.add(scheda('ale-1', 'ale'));
    expect(catalog.randomUnplayed(4, 'facile', () => 0, 'ale', new Set())?.id).toBe('ale-1');
  });

  it('su un gruppo inesistente ritorna undefined', () => {
    const catalog = catalogWith(['a']);
    expect(catalog.randomUnplayed(6, 'difficile', () => 0, 'standard', new Set())).toBeUndefined();
  });
});
