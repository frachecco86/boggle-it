/**
 * Algoritmo "ale" — implementazione della pipeline descritta nel documento
 * *algoritmo schede "ale"*.
 *
 * Differenze sostanziali rispetto a `standard`/`full` (vedi `schedaGen.ts`):
 *  - le lettere NON sono composte a mano: si CAMPIONANO dalla frequenza dei
 *    token nel dizionario (con reimmissione);
 *  - `qu` è un TOKEN unico: `quando` → [QU, A, N, D, O];
 *  - la difficoltà di una griglia è la **quota di parole trovate che NON stanno
 *    nel vocabolario comune** (`Common` = NVdB ∩ Dict'), non la composizione;
 *  - i limiti (intervallo di parole accettate e le 3 fasce) si derivano da una
 *    CALIBRAZIONE su un campione di griglie (Tukey + clustering a 3 livelli).
 *
 * Il modulo è puro e deterministico: dato lo stesso seme e la stessa
 * configurazione produce le stesse griglie. La generazione del catalogo avviene
 * offline (`apps/server/scripts/gen-schede.ts --variant ale`).
 *
 * Guard rails (opzionali nella spec, qui ATTIVI): banda vocali, al più una tra
 * H/Z/QU, nessuna riga o colonna di sole consonanti. Sono applicati sia in
 * calibrazione sia in produzione con gli stessi valori: cambiarli invalida la
 * calibrazione, come richiede la spec.
 */
import type { Difficulty } from './difficulty.js';
import { gridToRows, type Scheda } from './scheda.js';
import { solveGrid, type TrieNode } from './solver.js';
import type { Grid, GridSize, Tile } from './types.js';

/** Token dell'alfabeto "ale": 26 simboli, `QU` al posto della `Q`. */
export const ALE_TOKENS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'qu',
] as const;

/** Token che contano come vocale (l'U dentro QU è incluso, come da spec). */
const ALE_VOWEL_TOKENS = new Set(['a', 'e', 'i', 'o', 'u', 'qu']);

/** Token con tetto a 1 per griglia (guard rail della spec). */
const ALE_RARE_TOKENS = new Set(['h', 'z', 'qu']);

/** Lettere non italiane: la spec le ammette, questo progetto no. */
const ALE_FOREIGN_TOKENS = new Set(['j', 'k', 'w', 'x', 'y']);

/* ------------------------------------------------------------------ */
/* Pre-processing                                                      */
/* ------------------------------------------------------------------ */

/** Accenti → lettera base (come da spec §1.1). */
export function foldAccents(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[çć]/g, 'c')
    .replace(/ñ/g, 'n');
}

/**
 * Pulizia di una riga di dizionario (§1.1).
 *
 * Ritorna la forma pulita, oppure `null` se la voce va scartata:
 *  - contiene caratteri non `a-z` (trattini, apostrofi, spazi, cifre);
 *  - è più corta di `minLength` LETTERE (`qu` conta due lettere);
 *  - contiene una `q` non seguita da `u` (`iraq`, `soqquadro`).
 */
export function cleanAleWord(raw: string, minLength = 3): string | null {
  const s = foldAccents(raw.trim());
  if (!/^[a-z]+$/.test(s)) return null;
  if (/q(?!u)/.test(s)) return null;
  if (s.length < minLength) return null;
  return s;
}

/** Tokenizza una parola pulita: `qu` → token unico `QU` (§1.3). */
export function tokenizeAle(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i]!;
    if (ch === 'q' && word[i + 1] === 'u') {
      out.push('qu');
      i++;
    } else {
      out.push(ch);
    }
  }
  return out;
}

/** Faccia della griglia per un token (`qu` → `q`, reso come "Qu"). */
function tokenToLetter(token: string): string {
  return token === 'qu' ? 'q' : token;
}

/* ------------------------------------------------------------------ */
/* Frequenza dei token                                                 */
/* ------------------------------------------------------------------ */

export interface AleFrequency {
  /** Token → frazione di voci di `Dict'` che lo contengono (almeno una volta). */
  freq: Map<string, number>;
  /** Token ordinati per frequenza decrescente (per il campionamento). */
  ordered: { token: string; freq: number }[];
  /** Dimensione di `Dict'`. */
  dictSize: number;
}

/**
 * Calcola la frequenza dei token su `Dict'` (§3.1): per ogni token, la frazione
 * di voci che lo contengono almeno una volta. Accenti già piegati, `QU` è un
 * token unico.
 */
export function computeAleFrequency(dictPrime: string[]): AleFrequency {
  const counts = new Map<string, number>();
  for (const w of dictPrime) {
    for (const token of new Set(tokenizeAle(w))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  const dictSize = dictPrime.length;
  const freq = new Map<string, number>();
  for (const token of ALE_TOKENS) {
    freq.set(token, dictSize > 0 ? (counts.get(token) ?? 0) / dictSize : 0);
  }
  const ordered = [...freq.entries()]
    .map(([token, f]) => ({ token, freq: f }))
    .sort((a, b) => b.freq - a.freq);
  return { freq, ordered, dictSize };
}

/** Costruisce `Common` = NVdB ∩ Dict' (§3.2). */
export function buildAleCommon(nvdbWords: Iterable<string>, dictPrime: Set<string>): Set<string> {
  const common = new Set<string>();
  for (const raw of nvdbWords) {
    const w = cleanAleWord(raw);
    if (w && dictPrime.has(w)) common.add(w);
  }
  return common;
}

/**
 * Mappa forma → lemma (radice), dal file Morph-it (`forma<TAB>lemma<TAB>tag`).
 *
 * PERCHÉ SERVE: NVdB contiene i LEMMI (`amare`), non tutte le forme flesse
 * (`amo`, `amava`, `ameremo`). Senza la radice una forma comunissima come `amo`
 * risulterebbe "rara" solo perché il lemma non compare letteralmente. La
 * difficoltà di una griglia (quota di parole fuori dal comune) era quindi
 * gonfiata dalla morfologia, non dalla rarità reale.
 */
export function buildAleLemmas(morphItText: string): Map<string, string> {
  const lemmas = new Map<string, string>();
  for (const line of morphItText.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const form = cleanAleWord(parts[0] ?? '');
    const lemma = cleanAleWord(parts[1] ?? '');
    if (!form || !lemma || form === lemma) continue;
    // Prima analisi vince: è deterministica e sufficiente (una forma ha un lemma).
    if (!lemmas.has(form)) lemmas.set(form, lemma);
  }
  return lemmas;
}

/**
 * true se la parola è "comune": lo è lei stessa OPPURE la sua RADICE (lemma).
 * Es. `amo` → lemma `amare` ∈ Common → comune.
 */
export function isAleCommon(
  word: string,
  common: Set<string>,
  lemmas: Map<string, string> | undefined,
): boolean {
  if (common.has(word)) return true;
  const lemma = lemmas?.get(word);
  return lemma !== undefined && common.has(lemma);
}

/* ------------------------------------------------------------------ */
/* Guard rails e generazione griglia                                   */
/* ------------------------------------------------------------------ */

export interface AleGuardRails {
  /** Banda della quota di vocali (0–1). `null` = disattivato. */
  vowels: { min: number; max: number } | null;
  /** Al più 1 token per ciascuno di H/Z/QU. */
  rareCap: boolean;
  /** Nessuna riga o colonna di sole consonanti. */
  noDeadLines: boolean;
  /** Nessun token non italiano (J K W X Y): scelta del progetto, non della spec. */
  noForeign: boolean;
}

/** Guard rails ATTIVI, come concordato per il catalogo. */
export const DEFAULT_ALE_GUARD_RAILS: AleGuardRails = {
  vowels: { min: 0.38, max: 0.52 },
  rareCap: true,
  noDeadLines: true,
  noForeign: true,
};

/** PRNG deterministico (mulberry32): stesso seme → stessa sequenza. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Estrae `count` token da `freq` con reimmissione, pesati per frequenza. */
export function sampleTokens(freq: AleFrequency, count: number, rng: () => number): string[] {
  const cumulative: number[] = [];
  let total = 0;
  for (const { freq: f } of freq.ordered) {
    total += f;
    cumulative.push(total);
  }
  const tokens: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng() * total;
    // Ricerca lineare: 26 token, più che sufficiente.
    let idx = 0;
    while (idx < cumulative.length - 1 && r > cumulative[idx]!) idx++;
    tokens.push(freq.ordered[idx]!.token);
  }
  return tokens;
}

/** Verifica i guard rails su una lista di token (ordine riga per riga). */
export function guardRailIssues(tokens: string[], size: number, rails: AleGuardRails): string[] {
  const issues: string[] = [];
  const total = tokens.length;
  if (total !== size * size) return ['numero di token errato'];

  if (rails.vowels) {
    const vowels = tokens.filter((t) => ALE_VOWEL_TOKENS.has(t)).length;
    const ratio = vowels / total;
    if (ratio < rails.vowels.min || ratio > rails.vowels.max) {
      issues.push(`vocali ${(ratio * 100).toFixed(0)}% fuori banda`);
    }
  }

  if (rails.rareCap) {
    const counts = new Map<string, number>();
    for (const t of tokens) if (ALE_RARE_TOKENS.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [t, n] of counts) if (n > 1) issues.push(`${n} token "${t}" (max 1)`);
  }

  if (rails.noForeign) {
    const foreign = tokens.filter((t) => ALE_FOREIGN_TOKENS.has(t)).length;
    if (foreign > 0) issues.push(`${foreign} token non italiani`);
  }

  if (rails.noDeadLines) {
    const isVowel = (t: string) => ALE_VOWEL_TOKENS.has(t);
    let dead = 0;
    for (let r = 0; r < size; r++) {
      let vowels = 0;
      for (let c = 0; c < size; c++) if (isVowel(tokens[r * size + c]!)) vowels++;
      if (vowels === 0) dead++;
    }
    for (let c = 0; c < size; c++) {
      let vowels = 0;
      for (let r = 0; r < size; r++) if (isVowel(tokens[r * size + c]!)) vowels++;
      if (vowels === 0) dead++;
    }
    if (dead > 0) issues.push(`${dead} righe/colonne di sole consonanti`);
  }

  return issues;
}

function buildAleGrid(size: GridSize, tokens: string[]): Grid {
  const tiles: Tile[] = tokens.map((token, index) => {
    const letter = tokenToLetter(token);
    return {
      index,
      row: Math.floor(index / size),
      col: index % size,
      letter,
      display: letter === 'q' ? 'Qu' : letter.toUpperCase(),
    };
  });
  return { size, tiles };
}

/**
 * Genera una griglia "ale" campionando token per frequenza e applicando i guard
 * rails (con retry limitato). Ritorna `null` se nessun tentativo li soddisfa.
 */
export function generateAleGrid(
  size: GridSize,
  freq: AleFrequency,
  rng: () => number,
  rails: AleGuardRails = DEFAULT_ALE_GUARD_RAILS,
  maxTries = 200,
): Grid | null {
  const total = size * size;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const tokens = sampleTokens(freq, total, rng);
    if (guardRailIssues(tokens, size, rails).length === 0) return buildAleGrid(size, tokens);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Soluzione e difficoltà                                              */
/* ------------------------------------------------------------------ */

export interface AleBoardStats {
  words: string[];
  wordCount: number;
  commonCount: number;
  /** Quota di parole fuori da `Common` (0–1). */
  difficulty: number;
  score: number;
  longest: number;
}

/** Punteggio Boggle: `lunghezza − 2` (QU conta due lettere). */
function pointsFor(word: string): number {
  return Math.max(0, word.length - 2);
}

/** Risolve la griglia e calcola le metriche della spec (§4.1). */
export function scoreAleBoard(
  grid: Grid,
  trie: TrieNode,
  common: Set<string>,
  options: { minLength?: number; limit?: number; lemmas?: Map<string, string> } = {},
): AleBoardStats {
  const words = solveGrid(grid, trie, {
    minLength: options.minLength ?? 3,
    limit: options.limit ?? 50_000,
  });
  let commonCount = 0;
  let score = 0;
  let longest = 0;
  for (const w of words) {
    // Comune se lo è la parola o la sua RADICE (lemma): `amo` ← `amare`.
    if (isAleCommon(w, common, options.lemmas)) commonCount++;
    score += pointsFor(w);
    if (w.length > longest) longest = w.length;
  }
  return {
    words,
    wordCount: words.length,
    commonCount,
    difficulty: words.length > 0 ? 1 - commonCount / words.length : 0,
    score,
    longest,
  };
}

/* ------------------------------------------------------------------ */
/* Calibrazione                                                        */
/* ------------------------------------------------------------------ */

/** Percentile con interpolazione lineare (come `numpy.percentile`). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export interface AleCalibration {
  /** Intervallo di parole accettate `[lo, hi]` (Tukey + rho). */
  wordRange: { lo: number; hi: number };
  /** Le tre fasce, con il centro di difficoltà e i confini di ciascuna. */
  tiers: {
    difficulty: Difficulty;
    /** Centro del cluster (quota di parole fuori dal comune). */
    targetDifficulty: number;
    range: { min: number; max: number };
  }[];
  /** Metadati della calibrazione (provenienza). */
  provenance: {
    samples: number;
    guardRails: AleGuardRails;
    dictSize: number;
    commonSize: number;
    wordCount: { min: number; q1: number; median: number; q3: number; max: number };
    rho: number;
    /** true se i cluster k-means sono stati usati; false = fallback ai tertili. */
    usedKmeans: boolean;
  };
}

/** Centro più vicino a `value`. */
function nearestCentroid(value: number, centroids: number[]): number {
  let best = centroids[0]!;
  let bestDist = Infinity;
  for (const c of centroids) {
    const d = Math.abs(value - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * k-means 1D con k=3 (inizializzazione ai percentile 16/50/84: stabile e
 * deterministica). Ritorna i centroidi ordinati crescente.
 */
function kmeans1d(values: number[], k = 3, iterations = 100): number[] {
  if (values.length === 0) return Array.from({ length: k }, () => 0);
  const sorted = [...values].sort((a, b) => a - b);
  let centroids = Array.from({ length: k }, (_, i) => percentile(sorted, ((i + 0.5) / k) * 100));
  for (let it = 0; it < iterations; it++) {
    const buckets: number[][] = Array.from({ length: k }, () => []);
    for (const v of values) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(v - centroids[c]!);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      buckets[best]!.push(v);
    }
    const next = buckets.map((b, i) =>
      b.length > 0 ? b.reduce((a, x) => a + x, 0) / b.length : centroids[i]!,
    );
    const moved = next.reduce((a, v, i) => a + Math.abs(v - centroids[i]!), 0);
    centroids = next;
    if (moved < 1e-9) break;
  }
  return [...centroids].sort((a, b) => a - b);
}

/**
 * Calibra `wordRange` e le 3 fasce da un campione di statistiche di griglia.
 *
 * `rho` (default 0.6) restringe i quartili verso la mediana: `rho=0.6` conserva
 * circa il 60% delle griglie inlier, come da spec. `rho=1` coincide con Tukey pieno.
 */
export function calibrateAle(
  samples: AleBoardStats[],
  provenance: { guardRails: AleGuardRails; dictSize: number; commonSize: number; rho?: number },
): AleCalibration {
  const rho = provenance.rho ?? 0.6;
  const counts = samples.map((s) => s.wordCount).sort((a, b) => a - b);
  const q1 = percentile(counts, 25);
  const median = percentile(counts, 50);
  const q3 = percentile(counts, 75);

  // Tukey: [Q1 − 1.5·IQR, Q3 + 1.5·IQR], poi ristretto verso la mediana con rho.
  const iqr = q3 - q1;
  const tukeyLo = q1 - 1.5 * iqr;
  const tukeyHi = q3 + 1.5 * iqr;
  const lo = Math.max(1, Math.round(median - (median - tukeyLo) * rho));
  const hi = Math.round(median + (tukeyHi - median) * rho);

  const survivors = samples.filter((s) => s.wordCount >= lo && s.wordCount <= hi && s.wordCount > 0);

  const difficultyValues = [...survivors].map((s) => s.difficulty).sort((a, b) => a - b);
  let centroids = kmeans1d(difficultyValues, 3);
  // Validazione k=3: ogni cluster deve avere ≥ max(15, 10%). Altrimenti tertili.
  const minCluster = Math.max(15, Math.ceil(survivors.length * 0.1));
  const clusterSizes = centroids.map(
    (c) => survivors.filter((s) => nearestCentroid(s.difficulty, centroids) === c).length,
  );
  const usedKmeans = clusterSizes.every((n) => n >= minCluster) && survivors.length >= 30;
  if (!usedKmeans) {
    centroids = [
      percentile(difficultyValues, 100 / 6),
      percentile(difficultyValues, 100 / 2),
      percentile(difficultyValues, (100 * 5) / 6),
    ];
  }

  const labels: Difficulty[] = ['facile', 'normale', 'difficile'];
  const tiers = centroids.map((c, i) => {
    const min = i === 0 ? 0 : (centroids[i - 1]! + c) / 2;
    const max = i === centroids.length - 1 ? 1 : (c + centroids[i + 1]!) / 2;
    return { difficulty: labels[i]!, targetDifficulty: c, range: { min, max } };
  });

  return {
    wordRange: { lo, hi },
    tiers,
    provenance: {
      samples: samples.length,
      guardRails: provenance.guardRails,
      dictSize: provenance.dictSize,
      commonSize: provenance.commonSize,
      wordCount: {
        min: counts[0] ?? 0,
        q1,
        median,
        q3,
        max: counts[counts.length - 1] ?? 0,
      },
      rho,
      usedKmeans,
    },
  };
}

/** Fascia di una griglia in base alla sua difficoltà e ai confini calibrati. */
export function tierForDifficulty(difficulty: number, calibration: AleCalibration): Difficulty {
  for (const tier of calibration.tiers) {
    if (difficulty >= tier.range.min && difficulty <= tier.range.max) return tier.difficulty;
  }
  let best = calibration.tiers[0]!;
  let bestDist = Infinity;
  for (const tier of calibration.tiers) {
    const d = Math.abs(difficulty - tier.targetDifficulty);
    if (d < bestDist) {
      bestDist = d;
      best = tier;
    }
  }
  return best.difficulty;
}

/* ------------------------------------------------------------------ */
/* Produzione                                                          */
/* ------------------------------------------------------------------ */

export interface GenerateAleOptions {
  size: GridSize;
  /** Fascia da produrre (targeting). */
  difficulty: Difficulty;
  freq: AleFrequency;
  trie: TrieNode;
  common: Set<string>;
  /** Forma → lemma: una parola è comune se lo è la sua radice (vedi `isAleCommon`). */
  lemmas?: Map<string, string>;
  calibration: AleCalibration;
  /** Seme della prima griglia; i tentativi usano `seed + attempt`. */
  seed: number;
  /** Prefisso dell'id (es. `5-facile`). */
  idPrefix: string;
  /** Numero del primo id (default 1). Le schede "ale" usano un offset per non collidere. */
  idStart?: number;
  /**
   * Indice della scheda nella serie (0-based): determina l'id. Distinto dai
   * tentativi di reiezione: se si usasse il numero del tentativo, due schede
   * diverse potrebbero nascere con lo stesso id.
   */
  idIndex?: number;
  maxAttempts?: number;
  rails?: AleGuardRails;
}

/**
 * Produce una scheda "ale" per la fascia richiesta.
 *
 * Ciclo di reiezione della spec (§7): si parte dal seme `seed` e si prova
 * `seed + attempt`; si accetta la prima griglia che soddisfa guard rails,
 * intervallo di parole calibrato e fascia di difficoltà. Se `maxAttempts` si
 * esaurisce si restituisce il candidato più vicino (mai `null` silenzioso).
 *
 * Le parole ATTESE (`words`) coincidono con le ACCETTATE (`allWords`) e con
 * tutte le soluzioni del dizionario: qui non esiste una fascia di frequenza.
 */
export function generateAleScheda(options: GenerateAleOptions): Scheda {
  const {
    size,
    difficulty,
    freq,
    trie,
    common,
    lemmas,
    calibration,
    seed,
    idPrefix,
    idStart = 1,
    idIndex = 0,
    maxAttempts = 500,
    rails = DEFAULT_ALE_GUARD_RAILS,
  } = options;

  const tier = calibration.tiers.find((t) => t.difficulty === difficulty) ?? calibration.tiers[1]!;
  let best: { stats: AleBoardStats; grid: Grid; distance: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32((seed + attempt) >>> 0);
    const grid = generateAleGrid(size, freq, rng, rails);
    if (!grid) continue;
    const stats = scoreAleBoard(grid, trie, common, { minLength: 3, lemmas });

    const inRange = stats.wordCount >= calibration.wordRange.lo && stats.wordCount <= calibration.wordRange.hi;
    const targetDifficulty = tier.targetDifficulty;
    const distance =
      Math.abs(stats.wordCount - (calibration.wordRange.lo + calibration.wordRange.hi) / 2) /
        Math.max(1, calibration.wordRange.hi) +
      Math.abs(stats.difficulty - targetDifficulty);

    if (!best || distance < best.distance) best = { stats, grid, distance };

    if (!inRange) continue;
    const tierLabel = tierForDifficulty(stats.difficulty, calibration);
    if (tierLabel !== difficulty) continue;

    return toAleScheda(size, difficulty, idPrefix, idStart, idIndex, grid, stats);
  }

  // Ripiego: il candidato più vicino (loggato dallo script di generazione).
  const fallback = best ?? (() => {
    // Nessun candidato utile: genera comunque una griglia valida al primo colpo.
    const rng = mulberry32(seed >>> 0);
    const grid = generateAleGrid(size, freq, rng, rails) ?? buildAleGridFallback(size, freq, rng);
    const stats = scoreAleBoard(grid, trie, common, { minLength: 3, lemmas });
    return { stats, grid, distance: Infinity };
  })();
  return toAleScheda(size, difficulty, idPrefix, idStart, idIndex, fallback.grid, fallback.stats);
}

/** Ultima spiaggia: griglia campionata senza guard rails (non dovrebbe servire). */
function buildAleGridFallback(size: GridSize, freq: AleFrequency, rng: () => number): Grid {
  const total = size * size;
  const tokens = sampleTokens(freq, total, rng);
  return {
    size,
    tiles: tokens.map((token, index) => {
      const letter = token === 'qu' ? 'q' : token;
      return {
        index,
        row: Math.floor(index / size),
        col: index % size,
        letter,
        display: letter === 'q' ? 'Qu' : letter.toUpperCase(),
      };
    }),
  };
}

function toAleScheda(
  size: GridSize,
  difficulty: Difficulty,
  idPrefix: string,
  idStart: number,
  idIndex: number,
  grid: Grid,
  stats: AleBoardStats,
): Scheda {
  const words = [...stats.words].sort((a, b) => b.length - a.length || a.localeCompare(b, 'it'));
  return {
    id: `${idPrefix}-${String(idStart + idIndex).padStart(3, '0')}`,
    size,
    difficulty,
    variant: 'ale',
    grid: gridToRows(grid),
    words,
    allWords: words,
    longest: stats.longest,
  };
}

/** Utilità per lo script di generazione: campione di statistiche su `n` griglie. */
export function sampleAleBoards(
  size: GridSize,
  freq: AleFrequency,
  trie: TrieNode,
  common: Set<string>,
  n: number,
  masterSeed = 0,
  rails: AleGuardRails = DEFAULT_ALE_GUARD_RAILS,
  lemmas?: Map<string, string>,
): AleBoardStats[] {
  const out: AleBoardStats[] = [];
  for (let i = 0; i < n; i++) {
    const rng = mulberry32((masterSeed + i + 1) >>> 0);
    const grid = generateAleGrid(size, freq, rng, rails);
    if (!grid) continue;
    out.push(scoreAleBoard(grid, trie, common, { minLength: 3, lemmas }));
  }
  return out;
}
