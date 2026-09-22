import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrie, createSchedaPool, type SchedaPool, type TrieNode } from '@boggle/shared';
import { createDictionaryFromText, type Dictionary } from '@boggle/dictionary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA = path.resolve(__dirname, '../../../packages/dictionary/data/words.txt');
const COMMON_WORDS_PATH = path.resolve(__dirname, '../../../packages/dictionary/data/60000_parole_italiane.txt');
const CONSONANT_ENDINGS_PATH = path.resolve(__dirname, '../../../packages/dictionary/data/consonant-endings.txt');
const ABBREVIATIONS_PATH = path.resolve(__dirname, '../../../packages/dictionary/data/abbreviations.txt');

/**
 * Lunghezza massima delle parole caricate nel trie per il solver ("parole mancate").
 * Limite chiave per la memoria: su 387k parole, un trie senza limite occupa ~142 MB,
 * mentre con maxLength 8 scende a ~24 MB. 10 copre comodamente anche le parole da 5 punti.
 */
const TRIE_MAX_WORD_LENGTH = Number(process.env.TRIE_MAX_WORD_LENGTH ?? 10);

let cached: Dictionary | null = null;
let cachedWords: string[] | null = null;
let cachedTrie: TrieNode | null = null;
let trieBuilding: Promise<TrieNode> | null = null;

/**
 * Carica il dizionario dal file generato da @boggle/dictionary.
 * In assenza del file, fallback a una mini-lista per non bloccare lo sviluppo.
 */
export async function loadServerDictionary(filePath = DEFAULT_DATA): Promise<Dictionary> {
  if (cached) return cached;
  if (!existsSync(filePath)) {
    console.warn(`⚠ Dizionario non trovato in ${filePath}.`);
    console.warn('  Esegui: pnpm --filter @boggle/dictionary build:full');
    console.warn('  Uso una mini-lista di fallback per lo sviluppo.');
    const { MINI_FALLBACK } = await import('./dictionary-fallback.js');
    cached = createDictionaryFromText(MINI_FALLBACK);
    cachedWords = MINI_FALLBACK.split('\n').map((w) => w.trim()).filter(Boolean);
    return cached;
  }
  const text = await readFile(filePath, 'utf8');
  cached = createDictionaryFromText(text);
  cachedWords = text.split('\n').filter(Boolean);
  console.log(`✓ Dizionario caricato: ${cached.size.toLocaleString('it-IT')} parole`);
  return cached;
}

/**
 * Trie per risolvere la griglia (parole mancate).
 *
 * Costruito **lazy**, solo alla prima richiesta: se nessuno arriva a fine round,
 * i ~24 MB del trie non vengono mai allocati. Le chiamate concorrenti condividono
 * la stessa promise per non costruirlo due volte.
 */
export async function getDictionaryTrie(): Promise<TrieNode> {
  if (cachedTrie) return cachedTrie;
  if (!trieBuilding) {
    trieBuilding = (async () => {
      if (!cachedWords) await loadServerDictionary();
      const startedAt = Date.now();
      const trie = buildTrie(cachedWords ?? [], { maxLength: TRIE_MAX_WORD_LENGTH });
      cachedTrie = trie;
      const mem = (process.memoryUsage().heapUsed / 1048576).toFixed(0);
      console.log(
        `✓ Trie del solver costruito (max ${TRIE_MAX_WORD_LENGTH} lettere) in ${Date.now() - startedAt}ms — heap ${mem} MB`,
      );
      return trie;
    })().finally(() => {
      trieBuilding = null;
    });
  }
  return trieBuilding;
}

/** Rilascia il trie (utile per test o per liberare memoria su richiesta). */
export function releaseTrie(): void {
  cachedTrie = null;
}

/**
 * Pool di generazione schede (dizionario completo + lessico comune).
 * Usato dall'endpoint admin `POST /admin/schede/genera`.
 *
 * Diversamente dal trie del solver, qui la lunghezza massima è 14: le schede
 * possono contenere parole lunghe e l'admin accetta di allocare più memoria.
 */
let cachedPool: SchedaPool | null = null;
let poolBuilding: Promise<SchedaPool> | null = null;
const SCHEDA_MAX_WORD_LENGTH = Number(process.env.SCHEDA_MAX_WORD_LENGTH ?? 14);

export async function getSchedaPool(): Promise<SchedaPool> {
  if (cachedPool) return cachedPool;
  if (!poolBuilding) {
    poolBuilding = (async () => {
      if (!cachedWords) await loadServerDictionary();
      const startedAt = Date.now();
      const [commonText, endingsText, abbrText] = await Promise.all([
        existsSync(COMMON_WORDS_PATH) ? readFile(COMMON_WORDS_PATH, 'utf8') : Promise.resolve(''),
        existsSync(CONSONANT_ENDINGS_PATH) ? readFile(CONSONANT_ENDINGS_PATH, 'utf8') : Promise.resolve(''),
        existsSync(ABBREVIATIONS_PATH) ? readFile(ABBREVIATIONS_PATH, 'utf8') : Promise.resolve(''),
      ]);
      cachedPool = createSchedaPool({
        fullWords: cachedWords ?? [],
        commonWords: commonText.split('\n'),
        allowedConsonantEndings: endingsText.split('\n'),
        abbreviations: abbrText.split('\n'),
        maxWordLength: SCHEDA_MAX_WORD_LENGTH,
      });
      const mem = (process.memoryUsage().heapUsed / 1048576).toFixed(0);
      console.log(`✓ Pool schede pronto (max ${SCHEDA_MAX_WORD_LENGTH} lettere) in ${Date.now() - startedAt}ms — heap ${mem} MB`);
      return cachedPool;
    })().finally(() => {
      poolBuilding = null;
    });
  }
  return poolBuilding;
}

export type { Dictionary };
