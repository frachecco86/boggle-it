import { letterValue } from './grid.js';
import { MIN_WORD_LENGTH, MAX_WORD_LENGTH } from './scoring.js';
import type { Grid } from './types.js';

/**
 * Trie per la ricerca di tutte le parole presenti in una griglia.
 * Compatto: nodi come Map<char, Node>, flag `word` sul nodo terminale.
 */
export interface TrieNode {
  children: Map<string, TrieNode>;
  word?: string;
}

export function buildTrie(words: Iterable<string>): TrieNode {
  const root: TrieNode = { children: new Map() };
  for (const raw of words) {
    const w = raw.trim().toLowerCase();
    if (w.length < MIN_WORD_LENGTH || w.length > MAX_WORD_LENGTH) continue;
    let node = root;
    for (const ch of w) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map() };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.word = w;
  }
  return root;
}

const NEIGHBORS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
] as const;

export interface SolveOptions {
  /** Numero massimo di parole da restituire (default 200). */
  limit?: number;
  /** Lunghezza minima delle parole da riportare (default 3). */
  minLength?: number;
}

/**
 * Trova tutte le parole del trie componibili sulla griglia.
 * DFS con potatura: si scende nel trie solo se il prefisso esiste.
 */
export function solveGrid(grid: Grid, trie: TrieNode, options: SolveOptions = {}): string[] {
  const { limit = 200, minLength = MIN_WORD_LENGTH } = options;
  const size = grid.size;
  const n = size * size;
  const found = new Set<string>();
  const visited = new Array<boolean>(n).fill(false);
  // Buffer del prefisso per efficienza (una sola stringa concatenata)
  let prefix = '';

  const dfs = (index: number, node: TrieNode): void => {
    if (found.size >= limit) return;
    const tile = grid.tiles[index]!;
    const value = letterValue(tile.letter);
    let current = node;
    for (const ch of value) {
      const nextNode = current.children.get(ch);
      if (!nextNode) return;
      current = nextNode;
    }
    const prevPrefix = prefix;
    prefix += value;
    if (current.word && prefix.length >= minLength) found.add(current.word);

    if (prefix.length < MAX_WORD_LENGTH) {
      visited[index] = true;
      const row = tile.row;
      const col = tile.col;
      for (const [dr, dc] of NEIGHBORS) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const ni = r * size + c;
        if (visited[ni]) continue;
        dfs(ni, current);
      }
      visited[index] = false;
    }
    prefix = prevPrefix;
  };

  for (let i = 0; i < n; i++) {
    dfs(i, trie);
    if (found.size >= limit) break;
  }
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
}
