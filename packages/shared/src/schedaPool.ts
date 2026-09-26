/**
 * Facade per generare le schede, indipendente dal file system.
 * Usata sia dallo script CLI (`pnpm gen:schede`) sia dall'endpoint admin del server.
 *
 * Costruisce i quattro trie dell'algoritmo (vedi `schedaGen.ts`):
 *  - `full`: dizionario intero giocabile → serve a calcolare `allWords`;
 *  - `bands.facile`  = prime  5.000 parole per frequenza d'uso;
 *  - `bands.normale` = prime 20.000;
 *  - `bands.difficile` = prime 60.000.
 *
 * Le fasce si ritagliano da una lista ORDINATA PER FREQUENZA (`frequency-it.txt`,
 * vedi `scripts/build-frequency.mjs`): la lista dei 60k in repo è alfabetica e da
 * lì non si sa quali siano le 5.000 più usate.
 */
import { DIFFICULTY_ORDER, type Difficulty } from './difficulty.js';
import { BAND_SIZES, generateScheda, type SchedaTries } from './schedaGen.js';
import { schedaKey, type Scheda, type SchedaVariant } from './scheda.js';
import { buildTrie } from './solver.js';
import { normalizeWord } from './scoring.js';
import type { GridSize } from './types.js';

export interface SchedaPoolOptions {
  /** Dizionario completo, una parola per elemento (già normalizzato o no). */
  fullWords: Iterable<string>;
  /**
   * Parole italiane ORDINATE PER FREQUENZA D'USO, dalla più frequente
   * (`frequency-it.txt`). Da qui si ritagliano le fasce 5k / 20k / 60k.
   */
  frequencyWords: Iterable<string>;
  /** Lunghezza massima delle parole nel trie (default 14). */
  maxWordLength?: number;
  /**
   * Rimuove i troncamenti delle fonti (default true).
   * Le fonti contengono ~50k forme tagliate (`andar`, `abbacchier`, `nauseer`,
   * `raivt`): sono la causa principale delle "parole strane o sbagliate".
   * Una parola è tenuta solo se termina in vocale oppure compare in
   * `allowedConsonantEndings`.
   */
  dropTruncated?: boolean;
  /**
   * Parole che terminano in consonante ma sono legittime (prestiti, apocopi).
   * Vedi `packages/dictionary/data/consonant-endings.txt`.
   */
  allowedConsonantEndings?: Iterable<string>;
  /**
   * Parole da NON rimuovere col filtro. Utile per whitelist curate: le
   * abbreviazioni NON sono più ammesse (vedi `build-words.mjs`).
   */
  protectedWords?: Iterable<string>;
}

/** true se la parola termina in consonante nella forma normalizzata. */
export function endsInConsonant(word: string): boolean {
  return /[bcdfghjklmnpqrstvwxyz]$/.test(word);
}

/**
 * Prepara i trie una volta sola.
 * Costruirli costa poche centinaia di ms ed è il passaggio più pesante; le fasce
 * sono insiemi piccoli (5k/20k/60k) e si costruiscono in pochi ms ciascuna.
 */
export function createSchedaPool(options: SchedaPoolOptions): SchedaPool {
  const maxLength = options.maxWordLength ?? 14;
  const dropTruncated = options.dropTruncated ?? true;
  const allowedEndings = new Set(
    [...(options.allowedConsonantEndings ?? [])].map(normalizeWord).filter(Boolean),
  );
  const protectedSet = new Set([...options.protectedWords ?? []].map(normalizeWord).filter(Boolean));
  /**
   * Filtro: tiene solo le parole che terminano in vocale o sono esplicitamente ammesse.
   *
   * NON esiste più un'esclusione per le "parole funzionali" (articoli, preposizioni,
   * possessivi come `tua`): la lista unica delle parole giocabili coincide con il
   * dizionario.
   */
  const keep = (w: string): boolean => {
    if (!dropTruncated) return true;
    if (!endsInConsonant(w)) return true;
    return allowedEndings.has(w) || protectedSet.has(w);
  };
  /*
   * `allowedEndings` va filtrato con `keep()` come tutto il resto: un tempo veniva
   * concatenato DOPO il filtro e riammetteva comunque le parole scartate.
   */
  const allowedKept = [...allowedEndings].filter((w) => keep(w));
  const fullList = [
    ...new Set([...[...options.fullWords].map(normalizeWord).filter((w) => w && keep(w)), ...allowedKept]),
  ];
  const full = buildTrie(fullList, { maxLength });

  /*
   * Fasce di frequenza. Una parola entra nella fascia solo se è GIOCABILE (cioè
   * se sta nel dizionario completo): così `words` è sempre un sottoinsieme di
   * `allWords` e nessuna fascia contiene parole che il gioco non accetta.
   */
  const fullSet = new Set(fullList);
  const bands = {} as Record<Difficulty, ReturnType<typeof buildTrie>>;
  const bandCounts = {} as Record<Difficulty, number>;
  for (const difficulty of DIFFICULTY_ORDER) {
    const target = BAND_SIZES[difficulty];
    const selected: string[] = [];
    const seen = new Set<string>();
    for (const raw of options.frequencyWords) {
      const word = normalizeWord(raw);
      if (!word || seen.has(word) || !fullSet.has(word)) continue;
      seen.add(word);
      selected.push(word);
      if (selected.length >= target) break;
    }
    /*
     * Fascia più corta del previsto (dizionario di prova, o lista di frequenza
     * troncata): si usa quello che c'è invece di fallire. La differenza si vede
     * subito nei conteggi stampati da `gen:schede` e da `measure:schede`.
     */
    if (selected.length < target) {
      console.warn(
        `⚠ Fascia "${difficulty}": ${selected.length} parole invece di ${target}. ` +
          'Normale se il dizionario è appena stato ripulito (es. abbreviazioni rimosse): ' +
          'la fascia usa tutte le parole giocabili disponibili. Per riportarla a target ' +
          'rigenera frequency-it.txt con `pnpm --filter @boggle/dictionary build:frequency`.',
      );
    }
    if (selected.length === 0) {
      throw new Error(`Fascia "${difficulty}" vuota: controlla frequency-it.txt e il filtro del dizionario`);
    }
    bands[difficulty] = buildTrie(selected, { maxLength });
    bandCounts[difficulty] = selected.length;
  }

  return new SchedaPool({ full, bands }, bandCounts);
}

export class SchedaPool {
  constructor(
    public readonly tries: SchedaTries,
    /** Parole effettivamente entrate in ogni fascia (per log e diagnostica). */
    public readonly bandCounts: Record<Difficulty, number> = {
      facile: 0,
      normale: 0,
      difficile: 0,
    },
  ) {}

  /**
   * Genera `count` schede di qualità per una coppia dimensione/difficoltà.
   * Gli id seguono `size-difficulty-NNN`; `startIndex` permette di continuare
   * una numerazione esistente quando l'admin aggiunge schede, e `variant` sceglie
   * l'insieme di criteri (`standard` o `full`).
   */
  generate(
    size: GridSize,
    difficulty: Difficulty,
    count: number,
    options: { startIndex?: number; rng?: () => number; variant?: SchedaVariant } = {},
  ): Scheda[] {
    const out: Scheda[] = [];
    const prefix = schedaKey(size, difficulty);
    let index = options.startIndex ?? 1;
    let failed = 0;
    const maxFailures = Math.max(200, count * 250);

    while (out.length < count && failed < maxFailures) {
      const id = `${prefix}-${String(index).padStart(3, '0')}`;
      const scheda = generateScheda({
        size,
        difficulty,
        tries: this.tries,
        rng: options.rng,
        id,
        variant: options.variant,
      });
      if (scheda) {
        out.push(scheda);
        index++;
      } else {
        failed++;
      }
    }
    return out;
  }
}
