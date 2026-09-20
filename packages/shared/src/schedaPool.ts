/**
 * Facade per generare le schede, indipendente dal file system.
 * Usata sia dallo script CLI (`pnpm gen:schede`) sia dall'endpoint admin del server.
 */
import { buildTrie } from './solver.js';
import { normalizeWord } from './scoring.js';
import { generateScheda, type SchedaTries } from './schedaGen.js';
import { schedaKey, type Scheda } from './scheda.js';
import type { Difficulty } from './difficulty.js';
import type { GridSize } from './types.js';

export interface SchedaPoolOptions {
  /** Dizionario completo, una parola per elemento (già normalizzato o no). */
  fullWords: Iterable<string>;
  /** Lessico comune, una parola per elemento. */
  commonWords: Iterable<string>;
  /** Lunghezza massima delle parole nel trie (default 14). */
  maxWordLength?: number;
  /**
   * Rimuove i troncamenti delle fonti (default true).
   * Le fonti contengono ~50k forme tagliate (`andar`, `abbacchier`, `nauseer`,
   * `raitv`): sono la causa principale delle "parole strane o sbagliate".
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
   * Parole da NON rimuovere col filtro (es. abbreviazioni curate come `dott`).
   * Non entrano nel lessico comune dei livelli facili.
   */
  protectedWords?: Iterable<string>;
}

/** true se la parola termina in consonante nella forma normalizzata. */
export function endsInConsonant(word: string): boolean {
  return /[bcdfghjklmnpqrstvwxyz]$/.test(word);
}

/**
 * Prepara i trie (dizionario completo + lessico comune) una volta sola.
 * Costruirli costa poche centinaia di ms ed è il passaggio più pesante.
 */
export function createSchedaPool(options: SchedaPoolOptions): SchedaPool {
  const maxLength = options.maxWordLength ?? 14;
  const dropTruncated = options.dropTruncated ?? true;
  const allowedEndings = new Set(
    [...(options.allowedConsonantEndings ?? [])].map(normalizeWord).filter(Boolean),
  );
  const protectedSet = new Set([...options.protectedWords ?? []].map(normalizeWord).filter(Boolean));
  /** Filtro: tiene solo le parole che terminano in vocale o sono esplicitamente ammesse. */
  const keep = (w: string): boolean => {
    if (!dropTruncated) return true;
    if (!endsInConsonant(w)) return true;
    return allowedEndings.has(w) || protectedSet.has(w);
  };
  /*
   * Lessico comune usato per risolvere le schede.
   *
   * Oltre al file dei 60k, includiamo le parole della lista bianca delle finali in
   * consonante (`tic`, `mar`, `sol`, `bar`, `film`, `gol`, `computer`): sono parole
   * valide che pero' NON compaiono nel file 60k, quindi senza questo passaggio
   * restavano non componibili anche dopo aver corretto il filtro.
   * La lista bianca e' gia' curata (nessun troncamento), quindi non reintroduce rumore.
   */
  const commonList = [
    ...new Set([
      ...[...options.commonWords].map(normalizeWord).filter((w) => w && keep(w)),
      ...allowedEndings,
    ]),
  ];
  const commonSet = new Set(commonList);
  const fullList = [
    ...new Set([...[...options.fullWords].map(normalizeWord).filter((w) => w && keep(w)), ...allowedEndings]),
  ];
  const tries: SchedaTries = {
    full: buildTrie(fullList, { maxLength }),
    common: buildTrie(commonList, { maxLength }),
  };
  return new SchedaPool(tries, commonSet);
}

export class SchedaPool {
  constructor(
    private readonly tries: SchedaTries,
    private readonly commonSet: Set<string>,
  ) {}

  isCommon(word: string): boolean {
    return this.commonSet.has(normalizeWord(word));
  }
  /**
   * Genera `count` schede di qualità per una coppia dimensione/difficoltà.
   * Gli id seguono `size-difficulty-NNN`; `startIndex` permette di continuare
   * una numerazione esistente quando l'admin aggiunge schede.
   */
  generate(
    size: GridSize,
    difficulty: Difficulty,
    count: number,
    options: { startIndex?: number; rng?: () => number } = {},
  ): Scheda[] {
    const out: Scheda[] = [];
    const prefix = schedaKey(size, difficulty);
    let index = options.startIndex ?? 1;
    let failed = 0;
    const maxFailures = Math.max(200, count * 40);

    while (out.length < count && failed < maxFailures) {
      const id = `${prefix}-${String(index).padStart(3, '0')}`;
      const scheda = generateScheda({
        size,
        difficulty,
        tries: this.tries,
        rng: options.rng,
        id,
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
