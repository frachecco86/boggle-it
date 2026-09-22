/**
 * Generazione di schede: griglia + soluzione completa, verificata e filtrata.
 *
 * Perché offline (o da admin) e non a runtime per ogni partita:
 * Perché offline (o da admin) e non a runtime per ogni partita:
 *  - le schede si possono filtrare per qualità (numero di parole, parole lunghe),
 *    cosa impossibile senza risolvere la griglia;
 *  - risolvere la griglia durante una partita multiplayer è spreco (e la soluzione
 *    non sarebbe uguale per tutti);
 *  - la stessa scheda può essere rigiocata e confrontata.
 *
 * Il filtro chiave è la DENSITÀ DI PAROLE. Tutti i livelli risolvono contro il
 * dizionario completo; la difficoltà è il numero di parole trovabili (e il
 * punteggio massimo che ne deriva), imposto con una banda per dimensione.
 * La composizione della griglia (vocali/rare) è solo un mezzo per generare
 * candidate plausibili: da sola separa poco i livelli (mediane 59/55/50 su 4×4).
 */
import type { Difficulty } from './difficulty.js';
import { generateGrid } from './grid.js';
import { gridToRows, type Scheda } from './scheda.js';
import { solveGrid, type TrieNode } from './solver.js';
import type { GridSize } from './types.js';

/** Trie del dizionario usato per risolvere le griglie. */
export interface SchedaTries {
  /** Dizionario completo (tutte le parole giocabili). */
  full: TrieNode;
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

/**
 * Criteri di LUNGHEZZA per dimensione, indipendenti dalla difficoltà.
 *
 * La densità (numero di parole) è invece per difficoltà: vedi `DENSITY`.
 */
const SHAPE: Record<GridSize, {
  /** Lunghezze che DEVONO esistere almeno una volta ciascuna. */
  oneEachOf: number[];
  /** Soglie "almeno N parole di almeno L lettere". */
  minByLength: { length: number; count: number }[];
}> = {
  4: {
    minByLength: [
      { length: 5, count: 5 },
      { length: 6, count: 2 },
    ],
    // 7+ raggiungibile solo di rado su 16 celle: non lo impongo come scala.
    oneEachOf: [4, 5],
  },
  5: {
    minByLength: [
      { length: 6, count: 12 },
      { length: 7, count: 3 },
    ],
    oneEachOf: [5, 6, 7],
  },
  6: {
    minByLength: [
      { length: 6, count: 25 },
      { length: 7, count: 7 },
      { length: 8, count: 2 },
    ],
    oneEachOf: [5, 6, 7],
  },
};

/**
 * Obiettivo di DENSITÀ per dimensione × difficoltà.
 *
 * `min` / `max` sono i confini del numero di parole trovabili ammesso. Sono
 * MISURATI (200-500 griglie per configurazione sul dizionario della Fase 1):
 * centrati in modo che il generatore li soddisfi in fretta senza scartare troppo.
 *
 * Perché questi valori: la composizione delle lettere da sola produce su 4×4
 * mediane 59/55/50 parole — indistinguibili. Imporre la densità è ciò che rende
 * "facile" davvero ricco (≥ ~80 parole) e "difficile" davvero selettivo (≤ ~35).
 *
 * `scoreMin` / `scoreMax` accompagnano la densità: senza di essi una griglia con
 * moltissime parole brevissime passerebbe come "facile" pur valendo poco. Il
 * punteggio massimo è la somma dei punti di tutte le parole (massimo teorico).
 */
const DENSITY: Record<GridSize, Record<Difficulty, {
  /** Parole minime trovabili. */
  min: number;
  /** Parole massime trovabili. */
  max: number;
  /** Punteggio massimo minimo. */
  scoreMin: number;
  /** Punteggio massimo massimo. */
  scoreMax: number;
}>> = {
  4: {
    facile: { min: 85, max: 190, scoreMin: 230, scoreMax: 700 },
    normale: { min: 38, max: 75, scoreMin: 90, scoreMax: 220 },
    difficile: { min: 14, max: 34, scoreMin: 28, scoreMax: 95 },
  },
  5: {
    facile: { min: 185, max: 360, scoreMin: 520, scoreMax: 1500 },
    normale: { min: 85, max: 165, scoreMin: 200, scoreMax: 520 },
    difficile: { min: 32, max: 80, scoreMin: 75, scoreMax: 230 },
  },
  6: {
    facile: { min: 360, max: 750, scoreMin: 1150, scoreMax: 3200 },
    normale: { min: 165, max: 320, scoreMin: 420, scoreMax: 1000 },
    difficile: { min: 65, max: 155, scoreMin: 150, scoreMax: 420 },
  },
};

/*
 * Tolleranza sul numero di parole quando si verifica una scheda già generata:
 * il generatore usa `[min, max]` tassativi, il verificatore un margine più largo
 * per non segnalare differenze introdotte da un dizionario leggermente diverso.
 */
const DENSITY_TOLERANCE = 0.1;

/**
 * Tetto sulle parole enumerate per griglia: non serve elencarle tutte per
 * verificare i criteri, e su 6×6 una griglia ricca può superarne 2000. Il taglio
 * è per lunghezza decrescente, quindi se scatta perdiamo le parole PIÙ CORTE (le
 * meno interessanti) e i criteri restano validi. Con 3000 non è mai scattato
 * nelle misure: è una rete di sicurezza.
 */
const SOLVE_LIMIT = 3000;

/**
 * Dizionario usato per risolvere la griglia.
 *
 * TUTTI i livelli usano il dizionario COMPLETO: la decisione di prodotto è che
 * ogni parola di >=3 lettere è giocabile, e la difficoltà la dà la DENSITÀ di
 * parole, non il lessico. (Prima i livelli facili usavano i soli ~60k comuni,
 * ma il loro tetto realistico su 4×4 è ~29 parole: troppo basso per un livello
 * "ricco", e non separava i livelli.)
 */
export function solvingTrieFor(_difficulty: Difficulty): 'common' | 'full' {
  return 'full';
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
  /** Requisiti di lunghezza per dimensione. */
  shape: SHAPE,
  /** Banda di densità (parole + punteggio) per dimensione × difficoltà. */
  density: DENSITY,
  /** Tolleranza usata dal verificatore sui confini di densità. */
  densityTolerance: DENSITY_TOLERANCE,
  /** Limite di sicurezza sul numero di parole enumerate per griglia. */
  solveLimit: SOLVE_LIMIT,
  /** Punteggio massimo di una scheda: somma dei punti di tutte le parole. */
  maxScore: (words: readonly string[]): number =>
    words.reduce((total, w) => total + (w.length - 2), 0),
} as const;

/** Banda di densità (parole e punteggio) per dimensione e difficoltà. */
export function densityBandFor(size: GridSize, difficulty: Difficulty) {
  return DENSITY[size][difficulty];
}

/**
 * Scala di lunghezze che DEVONO esistere in una scheda, per dimensione.
 * Indipendente dalla difficoltà: garantisce che ci sia sempre una parola lunga
 * trovabile, anche nei livelli con poche parole.
 */
export function requiredLengthsFor(size: GridSize, _difficulty: Difficulty): number[] {
  return [...SHAPE[size].oneEachOf];
}

/**
 * Soglie di lunghezza effettive ("almeno N parole di almeno L lettere").
 * Indipendenti dalla difficoltà: sono un presidio sulla presenza di parole
 * lunghe, non un criterio di difficoltà.
 */
export function minByLengthFor(
  size: GridSize,
  _difficulty: Difficulty,
): Array<{ length: number; count: number }> {
  return SHAPE[size].minByLength.map((rule) => ({ ...rule }));
}

/**
 * Genera una scheda di qualità, o `null` se nessun tentativo la soddisfa.
 *
 * Criteri (tutti verificati a ogni tentativo):
 *  1. DENSITÀ — numero di parole trovabili dentro `[min, max]` della difficoltà.
 *     È il criterio che DEFINISCE la difficoltà (più parole = più facile).
 *  2. PUNTEGGIO — punteggio massimo dentro `[scoreMin, scoreMax]`. Evita che una
 *     griglia di sole parole cortissime passi come "facile".
 *  3. LUNGHEZZA — ogni lunghezza della scala deve esistere, più un minimo di
 *     parole lunghe: garantisce che ci sia sempre qualcosa di soddisfacente
 *     anche nei livelli con poche parole.
 *
 * Il risultato contiene TUTTE le parole trovabili, ordinate per lunghezza
 * decrescente.
 */
export function generateScheda(options: GenerateSchedaOptions): Scheda | null {
  const { size, difficulty, tries } = options;
  const rng = options.rng ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 400;
  // Tutti i livelli risolvono sul dizionario completo (vedi `solvingTrieFor`).
  const trimmed = tries.full;

  const band = DENSITY[size][difficulty];
  const requiredLengths = requiredLengthsFor(size, difficulty);
  const minByLength = minByLengthFor(size, difficulty);

  /*
   * Candidato di ripiego: la griglia più vicina alla banda vista finora.
   *
   * Perché serve: se dopo `maxAttempts` nessuna griglia soddisfa TUTTI i criteri,
   * `null` farebbe riprovare il pool all'infinito senza produrre schede. Il
   * ripiego è comunque una griglia valida e risolta, solo fuori banda.
   *
   * ATTENZIONE: il ripiego va EVITATO per quanto possibile — se scatta spesso,
   * il catalogo contiene schede che non rispettano la difficoltà dichiarata. Lo
   * script `verify:schede` le segnala. Se succede, allargare la banda in `DENSITY`.
   */
  let best: { grid: ReturnType<typeof generateGrid>; words: string[]; distance: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = generateGrid(size, rng, difficulty);
    const words = solveGrid(grid, trimmed, { limit: SOLVE_LIMIT, minLength: 3 });

    // Una sola passata per lunghezze e punteggio.
    const byLength = new Map<number, number>();
    let longest = 0;
    let score = 0;
    for (const w of words) {
      byLength.set(w.length, (byLength.get(w.length) ?? 0) + 1);
      if (w.length > longest) longest = w.length;
      score += w.length - 2;
    }

    /*
     * Distanza dal centro della banda, normalizzata: usata solo per scegliere il
     * ripiego. Sommare gli scostamenti di parole e punteggio evita di preferire
     * una griglia con tantissime parole ma punteggio bassissimo (o viceversa).
     */
    const wordsMid = (band.min + band.max) / 2;
    const scoreMid = (band.scoreMin + band.scoreMax) / 2;
    const distance =
      Math.abs(words.length - wordsMid) / Math.max(1, wordsMid) +
      Math.abs(score - scoreMid) / Math.max(1, scoreMid);
    if (!best || distance < best.distance) best = { grid, words, distance };

    // 1. Densità: numero di parole nella banda della difficoltà.
    if (words.length < band.min || words.length > band.max) continue;
    // 2. Punteggio massimo nella banda.
    if (score < band.scoreMin || score > band.scoreMax) continue;

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
