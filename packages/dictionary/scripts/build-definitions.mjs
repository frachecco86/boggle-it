/**
 * Estrae le DEFINIZIONI delle parole dal dump di Wikizionario e produce
 * `data/definitions.br` (brotli), servito dal server per la modalità apprendimento.
 *
 * FONTE: `itwiktionary.jsonl.gz` (kaikki.org / wiktextract, derivato del dump di
 * Wikizionario, CC BY-SA 4.0 / GFDL). Il dump grezzo NON è versionato (~43 MB);
 * il file di OUTPUT (~1-2 MB compresso) sì, così il server ha le definizioni
 * senza dipendere dalla rete.
 *
 * COSA SI PRENDE: solo le definizioni delle voci ITALIANE che sono vertici
 * autonomi. Le flessioni (`tags: ['form-of']`, es. `amo` → "prima persona di
 * amare") vengono SCARTATE: non spiegano il significato della parola, dicono
 * solo da quale lemma deriva.
 *
 * Formato dell'output (righe, per non ripetere la categoria a ogni parola):
 *   `~sost\nparola<TAB>gloss1; gloss2 …\n…`
 *   `~verb\n…`
 * Le categorie sono quelle di Wikizionario (inglesi), mappate come nell'indice.
 *
 * Uso: node scripts/build-definitions.mjs [--force] [--min N]
 */
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const GZ = path.join(DATA, 'itwiktionary.jsonl.gz');
const OUT = path.join(DATA, 'definitions.br');

/** Stessa normalizzazione di `build-words.mjs` (deve combaciare con words.txt). */
function normalizeWord(raw) {
  return raw
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z]/g, '');
}

/**
 * Categorie di Wikizionario (inglesi) → tag breve, come nell'indice.
 * Le stesse abbreviazioni dell'interfaccia (`sost`, `verb`, `agg`…).
 */
const POS_MAP = {
  noun: 'sost',
  verb: 'verb',
  adj: 'agg',
  adv: 'avv',
  pron: 'pron',
  prep: 'prep',
  conj: 'cong',
  interj: 'inter',
  num: 'num',
  article: 'art',
  particle: 'part',
  prefix: 'pref',
  suffix: 'suff',
  abbreviation: 'abbr',
};

/**
 * Pulisce un gloss: rimuove il "rumore" del wikitext.
 *
 * Wikizionario appende annotazioni fra parentesi — `( approfondimento)`,
 * `( citazioni)`, `( araldica)` — che nel gioco non servono. Si tolgono anche
 * gli spazi doppi e le virgolette dritte sostituite da quelle tipografiche.
 */
function cleanGloss(text) {
  return text
    .replace(/\( [^)]*\)/g, '') // "( approfondimento)", "( araldica)"
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : fallback;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

async function main() {
  if (!existsSync(GZ)) {
    throw new Error(`Manca ${GZ}: scaricalo con \`pnpm --filter @boggle/dictionary fetch\`.`);
  }
  const minSenses = Number(arg('min', '1'));

  /** parola → { pos: tag, senses: string[] } */
  const defs = new Map();
  let lines = 0;
  let kept = 0;

  const rl = createInterface({
    input: createReadStream(GZ).pipe(createGunzip()),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines++;
    if (!line.startsWith('{')) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.lang_code !== 'it') continue;

    const word = normalizeWord(obj.word ?? '');
    if (!word || word.length < 3) continue;

    const senses = obj.senses ?? [];
    /*
     * Scarta le FLESSIONI: una voce è `form-of` quando tutte le sue analisi lo
     * sono (`amo` → "prima persona di amare"). Il significato sta nel lemma, non
     * qui; tenerle riempirebbe il file di rimandi inutili.
     */
    const glosses = [];
    for (const sense of senses) {
      if ((sense.tags ?? []).includes('form-of')) continue;
      for (const g of sense.glosses ?? []) {
        const c = cleanGloss(g);
        // Scarta i gloss che, ripuliti, restano vuoti o sono solo rimandi.
        if (c.length < 3) continue;
        if (/^\(?\s*(vedi|cfr\.?|sin\.|variante di)\b/i.test(c)) continue;
        glosses.push(c);
      }
    }
    if (glosses.length < minSenses) continue;

    const pos = POS_MAP[obj.pos] ?? 'n.c.';
    const existing = defs.get(word);
    if (existing) {
      // Più categorie per la stessa parola (es. `amo` sost + verb): si uniscono
      // i sensi, senza duplicati, e si combina il tag.
      for (const g of glosses) if (!existing.senses.includes(g)) existing.senses.push(g);
      if (!existing.tags.includes(pos)) existing.tags.push(pos);
    } else {
      defs.set(word, { tags: [pos], senses: [...new Set(glosses)] });
    }
    kept++;
  }

  // Serializza a bucket per categoria: il tag si scrive una volta sola.
  const byPos = new Map();
  for (const [word, { tags, senses }] of defs) {
    const key = tags.join(' ');
    const list = byPos.get(key) ?? [];
    // Limita a 4 sensi: oltre, la definizione diventa un tema, non un aiuto.
    list.push(`${word}\t${senses.slice(0, 4).join('; ')}`);
    byPos.set(key, list);
  }

  const parts = [];
  for (const [pos, list] of [...byPos.entries()].sort((a, b) => b[1].length - a[1].length)) {
    parts.push(`~${pos}\n${list.join('\n')}`);
  }
  const text = parts.join('\n') + '\n';
  const br = brotliCompressSync(Buffer.from(text, 'utf8'), {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: text.length,
    },
  });
  writeFileSync(OUT, br);

  console.log(`✓ lette ${lines.toLocaleString('it-IT')} righe dal dump`);
  console.log(`✓ ${defs.size.toLocaleString('it-IT')} parole con definizione (${kept.toLocaleString('it-IT')} voci)`);
  console.log(`✓ definitions.br  ${(br.length / 1024).toFixed(0)} KB  (${(text.length / 1024 / 1024).toFixed(1)} MB non compressi)`);
  for (const [pos, list] of [...byPos.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
    console.log(`    ${pos.padEnd(14)} ${list.length.toLocaleString('it-IT')}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('✗', err.message);
    process.exit(1);
  });
}
