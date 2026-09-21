/**
 * Generazione di schede: griglia + soluzione completa, verificata e filtrata.
 *
 * Perché offline (o da admin) e non a runtime per ogni partita:
 *  - le schede si possono filtrare per qualità (parole lunghe, parole comuni nei
 *    livelli facili), cosa impossibile senza risolvere la griglia;
 *  - risolvere la griglia durante una partita multiplayer è spreco (e la soluzione
 *    non sarebbe uguale per tutti);
 *  - la stessa scheda può essere rigiocata e confrontata.
 *
 * Il filtro chiave: nei livelli `molto-facile` e `facile` la griglia viene risolta
 * contro il LESSICO COMUNE, non contro il dizionario intero. Così tutte le parole
 * trovabili sono comuni (niente forme astruse tipo `sbrecciare` o `contumace`).
 * Nei livelli `normale` e `difficile` si usa il dizionario completo, accettando
 * solo griglie che contengono almeno una parola lunga.
 */
import type { Difficulty } from './difficulty.js';
import { generateGrid } from './grid.js';
import { gridToRows, type Scheda } from './scheda.js';
import { solveGrid, type TrieNode } from './solver.js';
import type { GridSize } from './types.js';

/** Trie del dizionario completo e del lessico comune. */
export interface SchedaTries {
  /** Dizionario completo (386k forme). */
  full: TrieNode;
  /** Lessico comune (~60k parole non astruse). */
  common: TrieNode;
}

export interface GenerateSchedaOptions {
  size: GridSize;
  difficulty: Difficulty;
  tries: SchedaTries;
  rng?: () => number;
  /** Tentativi massimi prima di rinunciare (default 400). */
  maxAttempts?: number;
  /** Id assegnato alla scheda (se assente, la generazione non lo popola). */
  id?: string;
  /**
   * Predicato "parola rara": true = fuori dal lessico comune.
   * Serve al criterio di RARITÀ (`maxRareRatio`): nei livelli facili limita
   * quante parole astruse possono finire nella scheda. Se assente, nessuna
   * parola è considerata rara.
   */
  isRare?: (word: string) => boolean;
}

/*
 * ============================================================================
 * CRITERI DI QUALITÀ DI UNA SCHEDA
 * ============================================================================
 *
 * Obiettivo di prodotto: entro la STESSA difficoltà il punteggio massimo di una
 * scheda deve stare in un intervallo prevedibile. Prima variava anche di 7 volte
 * (4×4 facile: 117–870) perché si controllavano solo i minimi, mai il tetto.
 *
 * I criteri sono 5, indipendenti e tutti verificati a ogni tentativo:
 *
 *  1. LESSICO — da quale dizionario si risolve la griglia (comune o intero).
 *     È il criterio che rende un livello "facile": parole che si conoscono.
 *  2. QUANTITÀ — numero minimo di parole trovabili: una scheda con 3 parole
 *     è tecnicamente valida ma noiosa.
 *  3. LUNGHEZZA — scala di lunghezze che DEVONO esistere (almeno una per taglia)
 *     e numero minimo di parole lunghe. Garantisce che premi le parole lunghe.
 *  4. RARITÀ — quota massima di parole fuori dal lessico comune. Nei livelli
 *     facili e normale non deve uscire `contumace` in mezzo a `casa`.
 *  5. BANDA DI PUNTEGGIO — il punteggio massimo (somma dei punti di TUTTE le
 *     parole, cioè il massimo teorico) deve stare in `[target×(1−tol), target×(1+tol)]`.
 *     È il criterio che rende il massimo prevedibile.
 *
 * Le bande sono tarate sulle misure reali (400 griglie per configurazione, vedi
 * i commenti di `BANDS`): sono centrate sul 50° percentile di ciò che la griglia
 * produce davvero con quel lessico, quindi la generazione le soddisfa in fretta.
 *
 * NOTA sulla dimensione: su 4×4 le parole da 9+ sono di fatto impossibili (servono
 * 9 celle adiacenti in sequenza su 16). Su 5×5 si arriva a 9, su 6×6 a 10 e oltre.
 */

/** Criteri per dimensione, indipendenti dalla difficoltà. */
const SHAPE: Record<GridSize, {
  /** Parole minime in totale. */
  minWords: number;
  /** Numero minimo di parole di almeno N lettere. */
  minByLength: { length: number; count: number }[];
  /** Lunghezze che DEVONO esistere almeno una volta ciascuna. */
  oneEachOf: number[];
}> = {
  4: {
    minWords: 18,
    minByLength: [
      { length: 5, count: 5 },
      { length: 6, count: 2 },
    ],
    // 7+ raggiungibile solo di rado su 16 celle: non lo impongo come scala.
    oneEachOf: [4, 5],
  },
  5: {
    minWords: 50,
    minByLength: [
      { length: 6, count: 12 },
      { length: 7, count: 3 },
    ],
    oneEachOf: [5, 6, 7],
  },
  6: {
    minWords: 90,
    minByLength: [
      { length: 6, count: 25 },
      { length: 7, count: 7 },
      { length: 8, count: 2 },
    ],
    oneEachOf: [5, 6, 7],
  },
};

/**
 * Punteggio massimo MEDIANO di una scheda, per dimensione × difficoltà.
 *
 * Valori misurati su 400 griglie per configurazione (`tmp/measure2`): NON sono
 * stimati. Il punteggio dipende dal lessico (comune per i livelli facili, intero
 * per gli altri) oltre che dalla dimensione, quindi serve una matrice e non una
 * base per sola dimensione — era l'errore che faceva scartare quasi tutte le
 * griglie 6×6 e non generare `estremo`.
 */
const TARGET_SCORE: Record<GridSize, Record<Difficulty, number>> = {
  4: { 'molto-facile': 70, facile: 55, normale: 90, difficile: 75, estremo: 50 },
  5: { 'molto-facile': 182, facile: 146, normale: 268, difficile: 183, estremo: 114 },
  6: { 'molto-facile': 334, facile: 278, normale: 445, difficile: 377, estremo: 232 },
};

/**
 * Criteri che dipendono dalla DIFFICOLTÀ: lessico, rarità e banda di punteggio.
 *
 * La banda è ±35% attorno al target misurato. Non è più stretta perché il
 * punteggio dipende da quanti incroci ha la griglia, che non si può pilotare
 * parola per parola: una banda più stretta non produrrebbe schede più uniformi,
 * solo più tentativi scartati (e quindi tempi di generazione alti).
 */
const BAND: Record<Difficulty, {
  /** Dizionario usato per risolvere: 'common' = solo parole di uso comune. */
  lexicon: 'common' | 'full';
  /** Quota MASSIMA di parole fuori dal lessico comune ammessa nella scheda. */
  maxRareRatio: number;
  /**
   * Fattore che scala i requisiti di LUNGHEZZA della dimensione.
   *
   * Perché serve: `estremo` ha pochissime vocali (16–26%), quindi produce molte
   * meno parole lunghe — è la sua natura, non un difetto. Pretendere le stesse
   * soglie degli altri livelli lo faceva finire sempre nel criterio di ripiego.
   * 0.5 dimezza le soglie, `1` le lascia invariate.
   */
  lengthScale: number;
}> = {
  // I livelli facili risolvono solo sul lessico comune: parole di uso quotidiano.
  'molto-facile': { lexicon: 'common', maxRareRatio: 0.02, lengthScale: 1 },
  facile: { lexicon: 'common', maxRareRatio: 0.06, lengthScale: 1 },
  normale: { lexicon: 'full', maxRareRatio: 0.7, lengthScale: 1 },
  difficile: { lexicon: 'full', maxRareRatio: 1.0, lengthScale: 1 },
  estremo: { lexicon: 'full', maxRareRatio: 1.0, lengthScale: 0.5 },
};

/** Tolleranza relativa della banda di punteggio, valida per tutte le difficoltà. */
const SCORE_TOLERANCE = 0.35;

/**
 * Tetto sulle parole enumerate per griglia: non serve elencarle tutte per
 * verificare i criteri, e su 6×6 una griglia ricca può superarne 2000. Il taglio
 * è per lunghezza decrescente, quindi se scatta perdiamo le parole PIÙ CORTE (le
 * meno interessanti) e i criteri restano validi. Con 3000 non è mai scattato
 * nelle misure: è una rete di sicurezza.
 */
const SOLVE_LIMIT = 3000;

/**
 * Dizionario usato per risolvere la griglia in un livello.
 *
 * I livelli facili usano il LESSICO COMUNE: tutte le parole trovabili sono di uso
 * quotidiano (`casa`, `libro`), non forme astruse (`contumace`, `sbrecciare`).
 * Da `normale` in su si usa il dizionario completo e la difficoltà la dà la
 * GRIGLIA (meno vocali, più consonanti rare) più la banda di punteggio.
 */
export function solvingTrieFor(difficulty: Difficulty): 'common' | 'full' {
  return BAND[difficulty].lexicon;
}

/**
 * Criteri di qualità, esposti per gli strumenti di verifica.
 *
 * `pnpm --filter @boggle/server verify:schede` li usa per CONTROLLARE le schede
 * già generate: se qui cambia una soglia, lo script segnala le schede fuori norma
 * senza bisogno di rigenerarle. Tenere i criteri in un solo posto evita che lo
 * script di verifica e il generatore si disallineino (è già successo in passato
 * con i valori di difficoltà).
 */
export const SCHEDA_CRITERIA = {
  /** Requisiti di forma per dimensione (parole, lunghezze, scala). */
  shape: SHAPE,
  /** Lessico, rarità e banda di punteggio per difficoltà. */
  band: BAND,
  /** Punteggio massimo mediano atteso per dimensione × difficoltà. */
  targetScore: TARGET_SCORE,
  /** Tolleranza relativa della banda attorno al target. */
  scoreTolerance: SCORE_TOLERANCE,
  /** Limite di sicurezza sul numero di parole enumerate per griglia. */
  solveLimit: SOLVE_LIMIT,
  /** Punteggio massimo di una scheda: somma dei punti di tutte le parole. */
  maxScore: (words: readonly string[]): number =>
    words.reduce((total, w) => total + (w.length - 2), 0),
} as const;

/** Intervallo di punteggio ammesso per una data dimensione e difficoltà. */
export function scoreBandFor(size: GridSize, difficulty: Difficulty): { min: number; max: number } {
  const target = TARGET_SCORE[size][difficulty];
  return {
    min: Math.round(target * (1 - SCORE_TOLERANCE)),
    max: Math.round(target * (1 + SCORE_TOLERANCE)),
  };
}

/**
 * Scala di lunghezze RICHIESTA per una dimensione e difficoltà.
 *
 * Con `lengthScale < 1` (livelli con pochissime vocali, come `estremo`) si toglie
 * l'ultima taglia: chiedere una parola di 7+ lettere su una 5×5 senza vocali è
 * irrealistico e faceva scartare quasi tutte le griglie.
 */
export function requiredLengthsFor(size: GridSize, difficulty: Difficulty): number[] {
  const shape = SHAPE[size];
  const { lengthScale } = BAND[difficulty];
  return lengthScale >= 1 ? [...shape.oneEachOf] : shape.oneEachOf.slice(0, -1);
}

/**
 * Soglie di lunghezza effettive ("almeno N parole di almeno L lettere").
 * Il conteggio è scalato da `lengthScale`; 0 significa che la soglia non si applica.
 */
export function minByLengthFor(
  size: GridSize,
  difficulty: Difficulty,
): Array<{ length: number; count: number }> {
  const { lengthScale } = BAND[difficulty];
  return SHAPE[size].minByLength
    .map((rule) => ({ length: rule.length, count: Math.ceil(rule.count * lengthScale) }))
    .filter((rule) => rule.count > 0);
}

/**
 * Genera una scheda di qualità, o `null` se nessun tentativo la soddisfa.
 *
 * Il risultato contiene TUTTE le parole trovabili (contro il trie del livello),
 * ordinate per lunghezza decrescente.
 */
export function generateScheda(options: GenerateSchedaOptions): Scheda | null {
  const { size, difficulty, tries } = options;
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 400;
  const isRare = options.isRare;
  const trimmed = solvingTrieFor(difficulty) === 'common' ? tries.common : tries.full;

  const shape = SHAPE[size];
  const band = BAND[difficulty];
  const target = TARGET_SCORE[size][difficulty];
  const minScore = Math.round(target * (1 - SCORE_TOLERANCE));
  const maxScore = Math.round(target * (1 + SCORE_TOLERANCE));
  /*
   * Scala di lunghezze e soglie per fascia, già scalate per la difficoltà
   * (`estremo` ha taglie in meno perché ha poche vocali). Vedi gli helper in
   * fondo al file: sono condivisi col verificatore `verify-schede`.
   */
  const requiredLengths = requiredLengthsFor(size, difficulty);
  const minByLength = minByLengthFor(size, difficulty);
  /*
   * Budget di parole rare, proporzionale al minimo di parole della dimensione:
   * su 4×4 con 18 parole e maxRareRatio 0.02 significa 0 rare su una scala di 18.
   * Usiamo il minimo (non il totale) perché il totale non è noto prima.
   */
  const rarityBudget = Math.max(0, Math.floor(shape.minWords * band.maxRareRatio));

  /*
   * RIPIEGO. Se dopo `maxAttempts` nessuna griglia soddisfa TUTTI i criteri
   * restituiamo la MIGLIORE trovata, invece di `null`.
   *
   * Perché: `null` faceva riprovare il pool all'infinito (fino a 2000 tentativi) e
   * in alcune configurazioni non produceva AFFATTO schede — successo con 6×6 e con
   * `estremo` su 5×5, dove i criteri di forma e la banda non erano compatibili.
   * Con il ripiego il catalogo si genera sempre; la scheda di ripiego è comunque
   * una griglia valida e risolta, solo fuori banda (e viene scelta la più vicina
   * al target, non una a caso).
   */
  let best: { grid: ReturnType<typeof generateGrid>; words: string[]; distance: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = generateGrid(size, rng, difficulty);
    const words = solveGrid(grid, trimmed, { limit: SOLVE_LIMIT, minLength: 3 });

    // 2. Quantità: senza questo minimo la scheda è noiosa per chiunque.
    if (words.length < shape.minWords) continue;

    // Una sola passata per lunghezze, punteggio e rarità.
    const byLength = new Map<number, number>();
    let longest = 0;
    let score = 0;
    let rare = 0;
    for (const w of words) {
      byLength.set(w.length, (byLength.get(w.length) ?? 0) + 1);
      if (w.length > longest) longest = w.length;
      score += w.length - 2;
      if (isRare?.(w)) rare++;
    }

    // Candidato di ripiego: il punteggio più vicino al target visto finora.
    const distance = Math.abs(score - target);
    if (!best || distance < best.distance) best = { grid, words, distance };

    // 5. Banda di punteggio: fuori banda la scheda è scartata subito.
    if (score < minScore || score > maxScore) continue;

    // 3. Scala completa: ogni lunghezza richiesta deve esistere.
    let ok = true;
    for (const len of requiredLengths) {
      if (!byLength.has(len)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // 3b. Soglie per fascia: "almeno N parole di almeno L lettere".
    // Uso "almeno L" e non "esattamente L": una parola da 10 conta anche per la
    // soglia delle 9, che è ciò che il giocatore percepisce ("ho trovato parole lunghe").
    for (const rule of minByLength) {
      let count = 0;
      for (const [len, n] of byLength) {
        if (len >= rule.length) count += n;
      }
      if (count < rule.count) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // 4. Rarità: quante parole fuori dal lessico comune.
    if (rare > rarityBudget) continue;

    return toScheda(options, size, difficulty, grid, words);
  }

  if (best) return toScheda(options, size, difficulty, best.grid, best.words);
  return null;
}

/** Compone la `Scheda` finale ordinando le parole per lunghezza decrescente. */
function toScheda(
  options: GenerateSchedaOptions,
  size: GridSize,
  difficulty: Difficulty,
  grid: ReturnType<typeof generateGrid>,
  words: string[],
): Scheda {
  const entries = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));
  return {
    id: options.id ?? '',
    size,
    difficulty,
    grid: gridToRows(grid),
    words: entries,
    longest: entries[0]?.length ?? 0,
  };
}
