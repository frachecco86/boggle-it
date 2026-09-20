import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTrie, type TrieNode } from '@boggle/shared';
import { createDictionaryFromText, type Dictionary } from '@boggle/dictionary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA = path.resolve(__dirname, '../../../packages/dictionary/data/words.txt');

let cached: Dictionary | null = null;
let cachedTrie: TrieNode | null = null;

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
    return cached;
  }
  const text = await readFile(filePath, 'utf8');
  cached = createDictionaryFromText(text);
  cachedTrie = buildTrie(text.split('\n'));
  console.log(`✓ Dizionario caricato: ${cached.size.toLocaleString('it-IT')} parole`);
  return cached;
}

/** Trie per risolvere la griglia (parole mancate). Costruito una sola volta. */
export async function getDictionaryTrie(): Promise<TrieNode> {
  if (!cachedTrie) await loadServerDictionary();
  return cachedTrie!;
}

export type { Dictionary };
