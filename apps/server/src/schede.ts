/**
 * Catalogo delle schede: caricamento, ricerca e persistenza.
 *
 * Le schede base stanno in `packages/shared/schede/` (versionate, generate con
 * `pnpm gen:schede`). L'admin può aggiungerne altre, che vengono salvate in
 * **`DATA_DIR/schede-extra/`**: così finiscono sullo stesso volume dei profili
 * e un solo volume basta a rendere persistenti entrambi.
 *
 * Perché sotto `DATA_DIR`: Railway (e i PaaS in genere) consente UN solo volume
 * per servizio. Tenendo profili e schede admin nella stessa cartella, non serve
 * un secondo volume. Sovrascrivibile con `SCHEDE_EXTRA_DIR`.
 *
 * Il catalogo è tenuto in memoria: sono ~1.4 MB di JSON, trascurabili, e così le
 * richieste (anche /schede/random) sono O(1).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDefinitions, loadWordIndex, type WordIndex } from './wordIndex.js';
import {
  acceptedWords,
  normalizeWord,
  schedaFileName,
  schedaKey,
  schedaVariantOf,
  schedaWordPoints,
  SCHEDA_FORMAT_VERSION,
  type Difficulty,
  type GridSize,
  type Scheda,
  type SchedaFile,
  type SchedaVariant,
  type WordCatalogEntry,
  type WordCatalogQuery,
  type WordCatalogResponse,
} from '@boggle/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Cartella dei dati persistenti (stesso volume dei profili). */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, '../../../data');

export const BASE_SCHEDE_DIR = process.env.SCHEDE_DIR
  ? path.resolve(process.env.SCHEDE_DIR)
  : path.resolve(__dirname, '../../../packages/shared/schede');

/**
 * Schede generate dall'admin. Di default vivono in `DATA_DIR/schede-extra`, così
 * un solo volume (`/app/data` su Railway) conserva profili e schede insieme.
 */
export const EXTRA_SCHEDE_DIR = process.env.SCHEDE_EXTRA_DIR
  ? path.resolve(process.env.SCHEDE_EXTRA_DIR)
  : path.join(DATA_DIR, 'schede-extra');

/**
 * Cartella del dizionario: contiene `words.txt` e `word-index.br`.
 * Sovrascrivibile con `DICTIONARY_DIR` (come per le fonti del build).
 */
export const DICTIONARY_DATA_DIR = process.env.DICTIONARY_DIR
  ? path.resolve(process.env.DICTIONARY_DIR)
  : path.resolve(__dirname, '../../../packages/dictionary/data');

/** Metadati di una scheda, senza l'elenco completo delle parole. */
export interface SchedaMeta {
  id: string;
  size: GridSize;
  difficulty: Difficulty;
  /** Insieme di criteri con cui è stata generata (standard / full criteria). */
  variant: SchedaVariant;
  grid: string;
  longest: number;
  wordCount: number;
}

export function toMeta(scheda: Scheda): SchedaMeta {
  return {
    id: scheda.id,
    size: scheda.size,
    difficulty: scheda.difficulty,
    variant: schedaVariantOf(scheda),
    grid: scheda.grid,
    longest: scheda.longest,
    // Conteggio delle parole che il giocatore può trovare (insieme accettato).
    wordCount: acceptedWords(scheda).length,
  };
}

export class SchedaCatalog {
  private readonly byId = new Map<string, Scheda>();
  private readonly byKey = new Map<string, Scheda[]>();
  /** Indice parola -> occorrenze, costruito pigramente per il catalogo parole. */
  private wordIndex: { words: Map<string, { occurrences: number; schedaIds: string[] }> } | null = null;
  /**
   * Categoria grammaticale e voce Wikizionario per le parole del dizionario.
   * Arriva da `word-index.br`; se assente la pagina Parole resta senza tag.
   */
  private lexical: WordIndex = loadWordIndex(path.join(DICTIONARY_DATA_DIR, 'word-index.br'));

  /**
   * Definizioni e flessioni, caricate PIGRAMENTE.
   *
   * `definitions.br` è ~25 MB decompresso e ~365.000 voci: tenerle in memoria
   * dall'avvio costerebbe ~170 MB di RSS che nessuno usa finché non si apre la
   * modalità apprendimento. Si caricano alla PRIMA richiesta di definizione (una
   * sola volta, poi restano: le richieste successive sono immediaten).
   */
  private definitionsLoaded = false;

  /** Carica definizioni e flessioni alla prima richiesta di definizione. */
  private ensureDefinitions(): void {
    if (this.definitionsLoaded) return;
    this.definitionsLoaded = true;
    const startedAt = Date.now();
    const extra = loadDefinitions(path.join(DICTIONARY_DATA_DIR, 'definitions.br'));
    this.lexical.definitions = extra.definitions;
    this.lexical.inflections = extra.inflections;
    console.log(
      `✓ Definizioni pronte: ${extra.definitions.size.toLocaleString('it-IT')} parole, ` +
        `${extra.inflections.size.toLocaleString('it-IT')} flessioni in ${Date.now() - startedAt}ms`,
    );
  }

  /**
   * Sostituisce l'indice lessicale (usato dai test e dopo una rigenerazione).
   */
  setWordIndex(index: WordIndex): void {
    this.lexical = index;
  }

  /** Carica schede base + extra. */
  static load(): SchedaCatalog {
    const catalog = new SchedaCatalog();
    const base = catalog.loadDir(BASE_SCHEDE_DIR);
    const extra = catalog.loadDir(EXTRA_SCHEDE_DIR);
    console.log(
      `✓ Schede caricate: ${catalog.size} (base ${base} da ${path.relative(process.cwd(), BASE_SCHEDE_DIR)}, extra ${extra} da ${path.relative(process.cwd(), EXTRA_SCHEDE_DIR)})`,
    );
    return catalog;
  }

  private loadDir(dir: string): number {
    if (!existsSync(dir)) return 0;
    let loaded = 0;
    for (const file of readdirSync(dir)) {
      if (!/^schede-.*\.json$/.test(file)) continue;
      try {
        const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as SchedaFile;
        for (const scheda of parsed.schede ?? []) {
          if (!scheda?.id || !scheda.grid || !Array.isArray(scheda.words)) continue;
          this.add(scheda);
          loaded++;
        }
      } catch (err) {
        console.warn(`⚠ Scheda illeggibile ${file}: ${String(err)}`);
      }
    }
    return loaded;
  }

  get size(): number {
    return this.byId.size;
  }

  /** Aggiunge una scheda in memoria (sovrascrive un id esistente). */
  add(scheda: Scheda): void {
    const key = schedaKey(scheda.size, scheda.difficulty);
    const list = this.byKey.get(key) ?? [];
    const idx = list.findIndex((s) => s.id === scheda.id);
    if (idx >= 0) list[idx] = scheda;
    else list.push(scheda);
    this.byKey.set(key, list);
    this.byId.set(scheda.id, scheda);
    this.invalidate();
  }

  get(id: string): Scheda | undefined {
    return this.byId.get(id);
  }

  /**
   * Elenca le schede, con filtri opzionali e indipendenti.
   *
   * Prima filtrava solo se venivano passati ENTRAMBI size e difficulty:
   * con uno solo restituiva l'intero catalogo, quindi un filtro per sola
   * dimensione (o sola difficoltà) non aveva effetto. Ora i filtri si applicano
   * singolarmente.
   */
  list(size?: GridSize, difficulty?: Difficulty): Scheda[] {
    if (size === undefined && difficulty === undefined) return [...this.byId.values()];
    if (size !== undefined && difficulty !== undefined) {
      return [...(this.byKey.get(schedaKey(size, difficulty)) ?? [])];
    }
    return [...this.byId.values()].filter(
      (s) => (size === undefined || s.size === size) && (difficulty === undefined || s.difficulty === difficulty),
    );
  }

  countByKey(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, list] of this.byKey) out[key] = list.length;
    return out;
  }

  /**
   * Scheda casuale per dimensione/difficoltà, o `undefined` se il gruppo (o la
   * variante richiesta) è vuoto.
   *
   * La VARIANTE filtra il catalogo: `standard` (storico) o `full` ("full
   * criteria"). Se la variante richiesta non ha schede si ritorna `undefined`
   * invece di ripiegare sull'altra: giocare criteri diversi da quelli scelti
   * sarebbe peggio di un errore esplicito ("nessuna scheda disponibile").
   */
  random(
    size: GridSize,
    difficulty: Difficulty,
    rng: () => number = Math.random,
    variant: SchedaVariant = 'standard',
  ): Scheda | undefined {
    const list = this.byKey.get(schedaKey(size, difficulty));
    if (!list || list.length === 0) return undefined;
    const matching = list.filter((s) => schedaVariantOf(s) === variant);
    if (matching.length === 0) return undefined;
    return matching[Math.floor(rng() * matching.length)];
  }

  /** Quante schede per dimensione/difficoltà e variante (per il selettore). */
  countByVariant(): Record<string, Record<SchedaVariant, number>> {
    const out: Record<string, Record<SchedaVariant, number>> = {};
    for (const [key, list] of this.byKey) {
      const counts: Record<SchedaVariant, number> = { standard: 0, full: 0, ale: 0 };
      for (const scheda of list) counts[schedaVariantOf(scheda)]++;
      out[key] = counts;
    }
    return out;
  }

  /**
   * Catalogo di TUTTE le parole componibili, con il numero di schede in cui compaiono.
   *
   * L'indice viene calcolato una volta e memorizzato: le schede cambiano solo quando
   * l'admin ne aggiunge, quindi rifarlo a ogni richiesta sarebbe spreco.
   * `invalidate()` lo azzera quando il catalogo cambia.
   */
  /**
   * Definizione di una parola (modalità apprendimento).
   *
   * Normalizza l'input come il resto del gioco (`città` → `citta`).
   *
   * Ordine di risoluzione (dal più utile al meno):
   *  1. definizioni della parola stessa (parole piene: `casa`, `amare`);
   *  2. se è una FORMA FLESSA (`mula`, `amo`), la definizione del suo LEMMA più
   *     la nota grammaticale ("femminile di mulo"). La definizione vera va
   *     PRIMA: è il significato, la nota è morfologia.
   *
   * Quando non c'è nulla, `senses: []`: il client mostra il link a Wikizionario.
   * Resta scoperto il ~7% delle parole (sigle e forestierismi come `fair`, `trip`).
   */
  definition(word: string): {
    word: string;
    pos: string;
    senses: string[];
    /** Nota grammaticale, quando la parola è una forma flessa. */
    note?: string;
  } {
    this.ensureDefinitions();
    const w = normalizeWord(word);
    const pos = this.lexical.pos.get(w) ?? 'n.c.';
    const own = this.lexical.definitions.get(w);
    if (own && own.length > 0) return { word: w, pos, senses: own };

    // Forma flessa: si mostrano le definizioni del lemma e la nota su come deriva.
    const inf = this.lexical.inflections.get(w);
    if (inf) {
      const lemmaSenses = inf.lemma ? (this.lexical.definitions.get(inf.lemma) ?? []) : [];
      return {
        word: w,
        pos,
        senses: lemmaSenses,
        note: inf.gloss || (inf.lemma ? `forma di ${inf.lemma}` : undefined),
      };
    }

    return { word: w, pos, senses: [] };
  }

  wordCatalog(query: WordCatalogQuery): WordCatalogResponse {
    const index = this.getWordIndex();

    // Filtro per dimensione/difficoltà: serve la mappa parola -> schede.
    // Se non ci sono filtri di scheda usiamo l'indice globale (più veloce).
    /*
     * Filtro per schede. Con `schedaId` si restringe a UNA scheda (per sapere se
     * una parola vale in partita); con dimensione/difficoltà si restringe a un gruppo.
     * Senza filtri si usa l'indice globale, più veloce.
     */
    const restrictSchedaIds = query.schedaId
      ? new Set([query.schedaId])
      : query.gridSize !== undefined || query.difficulty !== undefined
        ? new Set(this.list(query.gridSize, query.difficulty).map((s) => s.id))
        : null;

    const search = query.search?.trim().toLowerCase() ?? '';
    const entries: WordCatalogEntry[] = [];
    const byLengthAll = new Map<number, number>();
    const byPosAll = new Map<string, number>();
    let withEntryAll = 0;

    /*
     * Universo di partenza.
     *
     * `schede` (default): le parole che compaiono in almeno una scheda.
     * `dizionario`: TUTTO il lessico accettato dal gioco (`word-index.br`). Sono
     * ~403k voci contro le ~30k componibili: molte parole italiane validissime
     * non entrano mai in una griglia, e questa vista serve proprio a mostrarle.
     */
    const source: Iterable<[string, { occurrences: number; schedaIds: string[] } | null]> =
      query.scope === 'dizionario'
        ? [...this.lexical.pos.keys()].map((w) => [w, null] as [string, null])
        : index.words;

    for (const [word, entry] of source) {
      // distribuzione per lunghezza sull'intero catalogo filtrato (prima della paginazione)
      const occ = !entry
        ? 0
        : restrictSchedaIds
          ? entry.schedaIds.reduce((n, id) => (restrictSchedaIds.has(id) ? n + 1 : n), 0)
          : entry.occurrences;
      // Nel perimetro `schede` una parola senza occorrenze non deve comparire.
      if (entry && occ === 0) continue;

      if (query.length !== undefined && word.length !== query.length) continue;
      if (query.minLength !== undefined && word.length < query.minLength) continue;
      if (query.maxLength !== undefined && word.length > query.maxLength) continue;
      // Ricerca per PREFISSO: "amo" deve trovare "amore", non "abbacchiamo".
      if (search && !word.startsWith(search)) continue;

      const pos = this.lexical.pos.get(word) ?? 'n.c.';
      if (query.pos && query.pos !== 'all' && pos !== query.pos) continue;
      const hasEntry = this.lexical.hasEntry.has(word);
      if (query.onlyWithEntry && !hasEntry) continue;

      byLengthAll.set(word.length, (byLengthAll.get(word.length) ?? 0) + 1);
      byPosAll.set(pos, (byPosAll.get(pos) ?? 0) + 1);
      if (hasEntry) withEntryAll++;
      entries.push({
        word,
        length: word.length,
        occurrences: occ,
        // Formula CENTRALIZZATA: una copia hardcoded resterebbe indietro se
        // cambiassimo il punteggio (è già successo con la validazione difficoltà).
        points: schedaWordPoints(word.length),
        pos,
        hasEntry,
        display: this.lexical.display.get(word),
      });
    }

    // Ordinamento
    const dir = query.direction === 'asc' ? 1 : -1;
    entries.sort((a, b) => {
      if (query.sort === 'word') return dir * a.word.localeCompare(b.word, 'it');
      if (query.sort === 'length') {
        return dir * (a.length - b.length) || a.word.localeCompare(b.word, 'it');
      }
      return dir * (a.occurrences - b.occurrences) || a.word.localeCompare(b.word, 'it');
    });

    const total = entries.length;
    const page = entries.slice(query.offset, query.offset + query.limit);

    const byLength = [...byLengthAll.entries()]
      .map(([length, words]) => ({ length, words }))
      .sort((a, b) => a.length - b.length);

    const byPos = [...byPosAll.entries()]
      .map(([pos, words]) => ({ pos, words }))
      .sort((a, b) => b.words - a.words);

    return {
      entries: page,
      total,
      byLength,
      byPos,
      withEntry: withEntryAll,
      offset: query.offset,
      limit: query.limit,
    };
  }

  /** Indice parole, costruito alla prima richiesta e riusato. */
  private getWordIndex(): { words: Map<string, { occurrences: number; schedaIds: string[] }> } {
    if (this.wordIndex) return this.wordIndex;
    const words = new Map<string, { occurrences: number; schedaIds: string[] }>();
    for (const scheda of this.byId.values()) {
      for (const word of scheda.words) {
        let entry = words.get(word);
        if (!entry) {
          entry = { occurrences: 0, schedaIds: [] };
          words.set(word, entry);
        }
        entry.occurrences++;
        entry.schedaIds.push(scheda.id);
      }
    }
    this.wordIndex = { words };
    return this.wordIndex;
  }

  /** Azzera l'indice parole: da chiamare quando le schede cambiano. */
  invalidate(): void {
    this.wordIndex = null;
  }

  /**
   * Persiste PIU' schede in una sola passata, raggruppandole per file.
   *
   * Perché: `persist()` rilegge e riscrive il file intero per ogni scheda. Generando
   * 100 schede su una 6x6 si arriva a scrivere ~49 MB invece di 0,8 MB (60 volte
   * tanto), lento e a rischio timeout su un disco di rete come quello di Railway.
   * Qui raggruppiamo per file e scriviamo una volta sola per gruppo.
   */
  persistMany(schede: Scheda[]): string[] {
    if (schede.length === 0) return [];
    mkdirSync(EXTRA_SCHEDE_DIR, { recursive: true });

    // Raggruppa per file di destinazione.
    const perFile = new Map<string, Scheda[]>();
    for (const scheda of schede) {
      const file = path.join(EXTRA_SCHEDE_DIR, schedaFileName(scheda.size, scheda.difficulty));
      const list = perFile.get(file) ?? [];
      list.push(scheda);
      perFile.set(file, list);
    }

    const written: string[] = [];
    for (const [file, gruppo] of perFile) {
      const existing: SchedaFile = existsSync(file)
        ? (JSON.parse(readFileSync(file, 'utf8')) as SchedaFile)
        : {
            version: SCHEDA_FORMAT_VERSION,
            generatedAt: new Date().toISOString(),
            size: gruppo[0]!.size,
            difficulty: gruppo[0]!.difficulty,
            schede: [],
          };
      for (const scheda of gruppo) {
        const idx = existing.schede.findIndex((s) => s.id === scheda.id);
        if (idx >= 0) existing.schede[idx] = scheda;
        else existing.schede.push(scheda);
      }
      existing.generatedAt = new Date().toISOString();
      writeFileSync(file, JSON.stringify(existing, null, 2) + '\n');
      written.push(file);
    }
    return written;
  }

  /**
   * Persiste una scheda nuova nella cartella extra, aggiornando il file del suo
   * gruppo (creandolo se manca). Ritorna il file scritto.
   *
   * Per più schede insieme preferisci `persistMany`, che scrive una volta sola.
   */
  persist(scheda: Scheda): string {
    mkdirSync(EXTRA_SCHEDE_DIR, { recursive: true });
    const file = path.join(EXTRA_SCHEDE_DIR, schedaFileName(scheda.size, scheda.difficulty));
    const existing: SchedaFile = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as SchedaFile)
      : {
          version: SCHEDA_FORMAT_VERSION,
          generatedAt: new Date().toISOString(),
          size: scheda.size,
          difficulty: scheda.difficulty,
          schede: [],
        };
    const idx = existing.schede.findIndex((s) => s.id === scheda.id);
    if (idx >= 0) existing.schede[idx] = scheda;
    else existing.schede.push(scheda);
    existing.generatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(existing, null, 2) + '\n');
    return file;
  }
}
