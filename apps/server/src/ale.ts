/**
 * Algoritmo "ale" a RUNTIME: genera schede su richiesta dell'admin.
 *
 * Fino a ieri le schede "ale" si producevano solo offline con
 * `pnpm gen:schede:ale`: richiedono la calibrazione e il vocabolario NVdB, che
 * l'immagine Docker non includeva del tutto. Ora la pipeline completa (pulizia
 * del dizionario, frequenza dei token, `Common`, radici da Morph-it, trie,
 * calibrazione e cicli di reiezione) è disponibile anche nel server, così
 * l'admin può generarne dal pannello.
 *
 * PERCHÉ tenere qui la logica condivisa: lo script offline e il server devono
 * usare gli STESSI ingressi, altrimenti il catalogo generato a mano e quello
 * generato dal pannello divergono. `scripts/ale-inputs.ts` ri-esporta questo
 * modulo, quindi l'implementazione è una sola.
 *
 * MEMORIA: il picco è alto (trie 16 lettere + radici). Il runtime si carica
 * PIGRAMENTE e si può liberare (`releaseAleRuntime`): l'endpoint lo rilascia
 * dopo la generazione, così la memoria non resta occupata a tempo indefinito.
 */
import { existsSync, readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALE_CALIBRATION_RHO,
  ALE_DIFFICULTY_WEIGHTS,
  buildAleCommon,
  buildAleLemmas,
  buildTrie,
  calibrateAle,
  cleanAleWord,
  computeAleFrequency,
  DEFAULT_ALE_GUARD_RAILS,
  generateAleScheda,
  sampleAleBoards,
  type AleCalibration,
  type AleFrequency,
  type Difficulty,
  type GridSize,
  type Scheda,
  type TrieNode,
} from '@boggle/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Radice del repository (questo file sta in `apps/server/src/`). */
export const ROOT = path.resolve(__dirname, '../../..');
export const DICT_DIR = path.join(ROOT, 'packages/dictionary/data');
export const ALE_DIR = path.join(DICT_DIR, 'ale');
export const NVDB_PATH = path.join(ALE_DIR, 'nvdb.words.txt');
export const CALIB_PATH = path.join(ALE_DIR, 'calibration.json');
/**
 * Radici (forma → lemma) per l'algoritmo ale, GIA' FILTRATE sui lemmi comuni.
 *
 * Perché questo file (172 KB, versionato) e non Morph-it (19 MB, gitignored):
 * per stabilire se una forma è comune basta sapere quale lemma ha, e il lemma
 * conta solo se è in `Common`. Tenere solo quelle coppie riduce il file di due
 * ordini di grandezza e permette la generazione ale sia in locale sia nel
 * container. Si rigenera con `node scripts/build-ale-lemmas.mjs`.
 */
export const ALE_LEMMAS_PATH = path.join(ALE_DIR, 'lemmas.br');
/** Morph-it: fonte grezza delle radici. Serve solo a rigenerare `lemmas.br`. */
export const MORPH_PATH = path.join(DICT_DIR, 'morph-it_048.txt');

export interface AleInputs {
  rawCount: number;
  dictPrime: string[];
  dictSet: Set<string>;
  freq: AleFrequency;
  nvdbCount: number;
  common: Set<string>;
  lemmas: Map<string, string>;
  trie: TrieNode;
}

export function readLines(file: string): string[] {
  if (!existsSync(file)) throw new Error(`Manca ${file}`);
  return readFileSync(file, 'utf8').split('\n');
}

/**
 * Carica e prepara tutti gli ingressi dell'algoritmo. Costoso (secondi): chi
 * chiama dovrebbe usare `getAleRuntime()`, che lo fa una volta sola.
 */
export function loadAleInputs({ log = true }: { log?: boolean } = {}): AleInputs {
  const say = (msg: string) => {
    if (log) console.log(msg);
  };

  say('ale: carico il dizionario e lo pulisco (Dict → Dict’)…');
  const rawDict = readLines(path.join(DICT_DIR, 'words.txt'));
  const dictPrime: string[] = [];
  const dictSet = new Set<string>();
  for (const raw of rawDict) {
    const w = cleanAleWord(raw);
    if (!w || dictSet.has(w)) continue;
    dictSet.add(w);
    dictPrime.push(w);
  }
  say(`ale: Dict ${rawDict.length.toLocaleString('it-IT')} → Dict' ${dictPrime.length.toLocaleString('it-IT')}`);

  const freq = computeAleFrequency(dictPrime);

  say('ale: costruisco `Common` (NVdB ∩ Dict’)…');
  const nvdb = readLines(NVDB_PATH);
  const common = buildAleCommon(nvdb, dictSet);
  say(
    `ale: Common ${common.size.toLocaleString('it-IT')} ` +
      `(${((common.size / dictPrime.length) * 100).toFixed(1)}% di Dict')`,
  );

  /*
   * Radici (forma → lemma): NVdB contiene i LEMMI, non tutte le forme flesse.
   * Senza, una forma comune come `amo` risulterebbe rara e la difficoltà della
   * griglia sarebbe gonfiata dalla morfologia.
   *
   * Si usa `lemmas.br` (versionato, già filtrato sui lemmi comuni). Solo se
   * manca — sviluppo, prima di generarlo — si ricade su Morph-it, che è più
   * lento e pesante.
   */
  say('ale: carico le radici (forma → lemma)…');
  const lemmas = loadAleLemmas(common);
  say(`ale: forme flesse con lemma comune: ${lemmas.size.toLocaleString('it-IT')}`);

  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });

  return { rawCount: rawDict.length, dictPrime, dictSet, freq, nvdbCount: nvdb.length, common, lemmas, trie };
}

/**
 * Radici forma → lemma.
 *
 * Preferisce `lemmas.br` (già filtrato sui lemmi comuni: il chiamante passa
 * `common` solo per il fallback da Morph-it). Se il file versionato manca, e c'è
 * Morph-it, lo costruisce al volo: così in sviluppo la pipeline funziona anche
 * prima di generare `lemmas.br`.
 */
export function loadAleLemmas(common: Set<string>): Map<string, string> {
  if (existsSync(ALE_LEMMAS_PATH)) {
    const text = brotliDecompressSync(readFileSync(ALE_LEMMAS_PATH)).toString('utf8');
    const lemmas = new Map<string, string>();
    for (const line of text.split('\n')) {
      if (!line) continue;
      const tab = line.indexOf('\t');
      if (tab <= 0) continue;
      lemmas.set(line.slice(0, tab), line.slice(tab + 1));
    }
    return lemmas;
  }

  if (!existsSync(MORPH_PATH)) {
    throw new Error(
      `Manca ${ALE_LEMMAS_PATH} (radici forma → lemma per l'algoritmo ale).\n` +
        'Rigeneralo con: node packages/dictionary/scripts/build-ale-lemmas.mjs',
    );
  }
  // Fallback: Morph-it in ISO-8859-1, filtrato sui lemmi comuni.
  const morphRaw = new TextDecoder('latin1').decode(readFileSync(MORPH_PATH));
  const all = buildAleLemmas(morphRaw);
  const filtered = new Map<string, string>();
  for (const [form, lemma] of all) if (common.has(lemma)) filtered.set(form, lemma);
  return filtered;
}

let cached: Promise<AleInputs> | null = null;

/** Ingressi dell'algoritmo, caricati una volta sola e riusati. */
export function getAleInputs(): Promise<AleInputs> {
  if (!cached) {
    cached = Promise.resolve().then(() => loadAleInputs());
  }
  return cached;
}

/** Libera gli ingressi (trie e radici): la memoria torna disponibile. */
export function releaseAleInputs(): void {
  cached = null;
}

/**
 * La calibrazione committata per una dimensione, se presente e coerente.
 *
 * Deve essere stata prodotta con gli STESSI guard rails della produzione:
 * cambiandoli, la calibrazione non vale più (lo dice la spec dell'algoritmo).
 * Se manca o non è coerente si ricalcola al momento (poche centinaia di ms).
 */
function committedCalibration(size: GridSize): AleCalibration | null {
  if (!existsSync(CALIB_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(CALIB_PATH, 'utf8')) as {
      bySize?: Record<string, AleCalibration>;
    };
    const calibration = parsed.bySize?.[String(size)];
    if (!calibration) return null;
    const rails = calibration.provenance?.guardRails;
    if (JSON.stringify(rails) !== JSON.stringify(DEFAULT_ALE_GUARD_RAILS)) return null;
    // Anche i pesi della difficoltà invalidano la calibrazione (cambiano i confini delle fasce).
    const weights = calibration.provenance?.weights;
    if (JSON.stringify(weights) !== JSON.stringify(ALE_DIFFICULTY_WEIGHTS)) return null;
    // E anche rho: restringe l'intervallo di parole, quindi cambia la produzione.
    if (calibration.provenance?.rho !== ALE_CALIBRATION_RHO) return null;
    return calibration;
  } catch {
    return null;
  }
}

const calibrationCache = new Map<GridSize, AleCalibration>();

/** Calibrazione valida per la dimensione: committata se possibile, altrimenti calcolata. */
export function calibrationFor(size: GridSize, inputs: AleInputs, samples = 500, seed = 1): AleCalibration {
  const cachedCalibration = calibrationCache.get(size);
  if (cachedCalibration) return cachedCalibration;

  const committed = committedCalibration(size);
  if (committed) {
    calibrationCache.set(size, committed);
    return committed;
  }

  const stats = sampleAleBoards(size, inputs.freq, inputs.trie, inputs.common, samples, seed, DEFAULT_ALE_GUARD_RAILS, inputs.lemmas);
  const calibration = calibrateAle(stats, {
    guardRails: DEFAULT_ALE_GUARD_RAILS,
    dictSize: inputs.dictPrime.length,
    commonSize: inputs.common.size,
    rho: ALE_CALIBRATION_RHO,
  });
  calibrationCache.set(size, calibration);
  return calibration;
}

export interface AleGenerateOptions {
  size: GridSize;
  difficulty: Difficulty;
  count: number;
  /** Numero del primo id (le schede prendono `idStart`, `idStart+1`, …). */
  startIndex: number;
  /** Seme master; il seme di una scheda è `seed * 1_000_003 + 7919 + i * 104_729`. */
  seed?: number;
  inputs?: AleInputs;
}

/** Genera un lotto di schede "ale" per una fascia, con id che continuano la numerazione. */
export function generateAleBatch(options: AleGenerateOptions): Scheda[] {
  const inputs = options.inputs ?? null;
  if (!inputs) throw new Error('generateAleBatch richiede gli ingressi (usa getAleInputs())');
  const { size, difficulty, count, startIndex, seed = 1 } = options;
  const calibration = calibrationFor(size, inputs);
  const idPrefix = `${size}-${difficulty}`;

  const out: Scheda[] = [];
  for (let i = 0; i < count; i++) {
    const boardSeed = seed * 1_000_003 + 7919 + i * 104_729;
    out.push(
      generateAleScheda({
        size,
        difficulty,
        freq: inputs.freq,
        trie: inputs.trie,
        common: inputs.common,
        lemmas: inputs.lemmas,
        calibration,
        seed: boardSeed,
        idPrefix,
        idStart: startIndex,
        idIndex: i,
        maxAttempts: 500,
      }),
    );
  }
  return out;
}
