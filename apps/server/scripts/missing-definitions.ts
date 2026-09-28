/**
 * Diagnostica: quante parole delle schede NON hanno una definizione?
 *
 * Serve al bug "alcune parole dicono definizione non disponibile nel dizionario
 * interno": senza numeri non si sa se è un caso isolato (una parola senza voce
 * su Wikizionario) o una fetta consistente del vocabolario. Qui si misura, per
 * ogni variante di scheda, la quota di parole giocabili che il pannello `?`
 * saprebbe spiegare — considerando anche le FORME FLESSE (che ereditano la
 * definizione del lemma, vedi `SchedaCatalog.definition`).
 *
 * Uso: pnpm --filter @boggle/server exec tsx scripts/missing-definitions.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { acceptedWords, type Scheda, type SchedaVariant } from '@boggle/shared';
import { DICTIONARY_DATA_DIR, SchedaCatalog } from '../src/schede.js';

function loadDefinitionsRaw(): {
  definitions: Set<string>;
  inflections: Map<string, { lemma: string }>;
} {
  const file = path.join(DICTIONARY_DATA_DIR, 'definitions.br');
  const definitions = new Set<string>();
  const inflections = new Map<string, { lemma: string }>();
  let section = '';
  for (const line of brotliDecompressSync(readFileSync(file)).toString('utf8').split('\n')) {
    if (!line) continue;
    if (line.startsWith('~')) {
      section = line.slice(1);
      continue;
    }
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const word = line.slice(0, tab);
    if (!word) continue;
    if (section === '=') {
      const [lemma = ''] = line.slice(tab + 1).split('\t');
      inflections.set(word, { lemma });
    } else {
      definitions.add(word);
    }
  }
  return { definitions, inflections };
}

const { definitions, inflections } = loadDefinitionsRaw();
const catalog = SchedaCatalog.load();

/** true se `definition()` saprebbe spiegare la parola (diretta o via lemma). */
function hasDefinition(word: string): boolean {
  if (definitions.has(word)) return true;
  const inf = inflections.get(word);
  return Boolean(inf?.lemma && definitions.has(inf.lemma));
}

const variants: SchedaVariant[] = ['standard', 'full', 'ale'];

console.log(`Definizioni caricate: ${definitions.size.toLocaleString('it-IT')}`);
console.log(`Flessioni: ${inflections.size.toLocaleString('it-IT')}\n`);

const totalMissing = new Map<string, number>();

for (const variant of variants) {
  const schede = catalog.list().filter((s: Scheda) => (s.variant ?? 'standard') === variant);
  const words = new Set<string>();
  for (const scheda of schede) {
    for (const w of acceptedWords(scheda)) {
      if (variant === 'ale') words.add(w);
      else words.add(w);
    }
  }
  let missing = 0;
  const examples: string[] = [];
  for (const w of words) {
    if (!hasDefinition(w)) {
      missing++;
      if (examples.length < 25) examples.push(w);
    }
  }
  const pct = words.size > 0 ? ((missing / words.size) * 100).toFixed(2) : '0';
  totalMissing.set(variant, missing);
  console.log(`=== ${variant}: ${schede.length} schede, ${words.size.toLocaleString('it-IT')} parole uniche`);
  console.log(`    senza definizione: ${missing.toLocaleString('it-IT')} (${pct}%)`);
  if (examples.length > 0) console.log(`    esempi: ${examples.slice(0, 20).join(', ')}`);
  console.log();
}
