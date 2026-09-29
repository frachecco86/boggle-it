/**
 * Algoritmo "ale" — implementazione della pipeline descritta nel documento
 * *algoritmo schede "ale"*.
 *
 * Differenze sostanziali rispetto a `standard`/`full` (vedi `schedaGen.ts`):
 *  - le lettere NON sono composte a mano: si CAMPIONANO dalla frequenza dei
 *    token nel dizionario (con reimmissione);
 *  - `qu` è un TOKEN unico: `quando` → [QU, A, N, D, O];
 *  - la difficoltà di una griglia è `0.5·R + 0.5·M`, dove `R` è la **rarità ad
 *    anelli di frequenza** (vedi `aleRarityRings`: top-5000, 5001–20000, oltre)
 *    e `M` è la RICCHEZZA della griglia (quanto il punteggio medio per parola
 *    supera il minimo di 1 punto);
 *  - i limiti (intervallo di parole accettate, bande per fascia e le 3 fasce) si
 *    derivano da una CALIBRAZIONE su un campione di griglie (Tukey + clustering a
 *    3 livelli).
 *
 * Il modulo è puro e deterministico: dato lo stesso seme e la stessa
 * configurazione produce le stesse griglie. La generazione del catalogo avviene
 * offline (`apps/server/scripts/gen-schede-ale.ts`, "a tre secchi").
 *
 * Guard rails (ATTIVI): banda vocali 30–60% (`qu` NON è vocale), al più tre token
 * rari H/Z/QU in totale, struttura giocabile (`gridStructureIssues`), nessuna riga
 * o colonna che non sia attraversata da almeno una soluzione, almeno una parola
 * ancora (6/7/8+ lettere). Per le rare ci sono anche un floor di campionamento
 * (`tokenFloor`, in quota di cella) e un gate di presenza per fascia
 * (`rareByTier`). Sono applicati sia in calibrazione sia in produzione con gli
 * stessi valori: cambiarli invalida la calibrazione, come richiede la spec.
 */
import type { Difficulty } from './difficulty.js';
import { DIFFICULTY_ORDER } from './difficulty.js';
import { FOREIGN_LETTERS, gridStructureIssues } from './grid.js';
import { gridToRows, type Scheda } from './scheda.js';
import { solveGrid, solveGridCoverage, type TrieNode } from './solver.js';
import type { Grid, GridSize, Tile } from './types.js';

/** Token dell'alfabeto "ale": 26 simboli, `QU` al posto della `Q`. */
export const ALE_TOKENS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'qu',
] as const;

/**
 * Anelli di frequenza sulla lista `frequency-it.txt` (OpenSubtitles 2018).
 *
 * `easy` = prime 5000 voci valide dopo la pulizia; `medium` = prime 20000
 * (include `easy`). Servono a costruire i due `Set` passati come `rings`; gli
 * ANELLI veri e propri si ricavano per differenza al momento del conteggio
 * (`aleRingOf`).
 */
export const ALE_RARITY_RINGS = { easy: 5000, medium: 20000 } as const;

/** Token che contano come vocale. `qu` NON è una vocale (come nel full). */
const ALE_VOWEL_TOKENS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Token con tetto complessivo per griglia (guard rail della spec): H/Z/QU. */
const ALE_RARE_TOKENS = new Set(['h', 'z', 'qu']);

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

/* ------------------------------------------------------------------ */
/* Anelli di frequenza e rarità                                        */
/* ------------------------------------------------------------------ */

/** Insiemi degli anelli: `easy` = top-5000, `medium` = top-20000 (include `easy`). */
export interface AleRings {
  easy: ReadonlySet<string>;
  medium: ReadonlySet<string>;
}

/**
 * Anello di frequenza di una parola: 0 = top-5000, 1 = 5001–20000, 2 = oltre.
 *
 * Gli insiemi sono ANNIDATI (`easy ⊆ medium`): una parola nel top-5000 è anello
 * 0, una nel top-20000 ma non nel top-5000 è anello 1, tutte le altre anello 2.
 */
export function aleRingOf(word: string, rings: AleRings): 0 | 1 | 2 {
  if (rings.easy.has(word)) return 0;
  if (rings.medium.has(word)) return 1;
  return 2;
}

/**
 * Conteggi per anello + rarità pesata `R = (f1 + 2·f2) / 2`.
 *
 * `f0/f1/f2` sono le quote di parole nei tre anelli (somma 1). Il peso doppio
 * dell'anello "raro" rende `R` una misura graduata in `[0, 1]`. Con zero parole
 * `R = 0` (come prima; il caso è comunque scartato dal range di parole).
 */
export function aleRarityRings(words: readonly string[], rings: AleRings): {
  ringCounts: [number, number, number];
  rarity: number;
} {
  const ringCounts: [number, number, number] = [0, 0, 0];
  for (const w of words) ringCounts[aleRingOf(w, rings)]++;
  const wordCount = words.length;
  if (wordCount === 0) return { ringCounts, rarity: 0 };
  const f1 = ringCounts[1] / wordCount;
  const f2 = ringCounts[2] / wordCount;
  return { ringCounts, rarity: (f1 + 2 * f2) / 2 };
}

/* ------------------------------------------------------------------ */
/* Guard rails e generazione griglia                                   */
/* ------------------------------------------------------------------ */

export interface AleGuardRails {
  /** Banda della quota di vocali (0–1). `null` = disattivato. */
  vowels: { min: number; max: number } | null;
  /**
   * Floor di campionamento per token, in QUOTA DI CELLA (0–1), non in frequenza
   * di dizionario. Es. `{ qu: 0.006 }` = una cella su 167 è `qu`. Il peso si
   * converte con `w = p·(Σf−f_t)/(1−p)`, così la quota realizzata è esattamente
   * `p`. Ha effetto solo se il floor supera la quota naturale del token.
   */
  tokenFloor: Partial<Record<'h' | 'z' | 'qu', number>> | null;
  /**
   * Presenza di token rari (h+z+qu) PER FASCIA, applicata DOPO che la fascia
   * naturale è stata assegnata. `{ facile: {max:1}, difficile: {min:1} }`.
   * `null` = nessun vincolo. È un filtro di accettazione: non cambia `D` né i
   * confini delle fasce, quindi non richiede una calibrazione a due passate.
   */
  rareByTier: Record<Difficulty, { min?: number; max?: number }> | null;
  /**
   * Se true, la `h` è piazzata solo su celle adiacenti a `c`/`g` (peso
   * posizionale): la struttura non la scarta e la sua frequenza aggregata resta
   * quella naturale (vedi `hBoost`).
   */
  hNearCG: boolean;
  /**
   * Moltiplicatore della marginale naturale di cella di `h` (1 = frequenza
   * naturale). Tenuto basso: serve a distribuire le `h` in posizioni valide, non
   * a gonfiarne la frequenza.
   */
  hBoost?: number;
  /**
   * Numero massimo di token rari (`h`, `z`, `qu`) IN TOTALE nella griglia.
   * `null` = disattivato. Non è un tetto per singolo token: "al più tre tra
   * H/Z/QU" vuol dire che la somma dei tre non supera `rareCap`.
   */
  rareCap: number | null;
  /**
   * Nessuna riga o colonna senza alcuna soluzione.
   *
   * Non è una proprietà dei token (una riga di consonanti può comunque essere
   * attraversata da parole): serve RISOLVERE la griglia e verificarne la
   * copertura. Vedi `coverageIssues` e `solveGridCoverage`.
   */
  noUncoveredLines: boolean;
  /**
   * Struttura giocabile: applica `gridStructureIssues` (consonanti vicine a una
   * vocale, righe/colonne con vocali, `h` con `c`/`g` accanto). `null`/`false` =
   * disattivato; `true` = attivo (default).
   */
  structure: boolean;
  /**
   * Lunghezza minima della parola più lunga per dimensione: garantisce almeno
   * una parola ANCORA (6 su 4×4, 7 su 5×5, 8 su 6×6). `null` = disattivato.
   */
  anchorMinLength: Record<GridSize, number> | null;
}

/** Guard rails ATTIVI, come concordato per il catalogo. */
export const DEFAULT_ALE_GUARD_RAILS: AleGuardRails = {
  vowels: { min: 0.3, max: 0.6 },
  tokenFloor: { qu: 0.006 },
  rareByTier: { facile: { max: 1 }, normale: {}, difficile: { min: 1 } },
  hNearCG: true,
  hBoost: 1,
  rareCap: 3,
  noUncoveredLines: true,
  structure: true,
  anchorMinLength: { 4: 6, 5: 7, 6: 8 },
};

/**
 * Contatori della generazione: servono al report (`pnpm report:ale`) per dire
 * quanti candidati sono stati scartati e perché.
 *
 * Un CAMPIONE può violare più di una regola insieme, quindi la somma di
 * `railRejections` può superare `sampled`.
 */
export interface AleGenerationStats {
  /** Griglie campionate, compresi i tentativi interni dei guard rails. */
  sampled: number;
  /** Campioni RESPINTI dai guard rails (almeno una regola violata). */
  rejected: number;
  /** Scarti per motivo dei guard rails (chiave = motivo, valore = conteggio). */
  railRejections: Record<string, number>;
  /** Tentativi esterni in cui i guard rails non hanno prodotto nessuna griglia. */
  noGrid: number;
  /** Candidati scartati perché fuori dall'intervallo di parole calibrato. */
  wordCountOut: number;
  /** Candidati scartati perché fuori dalla banda della propria fascia. */
  tierBandOut: number;
  /** Candidati scartati dal gate di presenza rari della propria fascia. */
  tierRareOut: number;
  /** Ripieghi usati per completare un secchio rimasto incompleto. */
  fallbacks: number;
  /** Tentativi (candidati) del flusso esterno. */
  attempts: number;
  /** Numero del tentativo che ha prodotto una scheda valida (`null` = ripiego). */
  acceptedAttempt: number | null;
}

/** Contatori azzerati, pronti da passare a `generateAleGrid`/`nextAleCandidate`. */
export function newAleGenerationStats(): AleGenerationStats {
  return {
    sampled: 0,
    rejected: 0,
    railRejections: {},
    noGrid: 0,
    wordCountOut: 0,
    tierBandOut: 0,
    tierRareOut: 0,
    fallbacks: 0,
    attempts: 0,
    acceptedAttempt: null,
  };
}

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

/**
 * Pesi di campionamento dei token, applicando i floor in QUOTA DI CELLA.
 *
 * Per i token floored il peso naturale `f` è sostituito da `w = p·W` con
 * `W = S_o/(1−Σp)` (`S_o` = somma dei pesi naturali dei soli token NON floored):
 * la quota realizzata è esattamente `p`. Il floor si applica solo se supera la
 * quota naturale del token (`p > f/Σf`), così non abbassa mai una lettera.
 *
 * L'unità è la CELLA, non il dizionario: usare `p` come peso diretto sarebbe
 * sbagliato di un fattore `Σf` (~7,5).
 */
function tokenSamplingWeights(
  freq: AleFrequency,
  floors?: Partial<Record<string, number>>,
  omit?: ReadonlySet<string>,
): number[] {
  const base = freq.ordered.map(({ token, freq: f }) => (omit?.has(token) ? 0 : f));
  const totalBase = base.reduce((a, f) => a + f, 0);
  if (totalBase <= 0) return base;
  const active: { index: number; p: number }[] = [];
  if (floors) {
    freq.ordered.forEach(({ token, freq: f }, index) => {
      if (omit?.has(token)) return;
      const p = floors[token];
      if (p !== undefined && p > 0 && p > f / totalBase) active.push({ index, p });
    });
  }
  if (active.length === 0) return base;
  const sumP = active.reduce((a, x) => a + x.p, 0);
  if (sumP >= 1) return base;
  const activeIdx = new Set(active.map((x) => x.index));
  const sOther = base.reduce((a, f, i) => a + (activeIdx.has(i) ? 0 : f), 0);
  const totalTarget = sOther / (1 - sumP);
  const out = [...base];
  for (const { index, p } of active) out[index] = p * totalTarget;
  return out;
}

/** Estrae `count` token da `freq` con reimmissione, pesati per frequenza (con floor opzionali). */
export function sampleTokens(
  freq: AleFrequency,
  count: number,
  rng: () => number,
  floors?: Partial<Record<string, number>>,
  omit?: ReadonlySet<string>,
): string[] {
  const weights = tokenSamplingWeights(freq, floors, omit);
  const cumulative: number[] = [];
  let total = 0;
  for (const w of weights) {
    total += w;
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

/** Token escluso dalla fase 1 del piazzamento posizionale di `h`. */
const H_TOKENS = new Set(['h']);

/**
 * True se una cella può essere “sacrificata” per piazzare una `h`: consonante
 * comune, non `c`/`g` (che fanno da ancora), non rara (`h`/`z`/`qu`) e non
 * straniera. Escluderle preserva le frequenze naturali delle altre lettere.
 */
function isHPromotableToken(token: string): boolean {
  if (token === 'qu') return false;
  if (ALE_VOWEL_TOKENS.has(token)) return false;
  if (token === 'c' || token === 'g' || token === 'h' || token === 'z') return false;
  if ((FOREIGN_LETTERS as readonly string[]).includes(token)) return false;
  return true;
}

/**
 * Piazzamento posizionale di `h` (Tappa 2), calibrato sulla frequenza naturale.
 *
 * `tokens` arriva dalla FASE 1 (campionata senza `h`). Si promuovono a `h` le
 * celle sacrificabili adiacenti a una `c`/`g` con probabilità
 * `q = hBoost · m_h / P`, dove `m_h = f_h/Σf` è la marginale naturale di cella
 * di `h` e `P` la frazione di celle sacrificabili della griglia. Così
 * `E[#h] = N · m_h · hBoost` — la frequenza aggregata di `h` resta quella
 * naturale — ma ogni `h` cade accanto a `c`/`g` e non viene scartata dalla
 * struttura. Le `c`/`g` non sono mai promosse: restano le ancore.
 */
export function placePositionalH(
  tokens: string[],
  size: number,
  freq: AleFrequency,
  rng: () => number,
  hBoost = 1,
): void {
  const total = tokens.length;
  if (total === 0) return;
  const totalBase = freq.ordered.reduce((a, x) => a + x.freq, 0);
  const naturalH = totalBase > 0 ? (freq.freq.get('h') ?? 0) / totalBase : 0;
  const target = naturalH * hBoost;
  if (target <= 0) return;

  const promotable: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!isHPromotableToken(tokens[i]!)) continue;
    const row = Math.floor(i / size);
    const col = i % size;
    let near = false;
    for (let dr = -1; dr <= 1 && !near; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const n = tokens[r * size + c]!;
        if (n === 'c' || n === 'g') {
          near = true;
          break;
        }
      }
    }
    if (near) promotable.push(i);
  }
  if (promotable.length === 0) return;
  const q = Math.min(1, target / (promotable.length / total));
  for (const i of promotable) {
    if (rng() < q) tokens[i] = 'h';
  }
}

/** Fase 1 (senza `h`) + piazzamento posizionale di `h` (Tappa 2). */
export function sampleTokensWithPositionalH(
  size: GridSize,
  freq: AleFrequency,
  rng: () => number,
  floors?: Partial<Record<string, number>>,
  hBoost = 1,
): string[] {
  const tokens = sampleTokens(freq, size * size, rng, floors, H_TOKENS);
  placePositionalH(tokens, size, freq, rng, hBoost);
  return tokens;
}

/**
 * Verifica i guard rail SUI TOKEN (vocali e token rari), nell'ordine riga per riga.
 *
 * La copertura di righe/colonne NON è qui: dipende dal dizionario e richiede
 * una risoluzione. Vedi `coverageIssues`.
 */
export function tokenGuardRailIssues(tokens: string[], size: number, rails: AleGuardRails): string[] {
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

  if (rails.rareCap !== null) {
    const rare = tokens.filter((t) => ALE_RARE_TOKENS.has(t)).length;
    if (rare > rails.rareCap) issues.push(`${rare} token rari H/Z/QU (max ${rails.rareCap})`);
  }

  return issues;
}

/** Numero di token rari (`h`/`z`/`qu`) in una griglia (`q` = token `qu`). */
export function countRareTokens(grid: Grid): number {
  let n = 0;
  for (const tile of grid.tiles) {
    const token = tile.letter === 'q' ? 'qu' : tile.letter;
    if (ALE_RARE_TOKENS.has(token)) n++;
  }
  return n;
}

/**
 * Righe e colonne attraversate da almeno una soluzione.
 *
 * `used[i]` dice se la cella `i` fa parte di qualche parola trovata. Una riga o
 * colonna con tutte le celle inutilizzate è "morta": non contribuisce a nessuna
 * parola e va scartata. `size` è il lato della griglia.
 */
export function coverageIssues(used: boolean[], size: number): string[] {
  const issues: string[] = [];
  let deadRows = 0;
  let deadCols = 0;
  for (let r = 0; r < size; r++) {
    let covered = false;
    for (let c = 0; c < size; c++) if (used[r * size + c]) covered = true;
    if (!covered) deadRows++;
  }
  for (let c = 0; c < size; c++) {
    let covered = false;
    for (let r = 0; r < size; r++) if (used[r * size + c]) covered = true;
    if (!covered) deadCols++;
  }
  if (deadRows > 0) issues.push(`${deadRows} righe senza soluzioni`);
  if (deadCols > 0) issues.push(`${deadCols} colonne senza soluzioni`);
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
 * Genera una griglia "ale" campionando token per frequenza e applicando TUTTI i
 * guard rails, con retry limitato.
 *
 * Ordine dei controlli (dal più economico al più costoso):
 *  1. token (vocali, tetto rari) — nessuna risoluzione;
 *  2. struttura (`gridStructureIssues`) — costruisce la griglia ma nessuna
 *     risoluzione;
 *  3. copertura ed eventualmente ancora — richiede `solveGridCoverage`, che
 *     restituisce anche `words`: la stessa solve serve a entrambi i rail, senza
 *     costo aggiuntivo.
 *
 * Il `trie` serve ai guard rail di COPERTURA e ANCORA: dipendono dal dizionario.
 * Ritorna `null` se nessun tentativo li soddisfa.
 */
export function generateAleGrid(
  size: GridSize,
  freq: AleFrequency,
  rng: () => number,
  trie: TrieNode,
  rails: AleGuardRails = DEFAULT_ALE_GUARD_RAILS,
  maxTries = 200,
  stats?: AleGenerationStats,
): Grid | null {
  const total = size * size;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const tokens = rails.hNearCG
      ? sampleTokensWithPositionalH(size, freq, rng, rails.tokenFloor ?? undefined, rails.hBoost ?? 1)
      : sampleTokens(freq, total, rng, rails.tokenFloor ?? undefined);
    const issues = tokenGuardRailIssues(tokens, size, rails);
    if (stats) {
      stats.sampled++;
      if (issues.length > 0) stats.rejected++;
      for (const issue of issues) {
        stats.railRejections[issue] = (stats.railRejections[issue] ?? 0) + 1;
      }
    }
    if (issues.length > 0) continue;

    const grid = buildAleGrid(size, tokens);

    // 2. Struttura: proprietà dei token, ma serve la griglia per l'adiacenza.
    if (rails.structure) {
      const structure = gridStructureIssues(grid);
      if (structure.length > 0) {
        if (stats) {
          stats.rejected++;
          for (const issue of structure) stats.railRejections[issue] = (stats.railRejections[issue] ?? 0) + 1;
        }
        continue;
      }
    }

    /*
     * 3. Copertura + ancora: si risolve la griglia UNA volta (solo se uno dei due
     * rail la richiede) e si usano sia `used` sia `words`.
     */
    const needSolve = rails.noUncoveredLines || rails.anchorMinLength !== null;
    if (needSolve) {
      const solved = solveGridCoverage(grid, trie, { minLength: 3, limit: 100_000 });
      if (rails.noUncoveredLines) {
        const coverage = coverageIssues(solved.used, size);
        if (coverage.length > 0) {
          if (stats) {
            stats.rejected++;
            for (const issue of coverage) stats.railRejections[issue] = (stats.railRejections[issue] ?? 0) + 1;
          }
          continue;
        }
      }
      if (rails.anchorMinLength) {
        const minLength = rails.anchorMinLength[size];
        const longest = solved.words.reduce((m, w) => Math.max(m, w.length), 0);
        if (longest < minLength) {
          const issue = `nessuna parola ≥ ${minLength} lettere`;
          if (stats) {
            stats.rejected++;
            stats.railRejections[issue] = (stats.railRejections[issue] ?? 0) + 1;
          }
          continue;
        }
      }
    }

    return grid;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Soluzione e difficoltà                                              */
/* ------------------------------------------------------------------ */

export interface AleBoardStats {
  words: string[];
  wordCount: number;
  /**
   * Quante parole trovate cadono in ciascun anello di frequenza: `[0–5k,
   * 5k–20k, >20k]`. Vedi `aleRarityRings`.
   */
  ringCounts: [number, number, number];
  /**
   * Rarità pesata sugli anelli di frequenza (0–1), vedi `aleRarityRings`. È la
   * componente `R` di `compositeDifficulty`.
   */
  rarity: number;
  score: number;
  longest: number;
}

/*
 * Pesi della difficoltà composita.
 *
 * La difficoltà di una griglia non dipende più solo da QUANTO sono rare le
 * parole (R), ma anche da QUANTO VALE la griglia in punti rispetto al numero di
 * parole (M, ricchezza): una griglia con tante parole da 3 lettere (1 punto
 * l'una) è più abbordabile di una con lo stesso numero di parole ma più lunghe.
 * I pesi 0.5/0.5 danno lo stesso peso a rarità e ricchezza.
 *
 * Sono costanti ESPLICITE: cambiarle cambia i confini delle fasce, quindi
 * invalida `calibration.json` (che li registra in `provenance`).
 */
export const ALE_DIFFICULTY_WEIGHTS = { rarity: 0.5, richness: 0.5 } as const;

/**
 * Ricchezza `M` della griglia: `1 − parole / punteggio`.
 *
 * `M = 0` se ogni parola vale 1 punto (tutte da 3 lettere: `punteggio ===
 * parole`), e cresce verso 1 quanto più il punteggio medio per parola supera
 * il minimo (parole più lunghe valgono più punti). Il risultato è limitato a
 * `[0, 1]`: `punteggio >= parole` sempre (ogni parola vale almeno 1 punto),
 * quindi non serve un intervallo calibrato per questa componente.
 */
export function richnessFor(wordCount: number, score: number): number {
  if (score <= 0) return 0;
  const raw = 1 - wordCount / score;
  return Math.min(1, Math.max(0, raw));
}

/**
 * Difficoltà composita: `wR · R + wM · M`.
 *
 * `R` è la rarità ad anelli (`aleRarityRings`), `M` la ricchezza della griglia
 * (`richnessFor`). Vedi `ALE_DIFFICULTY_WEIGHTS`.
 */
export function compositeDifficulty(
  rarity: number,
  wordCount: number,
  score: number,
  weights: { rarity: number; richness: number } = ALE_DIFFICULTY_WEIGHTS,
): number {
  return weights.rarity * rarity + weights.richness * richnessFor(wordCount, score);
}

/** Punteggio Boggle: `lunghezza − 2` (QU conta due lettere). */
function pointsFor(word: string): number {
  return Math.max(0, word.length - 2);
}

/**
 * Risolve la griglia e calcola le metriche della spec (§4.1).
 *
 * La rarità `R` è quella ad anelli di frequenza (`aleRarityRings`): `rings` è
 * obbligatorio nel terzo argomento.
 */
export function scoreAleBoard(
  grid: Grid,
  trie: TrieNode,
  options: { minLength?: number; limit?: number; rings: AleRings },
): AleBoardStats {
  const words = solveGrid(grid, trie, {
    minLength: options.minLength ?? 3,
    limit: options.limit ?? 50_000,
  });
  const { ringCounts, rarity } = aleRarityRings(words, options.rings);
  let score = 0;
  let longest = 0;
  for (const w of words) {
    score += pointsFor(w);
    if (w.length > longest) longest = w.length;
  }
  return { words, wordCount: words.length, ringCounts, rarity, score, longest };
}

/* ------------------------------------------------------------------ */
/* Calibrazione                                                        */
/* ------------------------------------------------------------------ */

/**
 * Restringimento dell'intervallo Tukey verso la mediana (`ALE_CALIBRATION_RHO`).
 *
 * `rho=1` coincide con Tukey pieno; valori più bassi stringono la banda di
 * parole accettate. Si usa **0.35** e non lo 0.6 della spec: con 0.6 la banda
 * era troppo larga (su 4×4 [14, 203] parole, ~91% di griglie in-range), così
 * le schede di una stessa fascia variavano troppo nel numero di parole. Con
 * 0.35 la banda si dimezza circa (4×4 [51, 162]) e restano in-range ~67–70%
 * dei campioni: gli scarti in più in produzione costano pochi tentativi di
 * reiezione. Misure al variare di rho: `docs/algoritmi/report/ale.md`.
 *
 * È un parametro dell'algoritmo: cambiarlo invalida `calibration.json`
 * (registrato in `provenance.rho`, verificato dal runtime in `ale.ts`).
 */
export const ALE_CALIBRATION_RHO = 0.35;

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
  /** Le tre fasce, con il centro di difficoltà, i confini e la banda di parole. */
  tiers: {
    difficulty: Difficulty;
    /** Centro del cluster (difficoltà COMPOSITA, vedi `compositeDifficulty`). */
    targetDifficulty: number;
    range: { min: number; max: number };
    /** Banda di parole della fascia (Tukey+rho sui soli membri, tagliata al range globale). */
    wordRange: { lo: number; hi: number };
  }[];
  /** Metadati della calibrazione (provenienza). */
  provenance: {
    samples: number;
    guardRails: AleGuardRails;
    dictSize: number;
    /** Anelli di frequenza usati (top-5000 / top-20000). */
    rings: { easy: number; medium: number };
    /** Identifica la definizione di rarità: anelli pesati, versione 1. */
    metric: 'rings-v1';
    wordCount: { min: number; q1: number; median: number; q3: number; max: number };
    rho: number;
    /** Pesi della difficoltà composita usati per la calibrazione. */
    weights: { rarity: number; richness: number };
    /** true se i cluster k-means sono stati usati; false = fallback ai tertili. */
    usedKmeans: boolean;
    /** true se una fascia ha usato il range globale (meno di 30 membri). */
    perTierFallback: boolean;
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
 * `rho` (default `ALE_CALIBRATION_RHO` = 0.35) restringe i quartili verso la
 * mediana. `rho=1` coincide con Tukey pieno.
 */
export function calibrateAle(
  samples: AleBoardStats[],
  provenance: {
    guardRails: AleGuardRails;
    dictSize: number;
    rings: { easy: number; medium: number };
    rho?: number;
    weights?: { rarity: number; richness: number };
  },
): AleCalibration {
  const rho = provenance.rho ?? ALE_CALIBRATION_RHO;
  const weights = provenance.weights ?? ALE_DIFFICULTY_WEIGHTS;
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
  const wordRange = { lo, hi };

  const survivors = samples.filter((s) => s.wordCount >= lo && s.wordCount <= hi && s.wordCount > 0);

  /*
   * Difficoltà COMPOSITA dei superstiti: `0.5·R + 0.5·M` (M = ricchezza,
   * indipendente dall'intervallo calibrato: dipende solo da parole e punteggio
   * della griglia).
   */
  const difficultyValues = survivors
    .map((s) => compositeDifficulty(s.rarity, s.wordCount, s.score, weights))
    .sort((a, b) => a - b);
  let centroids = kmeans1d(difficultyValues, 3);
  // Validazione k=3: ogni cluster deve avere ≥ max(15, 10%). Altrimenti tertili.
  const minCluster = Math.max(15, Math.ceil(survivors.length * 0.1));
  const clusterSizes = centroids.map(
    (c) => difficultyValues.filter((v) => nearestCentroid(v, centroids) === c).length,
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

  /*
   * Bande di parole per fascia (§1.5): stessa procedura Tukey+rho applicata ai
   * soli membri della fascia, poi tagliata al range globale. Se una fascia ha
   * meno di 30 membri si usa il range globale e si marca `perTierFallback`.
   */
  let perTierFallback = false;
  const tiersWithBands = tiers.map((tier) => {
    const members = survivors.filter(
      (s) =>
        tierForDifficulty(compositeDifficulty(s.rarity, s.wordCount, s.score, weights), { tiers }) ===
        tier.difficulty,
    );
    if (members.length < 30) {
      perTierFallback = true;
      return { ...tier, wordRange: { lo: wordRange.lo, hi: wordRange.hi } };
    }
    const memberCounts = members.map((s) => s.wordCount).sort((a, b) => a - b);
    const mq1 = percentile(memberCounts, 25);
    const mmed = percentile(memberCounts, 50);
    const mq3 = percentile(memberCounts, 75);
    const miqr = mq3 - mq1;
    const mtukeyLo = mq1 - 1.5 * miqr;
    const mtukeyHi = mq3 + 1.5 * miqr;
    const tierLo = Math.max(1, Math.round(mmed - (mmed - mtukeyLo) * rho));
    const tierHi = Math.round(mmed + (mtukeyHi - mmed) * rho);
    return {
      ...tier,
      wordRange: { lo: Math.max(tierLo, wordRange.lo), hi: Math.min(tierHi, wordRange.hi) },
    };
  });

  return {
    wordRange,
    tiers: tiersWithBands,
    provenance: {
      samples: samples.length,
      guardRails: provenance.guardRails,
      dictSize: provenance.dictSize,
      rings: provenance.rings,
      metric: 'rings-v1',
      wordCount: {
        min: counts[0] ?? 0,
        q1,
        median,
        q3,
        max: counts[counts.length - 1] ?? 0,
      },
      rho,
      weights,
      usedKmeans,
      perTierFallback,
    },
  };
}

/** Fascia di una griglia in base alla sua difficoltà e ai confini calibrati. */
export function tierForDifficulty(
  difficulty: number,
  calibration: {
    tiers: readonly {
      difficulty: Difficulty;
      targetDifficulty: number;
      range: { min: number; max: number };
    }[];
  },
): Difficulty {
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

/**
 * Un candidato classificato: griglia valida + stats + fascia naturale.
 *
 * `difficulty` è la fascia assegnata da `tierForDifficulty`; `distance` è la
 * distanza dal centro della fascia (serve ai ripieghi di `generateAleBuckets`).
 */
export interface AleCandidate {
  grid: Grid;
  stats: AleBoardStats;
  difficulty: Difficulty;
  distance: number;
}

/**
 * Il PROSSIMO candidato del flusso deterministico.
 *
 * `attempt` è il contatore globale del flusso: il seme della griglia è
 * `seed + attempt`. Ritorna `null` se il candidato non è accettabile (guard
 * rails, range globale o banda della sua fascia). Il chiamante incrementa
 * `attempt` e riprova.
 */
export function nextAleCandidate(options: {
  size: GridSize;
  freq: AleFrequency;
  trie: TrieNode;
  rings: AleRings;
  calibration: AleCalibration;
  seed: number;
  attempt: number;
  rails?: AleGuardRails;
  stats?: AleGenerationStats;
}): AleCandidate | null {
  const {
    size,
    freq,
    trie,
    rings,
    calibration,
    seed,
    attempt,
    rails = DEFAULT_ALE_GUARD_RAILS,
    stats,
  } = options;

  const rng = mulberry32((seed + attempt) >>> 0);
  if (stats) stats.attempts++;
  const grid = generateAleGrid(size, freq, rng, trie, rails, 200, stats);
  if (!grid) {
    if (stats) stats.noGrid++;
    return null;
  }

  const board = scoreAleBoard(grid, trie, { minLength: 3, limit: 50_000, rings });
  const { lo, hi } = calibration.wordRange;
  if (board.wordCount < lo || board.wordCount > hi) {
    if (stats) stats.wordCountOut++;
    return null;
  }

  const difficulty = tierForDifficulty(
    compositeDifficulty(board.rarity, board.wordCount, board.score),
    calibration,
  );
  const tier = calibration.tiers.find((t) => t.difficulty === difficulty)!;
  if (board.wordCount < tier.wordRange.lo || board.wordCount > tier.wordRange.hi) {
    if (stats) stats.tierBandOut++;
    return null;
  }

  // Gate di presenza rari per fascia (dopo la classificazione: `D` non cambia).
  if (rails.rareByTier) {
    const rule = rails.rareByTier[difficulty];
    const rare = countRareTokens(grid);
    if ((rule.min !== undefined && rare < rule.min) || (rule.max !== undefined && rare > rule.max)) {
      if (stats) stats.tierRareOut++;
      return null;
    }
  }

  const distance = Math.abs(
    compositeDifficulty(board.rarity, board.wordCount, board.score) - tier.targetDifficulty,
  );
  return { grid, stats: board, difficulty, distance };
}

/**
 * Riempie i tre secchi (facile/normale/difficile) con `perTier` schede ciascuno,
 * pescando dal flusso. Deterministica: stesso `(seed, perTier, size)` → stesse
 * schede con gli stessi id (contigui per fascia).
 *
 * I candidati accettati entrano nel secchio della loro fascia solo se non è
 * pieno; i candidati in banda di una fascia già piena sono tenuti come ripiego.
 * Se un secchio resta incompleto, lo si completa prima con quei candidati e poi
 * rilanciando il flusso con i soli rails + range globale.
 */
export function generateAleBuckets(options: {
  size: GridSize;
  perTier: number;
  freq: AleFrequency;
  trie: TrieNode;
  rings: AleRings;
  calibration: AleCalibration;
  seed: number;
  idStart: number;
  maxAttempts?: number;
  rails?: AleGuardRails;
  stats?: AleGenerationStats;
}): Record<Difficulty, Scheda[]> {
  const {
    size,
    perTier,
    freq,
    trie,
    rings,
    calibration,
    seed,
    idStart,
    maxAttempts = 500 * perTier,
    rails = DEFAULT_ALE_GUARD_RAILS,
    stats,
  } = options;

  const buckets: Record<Difficulty, Scheda[]> = { facile: [], normale: [], difficile: [] };
  const overflow: Record<Difficulty, AleCandidate[]> = { facile: [], normale: [], difficile: [] };
  const isFull = () => DIFFICULTY_ORDER.every((d) => buckets[d].length >= perTier);

  let attempt = 0;
  while (attempt < maxAttempts && !isFull()) {
    const candidate = nextAleCandidate({ size, freq, trie, rings, calibration, seed, attempt, rails, stats });
    attempt++;
    if (!candidate) continue;
    const bucket = buckets[candidate.difficulty];
    if (bucket.length < perTier) {
      bucket.push(toAleScheda(size, candidate.difficulty, idStart, bucket.length, candidate.grid, candidate.stats));
      if (stats) stats.acceptedAttempt = attempt;
    } else {
      overflow[candidate.difficulty].push(candidate);
    }
  }

  // Ripiego: completa i secchi rimasti incompleti.
  for (const difficulty of DIFFICULTY_ORDER) {
    if (buckets[difficulty].length >= perTier) continue;
    if (stats) stats.fallbacks++;
    // 1) candidati validi (in banda) visti ma non collocati perché il secchio era pieno.
    for (const candidate of [...overflow[difficulty]].sort((a, b) => a.distance - b.distance)) {
      if (buckets[difficulty].length >= perTier) break;
      buckets[difficulty].push(
        toAleScheda(size, difficulty, idStart, buckets[difficulty].length, candidate.grid, candidate.stats),
      );
    }
    // 2) rilancio del flusso con i soli rails + range globale (banda di fascia ignorata).
    const relaxed: AleCalibration = {
      ...calibration,
      tiers: calibration.tiers.map((t) => ({ ...t, wordRange: { ...calibration.wordRange } })),
    };
    let extra = 0;
    while (buckets[difficulty].length < perTier && extra < maxAttempts) {
      const candidate = nextAleCandidate({
        size,
        freq,
        trie,
        rings,
        calibration: relaxed,
        seed,
        attempt: attempt + extra,
        rails,
        stats,
      });
      extra++;
      if (candidate && candidate.difficulty === difficulty) {
        buckets[difficulty].push(
          toAleScheda(size, difficulty, idStart, buckets[difficulty].length, candidate.grid, candidate.stats),
        );
      }
    }
  }

  return buckets;
}

/** Costruisce la `Scheda` finale. `position` è la posizione di riempimento del secchio (0-based). */
export function toAleScheda(
  size: GridSize,
  difficulty: Difficulty,
  idStart: number,
  position: number,
  grid: Grid,
  stats: AleBoardStats,
): Scheda {
  const words = [...stats.words].sort((a, b) => b.length - a.length || a.localeCompare(b, 'it'));
  return {
    id: `${size}-${difficulty}-${String(idStart + position).padStart(3, '0')}`,
    size,
    difficulty,
    variant: 'ale',
    grid: gridToRows(grid),
    words,
    allWords: words,
    longest: stats.longest,
  };
}

/**
 * Utilità per gli script: campione di statistiche su `n` griglie.
 *
 * Firma aggiornata (niente `common`/`lemmas`, dentro `rings`):
 * `sampleAleBoards(size, freq, trie, rings, n, masterSeed, rails, stats)`.
 */
export function sampleAleBoards(
  size: GridSize,
  freq: AleFrequency,
  trie: TrieNode,
  rings: AleRings,
  n: number,
  masterSeed = 0,
  rails: AleGuardRails = DEFAULT_ALE_GUARD_RAILS,
  stats?: AleGenerationStats,
): AleBoardStats[] {
  const out: AleBoardStats[] = [];
  for (let i = 0; i < n; i++) {
    const rng = mulberry32((masterSeed + i + 1) >>> 0);
    const grid = generateAleGrid(size, freq, rng, trie, rails, 200, stats);
    if (!grid) {
      if (stats) stats.noGrid++;
      continue;
    }
    out.push(scoreAleBoard(grid, trie, { minLength: 3, limit: 50_000, rings }));
  }
  return out;
}
