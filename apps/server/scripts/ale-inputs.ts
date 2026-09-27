/**
 * Ingressi dell'algoritmo `ale`, caricati una volta sola.
 *
 * Il caricamento vero vive in `src/ale.ts`, perché serve anche al SERVER (la
 * generazione dall'admin). Qui lo ri-esportiamo con i nomi e i percorsi usati
 * dagli script, così esistono una sola implementazione e un solo punto da
 * correggere: se il server e lo script caricassero per conto proprio, il
 * catalogo generato a mano e quello generato dal pannello potrebbero divergere.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALE_DIR,
  CALIB_PATH,
  DICT_DIR,
  MORPH_PATH,
  NVDB_PATH,
  ROOT,
  getAleInputs,
  loadAleInputs,
  readLines,
  type AleInputs,
} from '../src/ale.js';

export { ALE_DIR, CALIB_PATH, DICT_DIR, MORPH_PATH, NVDB_PATH, ROOT, getAleInputs, loadAleInputs, readLines };
export type { AleInputs };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Cartella del catalogo di base (qui scrivono `gen-schede` e `gen-schede-ale`). */
export const OUT_DIR = path.join(ROOT, 'packages/shared/schede');
