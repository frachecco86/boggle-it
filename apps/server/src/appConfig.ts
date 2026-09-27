/**
 * Configurazione globale dell'applicazione, decisa dall'admin.
 *
 * Vive su file (`DATA_DIR/app-config.json`, lo stesso volume dei profili e delle
 * schede) perché è una scelta di prodotto condivisa da TUTTI i giocatori, non una
 * preferenza del singolo: il tipo di scheda di default vale per il single player
 * e per le stanze, e il giocatore non può cambiarlo.
 *
 * PERCHÉ un file e non il database: sono due valori, letti a ogni partita e
 * scritti di rado. Un file JSON è leggibile a occhio durante il deploy e non
 * richiede migrazioni; la lettura è tollerante (un file corrotto o assente non
 * deve impedire di giocare: si riparte dai default).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveSchedaVariant, type AppConfig, type SchedaVariant } from '@boggle/shared';
import { DATA_DIR } from './schede.js';

/** Percorso del file di configurazione (sovrascrivibile via APP_CONFIG_FILE). */
export const APP_CONFIG_FILE = process.env.APP_CONFIG_FILE
  ? path.resolve(process.env.APP_CONFIG_FILE)
  : path.join(DATA_DIR, 'app-config.json');

/** Valori di partenza, usati quando il file non esiste o non è leggibile. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  defaultSchedaVariant: 'standard',
};

export class AppConfigStore {
  private config: AppConfig;
  private readonly file: string;

  constructor(file: string = APP_CONFIG_FILE) {
    this.file = file;
    this.config = this.load();
  }

  private load(): AppConfig {
    if (!existsSync(this.file)) return { ...DEFAULT_APP_CONFIG };
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<AppConfig>;
      return {
        // `resolveSchedaVariant` normalizza valori vecchi o errati su `standard`.
        defaultSchedaVariant: resolveSchedaVariant(raw.defaultSchedaVariant),
      };
    } catch (err) {
      console.warn(`⚠ Configurazione app illeggibile (${this.file}), uso i default:`, err);
      return { ...DEFAULT_APP_CONFIG };
    }
  }

  /** Configurazione corrente (copia: chi la riceve non può mutare lo store). */
  get(): AppConfig {
    return { ...this.config };
  }

  /** Scrive la configurazione su disco e la rende effettiva subito. */
  update(next: AppConfig): AppConfig {
    this.config = { defaultSchedaVariant: resolveSchedaVariant(next.defaultSchedaVariant) };
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.config, null, 2) + '\n');
    return this.get();
  }

  /** Scorciatoia per il solo default delle schede. */
  setDefaultSchedaVariant(variant: SchedaVariant): AppConfig {
    return this.update({ ...this.config, defaultSchedaVariant: variant });
  }
}
