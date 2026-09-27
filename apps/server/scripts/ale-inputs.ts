/**
 * Ingressi dell'algoritmo `ale`, caricati una volta sola.
 *
 * Perché un modulo a parte: servono sia a `gen-schede-ale.ts` (che genera il
 * catalogo) sia a `report-ale.ts` (che misura calibrazione e generazione). Se i
 * due caricassero per conto proprio, il report potrebbe misurare qualcosa di
 * leggermente diverso da ciò che viene generato — ed è esattamente il tipo di
 * divergenza che un report deve escludere.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAleCommon,
  buildAleLemmas,
  buildTrie,
  cleanAleWord,
  computeAleFrequency,
  type AleFrequency,
  type TrieNode,
} from '@boggle/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Radice del repository (questo file sta in `apps/server/scripts/`). */
export const ROOT = path.resolve(__dirname, '../../..');
export const DICT_DIR = path.join(ROOT, 'packages/dictionary/data');
export const ALE_DIR = path.join(DICT_DIR, 'ale');
export const NVDB_PATH = path.join(ALE_DIR, 'nvdb.words.txt');
export const CALIB_PATH = path.join(ALE_DIR, 'calibration.json');
export const OUT_DIR = path.join(ROOT, 'packages/shared/schede');
/** Morph-it: forme flesse → lemma (radici). È in ISO-8859-1. */
export const MORPH_PATH = path.join(DICT_DIR, 'morph-it_048.txt');

export interface AleInputs {
  /** Voci lette da `words.txt` (prima della pulizia). */
  rawCount: number;
  /** `Dict'`: parole pulite e uniche. */
  dictPrime: string[];
  dictSet: Set<string>;
  freq: AleFrequency;
  /** Voci di NVdB lette. */
  nvdbCount: number;
  /** `Common` = NVdB ∩ `Dict'`. */
  common: Set<string>;
  /** Forma → lemma (da Morph-it). */
  lemmas: Map<string, string>;
  /** Trie del solver su `Dict'`. */
  trie: TrieNode;
}

export function readLines(file: string): string[] {
  if (!existsSync(file)) throw new Error(`Manca ${file}`);
  return readFileSync(file, 'utf8').split('\n');
}

/**
 * Carica e prepara tutto: `Dict → Dict'`, frequenza dei token, `Common`, radici,
 * trie. `log` stampa i passi (utile negli script, silenzioso nei test).
 */
export function loadAleInputs({ log = true }: { log?: boolean } = {}): AleInputs {
  const say = (msg: string) => {
    if (log) console.log(msg);
  };

  say('Carico il dizionario e lo pulisco (Dict → Dict’)…');
  const rawDict = readLines(path.join(DICT_DIR, 'words.txt'));
  const dictPrime: string[] = [];
  const dictSet = new Set<string>();
  for (const raw of rawDict) {
    const w = cleanAleWord(raw);
    if (!w || dictSet.has(w)) continue;
    dictSet.add(w);
    dictPrime.push(w);
  }
  say(`  Dict  ${rawDict.length.toLocaleString('it-IT')} voci → Dict' ${dictPrime.length.toLocaleString('it-IT')}`);

  say('Calcolo la frequenza dei token…');
  const freq = computeAleFrequency(dictPrime);
  say(`  top token: ${freq.ordered.slice(0, 8).map((t) => `${t.token}:${(t.freq * 100).toFixed(1)}%`).join(' ')}`);

  say('Costruisco `Common` (NVdB ∩ Dict’)…');
  const nvdb = readLines(NVDB_PATH);
  const common = buildAleCommon(nvdb, dictSet);
  say(
    `  NVdB ${nvdb.length.toLocaleString('it-IT')} → Common ${common.size.toLocaleString('it-IT')} (` +
      `${((common.size / dictPrime.length) * 100).toFixed(1)}% di Dict')`,
  );

  /*
   * Radici (forma → lemma) da Morph-it: NVdB contiene i LEMMI (`amare`), non
   * tutte le forme flesse. Senza la radice `amo` risulterebbe "rara". Morph-it è
   * in ISO-8859-1: si decodifica esplicitamente (come fa `build-words.mjs`).
   */
  say('Costruisco le radici (forma → lemma) da Morph-it…');
  if (!existsSync(MORPH_PATH)) {
    throw new Error(
      `Manca ${MORPH_PATH}: serve per le radici (le forme flesse contate come comuni).\n` +
        'Non è nell’immagine Docker (è gitignored per dimensione): la rigenerazione delle schede ale si fa in locale.',
    );
  }
  const morphRaw = new TextDecoder('latin1').decode(readFileSync(MORPH_PATH));
  const lemmas = buildAleLemmas(morphRaw);
  say(`  coppie forma→lemma: ${lemmas.size.toLocaleString('it-IT')}`);

  say('Costruisco il trie del solver (Dict’)…');
  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });

  return { rawCount: rawDict.length, dictPrime, dictSet, freq, nvdbCount: nvdb.length, common, lemmas, trie };
}
