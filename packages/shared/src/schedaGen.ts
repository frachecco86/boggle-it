/**
 * Generazione di schede: griglia + soluzione verificata e filtrata.
 *
 * Perché offline (o da admin) e non a runtime per ogni partita:
 *  - le schede si possono filtrare per qualità (numero di parole, parola lunga),
 *    cosa impossibile senza risolvere la griglia;
 *  - risolvere la griglia durante una partita multiplayer è spreco (e la soluzione
 *    non sarebbe uguale per tutti);
 *  - la stessa scheda può essere rigiocata e confrontata.
 *
 * ============================================================================
 * COME FUNZIONA
 * ============================================================================
 *
 *   1. TRE TRIE PER FASCIA DI FREQUENZA (non tre liste curate a mano):
 *      facile = prime  5.000 parole italiane più frequenti
 *      normale = prime 20.000
 *      difficile = prime 60.000
 *      Da qui vengono le parole ATTESE (`words`): su queste si misura la densità
 *      della scheda e sono quelle mostrate nel riepilogo. Niente rank per parola
 *      e niente "% di parole comuni" da calcolare dopo.
 *
 *   2. COMPOSIZIONE CONTROLLATA PER DIFFICOLTÀ (vedi `grid.ts`): quota di vocali
 *      e tetto alle lettere rare. Le griglie facili hanno vocali e consonanti
 *      comuni, quelle difficili più consonanti rare.
 *
 *      PERCHÉ NON SI CAMPIONANO LE LETTERE DALLA FASCIA (come nella prima
 *      versione dell'algoritmo): misurato, le statistiche di lettera
 *      dell'italiano NON cambiano con la frequenza — vocali 45,6% nel top 5k e
 *      45,0% nel 20k–60k, lettere rare 1,14% contro 1,24%. Campionando dalla
 *      fascia, le tre difficoltà producevano la STESSA griglia. La composizione
 *      resta quindi controllata (ed è la leva che si sente giocando).
 *
 *   3. SOLVE sul DIZIONARIO INTERO → `allWords`: sono le parole che il giocatore
 *      può trovare, e su queste si misura la densità della scheda (vedi il punto
 *      della misura più sotto). Un secondo solve sul trie della fascia → `words`:
 *      le parole ATTESE (le più frequenti componibili), quelle mostrate nel
 *      riepilogo "parole che esistevano". `words` è un sottoinsieme di `allWords`.
 *
 *   4. FILTRO DI QUALITÀ, due sole condizioni, entrambe su `allWords`:
 *      - densità: numero di parole dentro la banda `[min, max]` della coppia
 *        dimensione × difficoltà;
 *      - almeno UNA parola lunga (vicina al massimo della griglia): evita griglie
 *        fatte solo di parole corte.
 *
 *      PERCHÉ LA DENSITÀ SI MISURA SUL DIZIONARIO INTERO e non sul trie della
 *      fascia (come nella prima versione): misurato, contando le parole della
 *      fascia il numero si INVERTE fra i livelli — un trie da 60k parole trova
 *      più parole di uno da 5k, quindi "facile" risultava più povero di
 *      "difficile" (mediane su 4×4: 17 / 20 / 16). Contando le parole che il
 *      giocatore può davvero trovare la scala è quella giusta: 79 / 45 / 24 su
 *      4×4, 175 / 125 / 67 su 5×5, 314 / 207 / 131 su 6×6.
 *
 *   5. RETRY: fino a `maxAttempts` griglie; se nessuna passa si tiene quella più
 *      vicina al centro della banda (ripiego, segnalato da `verify:schede`).
 *
 * I numeri delle bande (`DENSITY`, `MIN_LONGEST`) sono MISURATI: vedi
 * `pnpm --filter @boggle/server measure:schede`.
 */
import type { Difficulty } from './difficulty.js';
import { COMPOSITION, FULL_COMPOSITION, generateGrid, gridStructureIssues, type DifficultyComposition } from './grid.js';
import { gridToRows, type Scheda, type SchedaVariant } from './scheda.js';
import { solveGrid, type TrieNode } from './solver.js';
import type { GridSize } from './types.js';

/** Trie per fascia di difficoltà. */
export interface SchedaTries {
  /** Dizionario intero (tutte le parole giocabili): serve per `allWords`. */
  full: TrieNode;
  /** Un trie per difficoltà, costruito sulle parole più frequenti della fascia. */
  bands: Record<Difficulty, TrieNode>;
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
   * Insieme di criteri: `standard` (predefinito) o `full` ("full criteria",
   * vedi `FULL_SPEC`). Le schede generate portano l'etichetta in `variant`.
   */
  variant?: SchedaVariant;
}

/**
 * Quante parole (le più frequenti) entrano nel trie di ogni fascia.
 *
 * Sono la MANOPOLA della difficoltà: fasce più strette = meno parole comuni in
 * griglia. I valori sono quelli dell'algoritmo (5k / 20k / 60k).
 */
export const BAND_SIZES: Record<Difficulty, number> = {
  facile: 5_000,
  normale: 20_000,
  difficile: 60_000,
};

/** Nome della fascia usata da ogni difficoltà (per test e diagnostica). */
export function bandNameFor(difficulty: Difficulty): keyof SchedaTries['bands'] {
  return difficulty;
}

/**
 * Insieme di criteri di generazione. Ce ne sono due, selezionabili in partita:
 *  - `standard`: il modello storico (composizione di `COMPOSITION`, densità e
 *    parola lunga misurate);
 *  - `full`: i "full criteria" della pagina *Criteri generazione schede* —
 *    rapporto vocali/consonanti per livello, frequenza delle lettere controllata
 *    dal pool di consonanti, numero di parole per dimensione × livello, parole
 *    ancora e lunghezza media.
 */
export interface SchedaSpec {
  /** Composizione della griglia per difficoltà. */
  composition: Record<Difficulty, DifficultyComposition>;
  /** Banda di densità: quante parole accettate. */
  density: Record<GridSize, Record<Difficulty, { min: number; max: number }>>;
  /** Parole "ancora": almeno `count` parole di almeno `length` lettere. */
  anchors: Record<GridSize, Record<Difficulty, { length: number; count: number }>>;
  /**
   * Richiede che la griglia non abbia zone morte (vedi `gridStructureIssues`):
   * nessuna consonante senza vocale vicina, nessuna riga/colonna senza vocali,
   * nessun `h` senza `c`/`g`. Attivo nei "full criteria".
   */
  requirePlayableStructure?: boolean;
  /**
   * Lunghezza MEDIA delle parole accettate (misurata). È la trasposizione
   * realizzabile del criterio "lunghezza media parole" della pagina: su una 4×4
   * una media di 7+ lettere è impossibile (le parole corte dominano), quindi si
   * usano bande misurate che mantengono l'ordine giusto fra i livelli.
   */
  meanLength?: Record<GridSize, Record<Difficulty, { min: number; max: number }>>;
}

/**
 * Criteri STANDARD (storici).
 *
 * `density` e `anchors` sono MISURATI (`measure:schede`, 300 griglie per
 * configurazione) e vanno in ordine: più parole sui livelli facili, meno su
 * quelli difficili.
 */
const DENSITY: Record<GridSize, Record<Difficulty, { min: number; max: number }>> = {
  4: {
    facile: { min: 46, max: 200 },
    normale: { min: 25, max: 120 },
    difficile: { min: 10, max: 60 },
  },
  5: {
    facile: { min: 95, max: 450 },
    normale: { min: 60, max: 250 },
    difficile: { min: 25, max: 140 },
  },
  6: {
    facile: { min: 200, max: 900 },
    normale: { min: 110, max: 480 },
    difficile: { min: 50, max: 300 },
  },
};

/**
 * Parole lunghe richieste dai criteri standard: "una parola vicina al massimo
 * della griglia". Su una 4×4 il massimo realistico è ~7, quindi si chiede almeno
 * una parola da 6; su 5×5 da 7; su 6×6 da 8.
 */
const MIN_LONGEST: Record<GridSize, number> = { 4: 6, 5: 7, 6: 8 };

const STANDARD_SPEC: SchedaSpec = {
  composition: COMPOSITION,
  density: DENSITY,
  anchors: {
    4: {
      facile: { length: MIN_LONGEST[4], count: 1 },
      normale: { length: MIN_LONGEST[4], count: 1 },
      difficile: { length: MIN_LONGEST[4], count: 1 },
    },
    5: {
      facile: { length: MIN_LONGEST[5], count: 1 },
      normale: { length: MIN_LONGEST[5], count: 1 },
      difficile: { length: MIN_LONGEST[5], count: 1 },
    },
    6: {
      facile: { length: MIN_LONGEST[6], count: 1 },
      normale: { length: MIN_LONGEST[6], count: 1 },
      difficile: { length: MIN_LONGEST[6], count: 1 },
    },
  },
};

/**
 * Criteri FULL "Criteri generazione schede".
 *
 * Il numero di parole è quello della pagina ("numero minimo di parole", "numero
 * di parole", "< N parole"); le "parole ancora" diventano i requisiti di
 * lunghezza; la composizione è in `FULL_COMPOSITION` (rapporto vocali/consonanti
 * per livello + frequenza delle lettere).
 *
 * NON implementati (non misurabili nel generatore):
 *  - **morfologia e desinenze** (cluster di suffissi, radici comuni): servirebbe
 *    un'analisi morfologica delle parole. In parte lo fa già la fascia di
 *    frequenza: le parole del top 5k hanno desinenze regolari, quelle del 60k no;
 *  - **geometria dei percorsi** (lineare / a L / a serpentina): servirebbe il
 *    tracciato di ogni parola trovata, non solo la parola.
 */
const FULL_SPEC: SchedaSpec = {
  composition: FULL_COMPOSITION,
  /*
   * Bande CHIUSE su entrambi i lati.
   *
   * I criteri della pagina danno un solo limite: "numero minimo di parole" per
   * il facile, "< N parole" per il difficile. Con un limite solo la banda è
   * larga quanto la distribuzione naturale (2-3×), e la disparità si vede nel
   * catalogo (4×4 difficile: 15–42 parole, 27–76 punti). Il lato mancante è
   * MISURATO (`measure:schede --variant full`): tetto ≈ p75 per il facile,
   * minimo ≈ mediana per il difficile.
   *
   * La banda sul PUNTEGGIO non serve: misurato, r(parole, punti) = 0,99 (98%
   * della varianza dei punti è spiegata dal numero di parole) e i punti per
   * parola variano solo ±10-15%. Stringere il numero di parole stringe i punti.
   */
  density: {
    4: {
      facile: { min: 121, max: 170 }, // "> 120" + tetto misurato
      normale: { min: 60, max: 100 },
      difficile: { min: 25, max: 44 }, // "< 45" + minimo misurato
    },
    5: {
      facile: { min: 201, max: 300 },
      normale: { min: 100, max: 160 },
      difficile: { min: 38, max: 79 },
    },
    6: {
      facile: { min: 351, max: 560 },
      normale: { min: 180, max: 280 },
      difficile: { min: 75, max: 129 },
    },
  },
  anchors: {
    4: {
      facile: { length: 6, count: 2 }, // 2–4 parole di 6+ lettere
      normale: { length: 5, count: 1 },
      difficile: { length: 5, count: 1 },
    },
    5: {
      facile: { length: 7, count: 2 }, // "multiple parole da 7+"
      normale: { length: 6, count: 3 }, // 3–5 parole da 6–7 lettere
      difficile: { length: 6, count: 1 },
    },
    6: {
      facile: { length: 8, count: 2 }, // parole di 8+ lettere
      normale: { length: 7, count: 4 }, // 4–6 parole da 7–8 lettere
      difficile: { length: 8, count: 1 },
    },
  },
  requirePlayableStructure: true,
  /*
   * Lunghezza MEDIA delle parole accettate: bande MISURATE, con l'ordine reale.
   *
   * Il file chiede 3–5 lettere per il facile e 7+ per il difficile. Su griglie
   * reali la direzione è INVERTITA — facile 4,4 · normale 4,1 · difficile 3,8 su
   * 4×4 — perché con vocali e consonanti comuni si formano parole lunghe (poche
   * lettere "chiuse"), mentre gli incontri consonantici del difficile producono
   * molte parole corte. Su una 4×4 una media di 7 lettere è comunque impossibile:
   * le parole corte dominano sempre.
   *
   * Il criterio resta utile così: dice che una scheda facile deve avere parole
   * mediamente lunghe (è il segno di una griglia ricca), non solo tante parole.
   */
  meanLength: {
    4: {
      facile: { min: 4.15, max: 4.7 },
      normale: { min: 3.85, max: 4.3 },
      difficile: { min: 3.55, max: 4.05 },
    },
    5: {
      facile: { min: 4.55, max: 5.1 },
      normale: { min: 4.15, max: 4.7 },
      difficile: { min: 3.7, max: 4.25 },
    },
    6: {
      facile: { min: 4.85, max: 5.35 },
      normale: { min: 4.3, max: 4.85 },
      difficile: { min: 3.9, max: 4.5 },
    },
  },
};

export const SPECS: Record<SchedaVariant, SchedaSpec> = {
  standard: STANDARD_SPEC,
  full: FULL_SPEC,
};

/*
 * Tolleranza sul numero di parole quando si verifica una scheda già generata: il
 * generatore usa `[min, max]` tassativi, il verificatore un margine più largo per
 * non segnalare differenze introdotte da un dizionario leggermente diverso.
 */
const DENSITY_TOLERANCE = 0.15;

/**
 * Tetto sulle parole enumerate per griglia.
 *
 * Per la FASCIA è una rete di sicurezza (le fasce arrivano a poche centinaia di
 * parole); per il dizionario INTERO deve essere alto, altrimenti l'elenco
 * accettato verrebbe troncato e qualche parola valida verrebbe rifiutata in
 * partita. `verify:schede` controlla che il tetto non sia mai stato raggiunto.
 */
const BAND_SOLVE_LIMIT = 3_000;
const FULL_SOLVE_LIMIT = 50_000;

/** Criteri esposti agli strumenti di verifica (una sola fonte di verità). */
export const SCHEDA_CRITERIA = {
  specs: SPECS,
  bandSizes: BAND_SIZES,
  densityTolerance: DENSITY_TOLERANCE,
  bandSolveLimit: BAND_SOLVE_LIMIT,
  fullSolveLimit: FULL_SOLVE_LIMIT,
} as const;

/** Banda di densità (numero di parole accettate) per dimensione, difficoltà e criterio. */
export function densityBandFor(
  size: GridSize,
  difficulty: Difficulty,
  variant: SchedaVariant = 'standard',
) {
  return SPECS[variant].density[size][difficulty];
}

/** Parole "ancora" richieste, per dimensione, difficoltà e criterio. */
export function anchorFor(
  size: GridSize,
  difficulty: Difficulty,
  variant: SchedaVariant = 'standard',
): { length: number; count: number } {
  return SPECS[variant].anchors[size][difficulty];
}

/* ------------------------------------------------------------------ */
/* Generazione                                                         */
/* ------------------------------------------------------------------ */

/**
 * Genera una scheda di qualità, o `null` se nessun tentativo la soddisfa.
 *
 * Criteri (tutti verificati a ogni tentativo, secondo `SPECS[variant]`):
 *  1. DENSITÀ — numero di parole accettate dentro `[min, max]`.
 *  2. PAROLE ANCORA — almeno N parole di almeno L lettere.
 *  3. LUNGHEZZA MEDIA (solo "full criteria") — dentro la banda misurata.
 *
 * Il risultato porta `words` (parole attese della fascia), `allWords` (tutte le
 * accettate, entrambi ordinati per lunghezza decrescente) e `variant`.
 */
export function generateScheda(options: GenerateSchedaOptions): Scheda | null {
  const { size, difficulty, tries } = options;
  const variant: SchedaVariant = options.variant ?? 'standard';
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 400;
  const bandTrie = tries.bands[difficulty];
  const spec = SPECS[variant];

  const band = spec.density[size][difficulty];
  const anchor = spec.anchors[size][difficulty];
  const meanBand = spec.meanLength?.[size]?.[difficulty];

  /*
   * Candidato di ripiego: la griglia più vicina alla banda vista finora.
   *
   * Perché serve: se dopo `maxAttempts` nessuna griglia soddisfa i criteri,
   * `null` farebbe riprovare il pool all'infinito senza produrre schede. Il
   * ripiego è comunque una griglia valida e risolta, solo fuori banda.
   *
   * ATTENZIONE: il ripiego va EVITATO per quanto possibile — se scatta spesso, il
   * catalogo contiene schede che non rispettano la difficoltà dichiarata. Lo
   * script `verify:schede` le segnala. Se succede, allargare la banda in `SPECS`.
   */
  let best: {
    grid: ReturnType<typeof generateGrid>;
    allWords: string[];
    distance: number;
  } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Griglia con la composizione della difficoltà (vocali, rare, consonanti).
    const grid = generateGrid(size, rng, difficulty, spec.composition[difficulty]);
    /*
     * Struttura giocabile PRIMA del solve: costa pochissimo e scarta subito le
     * griglie con zone morte (consonanti isolate, righe/colonne senza vocali,
     * `h` inutili). Vedi `gridStructureIssues` per le misure che l'hanno motivata.
     */
    const structureIssues = spec.requirePlayableStructure ? gridStructureIssues(grid) : [];

    /*
     * Le parole che il giocatore PUÒ trovare: si risolve sul dizionario intero.
     * È anche l'insieme che il gioco accetta in partita (`allWords`), quindi
     * questo solve serve sia al filtro sia al risultato: nessuno spreco.
     */
    const allWords = solveGrid(grid, tries.full, { limit: FULL_SOLVE_LIMIT, minLength: 3 });

    let longest = 0;
    let anchorCount = 0;
    let totalLength = 0;
    for (const w of allWords) {
      if (w.length > longest) longest = w.length;
      if (w.length >= anchor.length) anchorCount++;
      totalLength += w.length;
    }
    const meanLength = allWords.length > 0 ? totalLength / allWords.length : 0;

    /*
     * Distanza dal centro della banda, normalizzata: usata solo per scegliere il
     * ripiego. Somma gli scostamenti (parole, parole ancora, lunghezza media) e i
     * difetti di struttura, così il ripiego resta il più vicino possibile ai
     * criteri anche quando nessuna griglia li soddisfa tutti.
     */
    const mid = (band.min + band.max) / 2;
    const distance =
      Math.abs(allWords.length - mid) / Math.max(1, mid) +
      Math.max(0, anchor.count - anchorCount) / Math.max(1, anchor.count) +
      (meanBand ? Math.max(0, meanBand.min - meanLength) / meanBand.min : 0) +
      structureIssues.length * 0.5;
    if (!best || distance < best.distance) best = { grid, allWords, distance };

    // 0. Struttura: niente zone morte (se richiesto dai criteri).
    if (structureIssues.length > 0) continue;
    // 1. Densità: quante parole si possono trovare, nella banda della difficoltà.
    if (allWords.length < band.min || allWords.length > band.max) continue;
    // 2. Parole ancora lunghe a sufficienza.
    if (anchorCount < anchor.count) continue;
    // 3. Lunghezza media nella banda (solo "full criteria").
    if (meanBand && (meanLength < meanBand.min || meanLength > meanBand.max)) continue;

    return toScheda(options, size, difficulty, variant, grid, allWords, bandTrie);
  }

  if (best) return toScheda(options, size, difficulty, variant, best.grid, best.allWords, bandTrie);
  return null;
}

/**
 * Compone la `Scheda` finale.
 *
 * `allWords` (dizionario intero) è già calcolato: è l'insieme accettato in
 * partita. Qui si aggiungono le parole ATTESE della fascia, cioè le più
 * frequenti componibili sulla griglia: si risolvono una volta sola, sulla
 * griglia accettata, perché servono solo al riepilogo.
 */
function toScheda(
  options: GenerateSchedaOptions,
  size: GridSize,
  difficulty: Difficulty,
  variant: SchedaVariant,
  grid: ReturnType<typeof generateGrid>,
  allWords: string[],
  bandTrie: TrieNode,
): Scheda {
  const words = solveGrid(grid, bandTrie, { limit: BAND_SOLVE_LIMIT, minLength: 3 });
  return {
    id: options.id ?? '',
    size,
    difficulty,
    variant,
    grid: gridToRows(grid),
    words,
    allWords,
    longest: allWords[0]?.length ?? 0,
  };
}
