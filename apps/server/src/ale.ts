/**
 * Algoritmo "ale" a RUNTIME: genera schede su richiesta dell'admin.
 *
 * Fino a ieri le schede "ale" si producevano solo offline con
 * `pnpm gen:schede:ale`: richiedono la calibrazione e gli ingressi pesanti, che
 * l'immagine Docker non includeva del tutto. Ora la pipeline completa (pulizia
 * del dizionario, frequenza dei token, anelli di frequenza da `frequency-it.txt`,
 * trie, calibrazione e flusso a tre secchi) è disponibile anche nel server, così
 * l'admin può generarne dal pannello.
 *
 * PERCHÉ tenere qui la logica condivisa: lo script offline e il server devono
 * usare gli STESSI ingressi, altrimenti il catalogo generato a mano e quello
 * generato dal pannello divergono. `scripts/ale-inputs.ts` ri-esporta questo
 * modulo, quindi l'implementazione è una sola.
 *
 * MEMORIA: il picco è alto (trie 16 lettere + anelli). Il runtime si carica
 * PIGRAMENTE e si può liberare (`releaseAleInputs`): l'endpoint lo rilascia
 * dopo la generazione, così la memoria non resta occupata a tempo indefinito.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALE_CALIBRATION_RHO,
  ALE_DIFFICULTY_WEIGHTS,
  ALE_RARITY_RINGS,
  buildTrie,
  calibrateAle,
  cleanAleWord,
  computeAleFrequency,
  DEFAULT_ALE_GUARD_RAILS,
  nextAleCandidate,
  sampleAleBoards,
  toAleScheda,
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
export const CALIB_PATH = path.join(ALE_DIR, 'calibration.json');
/** Lista di frequenza d'uso (OpenSubtitles 2018): fonte degli anelli. */
export const FREQUENCY_PATH = path.join(DICT_DIR, 'frequency-it.txt');

export interface AleInputs {
  rawCount: number;
  dictPrime: string[];
  dictSet: Set<string>;
  freq: AleFrequency;
  /** Anelli di frequenza: `easy` = top-5000, `medium` = top-20000 (include easy). */
  rings: { easy: Set<string>; medium: Set<string> };
  trie: TrieNode;
}

export function readLines(file: string): string[] {
  if (!existsSync(file)) throw new Error(`Manca ${file}`);
  return readFileSync(file, 'utf8').split('\n');
}

/**
 * Costruisce gli anelli di frequenza da `frequency-it.txt` (§1.1).
 *
 * Si leggono le righe in ordine di frequenza decrescente; ogni riga valida
 * (dopo `cleanAleWord`) occupa una posizione. Le prime 5000 voci valide formano
 * `easy`, le prime 20000 (annidate) formano `medium`.
 */
export function buildAleRings(lines: string[]): { easy: Set<string>; medium: Set<string> } {
  const easy = new Set<string>();
  const medium = new Set<string>();
  let valid = 0;
  for (const raw of lines) {
    const w = cleanAleWord(raw);
    if (!w) continue;
    valid++;
    if (valid <= ALE_RARITY_RINGS.easy) easy.add(w);
    if (valid <= ALE_RARITY_RINGS.medium) medium.add(w);
    if (valid >= ALE_RARITY_RINGS.medium) break;
  }
  return { easy, medium };
}

/**
 * Carica e prepara tutti gli ingressi dell'algoritmo. Costoso (secondi): chi
 * chiama dovrebbe usare `getAleInputs()`, che lo fa una volta sola.
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

  say('ale: carico gli anelli di frequenza (frequency-it.txt)…');
  const rings = buildAleRings(readLines(FREQUENCY_PATH));
  say(
    `ale: anelli di frequenza ${rings.easy.size.toLocaleString('it-IT')} / ` +
      `${rings.medium.size.toLocaleString('it-IT')} (da frequency-it.txt)`,
  );

  const trie = buildTrie(dictPrime, { maxLength: 16, minLength: 3 });

  return { rawCount: rawDict.length, dictPrime, dictSet, freq, rings, trie };
}

let cached: Promise<AleInputs> | null = null;

/** Ingressi dell'algoritmo, caricati una volta sola e riusati. */
export function getAleInputs(): Promise<AleInputs> {
  if (!cached) {
    cached = Promise.resolve().then(() => loadAleInputs());
  }
  return cached;
}

/** Libera gli ingressi (trie e anelli): la memoria torna disponibile. */
export function releaseAleInputs(): void {
  cached = null;
}

/**
 * La calibrazione committata per una dimensione, se presente e coerente.
 *
 * Deve essere stata prodotta con gli STESSI guard rails, gli stessi pesi, lo
 * stesso `rho` e la stessa metrica ad anelli della produzione: cambiandone uno,
 * la calibrazione non vale più (lo dice la spec dell'algoritmo). Se manca o non
 * è coerente si ricalcola al momento (poche centinaia di ms).
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
    // Metrica e anelli: la vecchia calibrazione (NVdB+lemmi) non è più valida.
    if (calibration.provenance?.metric !== 'rings-v1') return null;
    if (JSON.stringify(calibration.provenance?.rings) !== JSON.stringify(ALE_RARITY_RINGS)) return null;
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

  const stats = sampleAleBoards(size, inputs.freq, inputs.trie, inputs.rings, samples, seed, DEFAULT_ALE_GUARD_RAILS);
  const calibration = calibrateAle(stats, {
    guardRails: DEFAULT_ALE_GUARD_RAILS,
    dictSize: inputs.dictPrime.length,
    rings: ALE_RARITY_RINGS,
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
  /** Seme master del flusso (tentativi `seed + attempt`). */
  seed?: number;
  inputs?: AleInputs;
}

/**
 * Genera un lotto di schede "ale" per una fascia, con id che continuano la
 * numerazione. Implementata sopra il flusso a tre secchi (`nextAleCandidate`):
 * si pescano candidati finché non se ne raccolgono `count` della fascia
 * richiesta (le schede valide delle altre fasce si ignorano), con lo stesso
 * ripiego del catalogo applicato alla singola fascia.
 */
export function generateAleBatch(options: AleGenerateOptions): Scheda[] {
  const inputs = options.inputs ?? null;
  if (!inputs) throw new Error('generateAleBatch richiede gli ingressi (usa getAleInputs())');
  const { size, difficulty, count, startIndex, seed = 1 } = options;
  const calibration = calibrationFor(size, inputs);
  const maxAttempts = 500 * count;
  const out: Scheda[] = [];

  const take = (attempt: number): boolean => {
    const candidate = nextAleCandidate({
      size,
      freq: inputs.freq,
      trie: inputs.trie,
      rings: inputs.rings,
      calibration,
      seed,
      attempt,
    });
    if (candidate && candidate.difficulty === difficulty) {
      out.push(toAleScheda(size, difficulty, startIndex, out.length, candidate.grid, candidate.stats));
      return true;
    }
    return false;
  };

  let attempt = 0;
  while (out.length < count && attempt < maxAttempts) {
    take(attempt);
    attempt++;
  }

  // Ripiego: si ignora la banda della fascia (restano rails + range globale).
  if (out.length < count) {
    const relaxed: AleCalibration = {
      ...calibration,
      tiers: calibration.tiers.map((t) => ({ ...t, wordRange: { ...calibration.wordRange } })),
    };
    let extra = 0;
    while (out.length < count && extra < maxAttempts) {
      const candidate = nextAleCandidate({
        size,
        freq: inputs.freq,
        trie: inputs.trie,
        rings: inputs.rings,
        calibration: relaxed,
        seed,
        attempt: attempt + extra,
      });
      extra++;
      if (candidate && candidate.difficulty === difficulty) {
        out.push(toAleScheda(size, difficulty, startIndex, out.length, candidate.grid, candidate.stats));
      }
    }
  }

  return out;
}
