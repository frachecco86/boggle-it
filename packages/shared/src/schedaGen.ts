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
}

/**
 * Requisiti minimi di qualità per dimensione e difficoltà.
 * Derivati dalle misure: le griglie comuni raggiungono 7/8/9 lettere nel 35-45%
 * dei casi, quindi il filtro non è proibitivo.
 */
/**
 * Requisiti di qualità per una scheda: quante parole per OGNI fascia di lunghezza.
 *
 * Perché per fasce e non un solo conteggio: prima si richiedeva "almeno 1 parola
 * lunga" e bastava, quindi quasi ogni scheda aveva UNA parola da 7 e nulla di più.
 * Ora ogni scheda deve avere PIÙ parole lunghe, distribuite sulle varie lunghezze.
 *
 * Le soglie sono state tarate misurando la fattibilità con il LESSICO COMUNE
 * (non col dizionario intero): tutte le configurazioni si ottengono in ~5-25
 * tentativi, quindi la generazione resta veloce.
 *
 * Nota sulla dimensione: su 4×4 le parole da 9+ sono di fatto impossibili
 * (la parola più lunga in media è 6,4 lettere: servono 9 celle adiacenti in
 * sequenza su 16 disponibili). Su 5×5 si arriva a 9, su 6×6 a 10 e oltre.
 */
const QUALITY: Record<GridSize, {
  /** Parole minime in totale (evita schede con pochissime parole). */
  minWords: number;
  /** Numero minimo di parole per ogni soglia di lunghezza. */
  minByLength: { length: number; count: number }[];
}> = {
  4: {
    minWords: 12,
    // 9+ impossibile su 16 celle.
    minByLength: [
      { length: 7, count: 2 },
      { length: 8, count: 1 },
    ],
  },
  5: {
    minWords: 25,
    minByLength: [
      { length: 7, count: 5 },
      { length: 8, count: 2 },
      { length: 9, count: 1 },
    ],
  },
  6: {
    minWords: 45,
    minByLength: [
      { length: 7, count: 10 },
      { length: 8, count: 5 },
      { length: 9, count: 3 },
      { length: 10, count: 1 },
    ],
  },
};

/**
 * Dizionario usato per risolvere la griglia.
 *
 * TUTTI i livelli usano il LESSICO COMUNE. Prima `normale` e `difficile` usavano il
 * dizionario completo (387k forme) e solo il 46% delle parole era di uso comune:
 * uscivano termini astrusi come `contumace` o `sbrecciare`. Ora la difficoltà è data
 * dalla GRIGLIA (meno vocali, più consonanti rare), non da parole oscure.
 *
 * Il dizionario completo resta disponibile per usi futuri (es. una modalità "esperto").
 */
export function solvingTrieFor(_difficulty: Difficulty): 'common' | 'full' {
  return 'common';
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
  const trie = solvingTrieFor(difficulty) === 'common' ? tries.common : tries.full;

  const rules = QUALITY[size];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const grid = generateGrid(size, rng, difficulty);
    const words = solveGrid(grid, trie, { limit: 8000, minLength: 3 });

    if (words.length < rules.minWords) continue;

    // Conteggio per lunghezza: una sola passata.
    const byLength = new Map<number, number>();
    let longest = 0;
    for (const w of words) {
      byLength.set(w.length, (byLength.get(w.length) ?? 0) + 1);
      if (w.length > longest) longest = w.length;
    }

    // Ogni soglia richiesta deve essere soddisfatta: "almeno N parole di almeno L lettere".
    // Uso "almeno L" e non "esattamente L", così una parola da 10 conta anche per la
    // soglia delle 9: è ciò che il giocatore percepisce ("ho trovato parole lunghe").
    let ok = true;
    for (const rule of rules.minByLength) {
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

    const entries = [...words].sort((a, b) => b.length - a.length || a.localeCompare(b));

    return {
      id: options.id ?? '',
      size,
      difficulty,
      grid: gridToRows(grid),
      words: entries,
      longest,
    };
  }

  return null;
}
