/**
 * Catalogo delle schede: caricamento, ricerca e persistenza.
 *
 * Le schede base stanno in `packages/shared/schede/` (versionate, generate con
 * `pnpm gen:schede`). L'admin può aggiungerne altre, che vengono salvate in
 * `schede-extra/` (default `packages/shared/schede-extra`, sovrascrivibile con
 * `SCHEDE_EXTRA_DIR`): così un deploy non le cancella e restano separabili da
 * quelle di base.
 *
 * Il catalogo è tenuto in memoria: sono ~1.4 MB di JSON, trascurabili, e così le
 * richieste (anche /schede/random) sono O(1).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  schedaFileName,
  schedaKey,
  SCHEDA_FORMAT_VERSION,
  type Difficulty,
  type GridSize,
  type Scheda,
  type SchedaFile,
} from '@boggle/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BASE_SCHEDE_DIR = process.env.SCHEDE_DIR
  ? path.resolve(process.env.SCHEDE_DIR)
  : path.resolve(__dirname, '../../../packages/shared/schede');

export const EXTRA_SCHEDE_DIR = process.env.SCHEDE_EXTRA_DIR
  ? path.resolve(process.env.SCHEDE_EXTRA_DIR)
  : path.resolve(__dirname, '../../../packages/shared/schede-extra');

/** Metadati di una scheda, senza l'elenco completo delle parole. */
export interface SchedaMeta {
  id: string;
  size: GridSize;
  difficulty: Difficulty;
  grid: string;
  longest: number;
  wordCount: number;
}

export function toMeta(scheda: Scheda): SchedaMeta {
  return {
    id: scheda.id,
    size: scheda.size,
    difficulty: scheda.difficulty,
    grid: scheda.grid,
    longest: scheda.longest,
    wordCount: scheda.words.length,
  };
}

export class SchedaCatalog {
  private readonly byId = new Map<string, Scheda>();
  private readonly byKey = new Map<string, Scheda[]>();

  /** Carica schede base + extra. */
  static load(): SchedaCatalog {
    const catalog = new SchedaCatalog();
    const base = catalog.loadDir(BASE_SCHEDE_DIR);
    const extra = catalog.loadDir(EXTRA_SCHEDE_DIR);
    console.log(
      `✓ Schede caricate: ${catalog.size} (base ${base}, extra ${extra}) da ${BASE_SCHEDE_DIR}`,
    );
    return catalog;
  }

  private loadDir(dir: string): number {
    if (!existsSync(dir)) return 0;
    let loaded = 0;
    for (const file of readdirSync(dir)) {
      if (!/^schede-.*\.json$/.test(file)) continue;
      try {
        const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as SchedaFile;
        for (const scheda of parsed.schede ?? []) {
          if (!scheda?.id || !scheda.grid || !Array.isArray(scheda.words)) continue;
          this.add(scheda);
          loaded++;
        }
      } catch (err) {
        console.warn(`⚠ Scheda illeggibile ${file}: ${String(err)}`);
      }
    }
    return loaded;
  }

  get size(): number {
    return this.byId.size;
  }

  /** Aggiunge una scheda in memoria (sovrascrive un id esistente). */
  add(scheda: Scheda): void {
    const key = schedaKey(scheda.size, scheda.difficulty);
    const list = this.byKey.get(key) ?? [];
    const idx = list.findIndex((s) => s.id === scheda.id);
    if (idx >= 0) list[idx] = scheda;
    else list.push(scheda);
    this.byKey.set(key, list);
    this.byId.set(scheda.id, scheda);
  }

  get(id: string): Scheda | undefined {
    return this.byId.get(id);
  }

  list(size?: GridSize, difficulty?: Difficulty): Scheda[] {
    if (size && difficulty) return [...(this.byKey.get(schedaKey(size, difficulty)) ?? [])];
    return [...this.byId.values()];
  }

  countByKey(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, list] of this.byKey) out[key] = list.length;
    return out;
  }

  /** Scheda casuale per dimensione/difficoltà, o `undefined` se il gruppo è vuoto. */
  random(size: GridSize, difficulty: Difficulty, rng: () => number = Math.random): Scheda | undefined {
    const list = this.byKey.get(schedaKey(size, difficulty));
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(rng() * list.length)];
  }

  /**
   * Persiste una scheda nuova nella cartella extra, aggiornando il file del suo
   * gruppo (creandolo se manca). Ritorna il file scritto.
   */
  persist(scheda: Scheda): string {
    mkdirSync(EXTRA_SCHEDE_DIR, { recursive: true });
    const file = path.join(EXTRA_SCHEDE_DIR, schedaFileName(scheda.size, scheda.difficulty));
    const existing: SchedaFile = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as SchedaFile)
      : {
          version: SCHEDA_FORMAT_VERSION,
          generatedAt: new Date().toISOString(),
          size: scheda.size,
          difficulty: scheda.difficulty,
          schede: [],
        };
    const idx = existing.schede.findIndex((s) => s.id === scheda.id);
    if (idx >= 0) existing.schede[idx] = scheda;
    else existing.schede.push(scheda);
    existing.generatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(existing, null, 2) + '\n');
    return file;
  }
}
