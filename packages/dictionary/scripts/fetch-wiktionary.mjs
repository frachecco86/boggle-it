// Scarica il dump elaborato di Wikizionario (kaikki.org, derivato del dump
// ufficiale it.wiktionary) e ne estrae gli HEADWORD italiani con la categoria
// grammaticale.
//
// PERCHÉ SERVE
// Il dizionario di gioco è una lista di FORME FLESSE (499k): non dice se una
// parola è una voce autonoma o la flessione di un'altra. Morph-it ha solo ~34k
// lemmi e i 60k sono una lista di frequenza: nessuno dei due copre nomi comuni
// come `broccolo`, `spinacio`, `aspirapolvere`.
//
// A cosa servono gli headword:
//  1. FILTRO del dizionario: una parola della lista piatta che non è né una forma
//     Morph-it né un headword è quasi sempre rumore (`acta`, `agfa`, `baili`).
//  2. TAG grammaticale nella pagina Parole (99% di copertura).
//  3. LINK alla voce di it.wiktionary.org.
//
// Il file `wiktionary-heads.br` è versionato (~200 KB): i deploy non hanno bisogno
// della rete. L'output è deterministico a parità di dump.
//
// Uso: node scripts/fetch-wiktionary.mjs
//      KEEP_DUMP=1 … per conservare il dump grezzo (utile per debug)
import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createGunzip, brotliCompressSync, constants } from 'node:zlib';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const OUT_BR = path.join(DATA, 'wiktionary-heads.br');

/*
 * Dump elaborato di Wikizionario (kaikki.org / wiktextract).
 * Il testo di Wikizionario è CC BY-SA 4.0; l'attribuzione è nel footer dell'app.
 * ~40 MB gzip, ~500 MB decompresso: lo leggiamo in streaming.
 */
const DUMP_URL = 'https://kaikki.org/itwiktionary/raw-wiktextract-data.jsonl.gz';
const GZ = path.join(DATA, 'itwiktionary.jsonl.gz');

/**
 * Normalizzazione coerente col resto del progetto: minuscolo, accenti → vocale
 * base, solo a-z. `città` → `citta`, `perché` → `perche`.
 */
function normalize(raw) {
  return raw
    .toLowerCase()
    .replace(/[àáâä]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z]/g, '');
}

/*
 * Categorie grammaticali di Wikizionario (inglesi, come le emette wiktextract)
 * → tag italiani brevi, allineati a quelli mostrati nella pagina Parole.
 */
const POS_LABEL = {
  noun: 'sost',
  verb: 'verb',
  adj: 'agg',
  adv: 'avv',
  name: 'n.pr',
  pron: 'pron',
  prep: 'prep',
  conj: 'cong',
  intj: 'inter',
  article: 'art',
  num: 'num',
  particle: 'part',
  prefix: 'pref',
  suffix: 'suff',
  phrase: 'loc',
  adv_phrase: 'loc.avv',
  prep_phrase: 'loc.prep',
  abbrev: 'abbr',
  symbol: 'sim',
  character: 'car',
  affix: 'aff',
};

async function download() {
  mkdirSync(DATA, { recursive: true });
  if (existsSync(GZ) && statSync(GZ).size > 1_000_000) {
    console.log(`↷ dump già presente (${(statSync(GZ).size / 1024 / 1024).toFixed(1)} MB), riuso`);
    return;
  }
  console.log('→ scarico il dump di Wikizionario (kaikki.org, ~40 MB)…');
  await execFileAsync('curl', ['-fsSL', '--retry', '2', '--max-time', '600', '-o', GZ, DUMP_URL], {
    maxBuffer: 1024 * 1024,
  });
  console.log(`  scaricato: ${(statSync(GZ).size / 1024 / 1024).toFixed(1)} MB`);
}

async function main() {
  await download();

  /** parola normalizzata → { pos: Set<string>, display: string } */
  const heads = new Map();
  let lines = 0;

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

    /*
     * Distinzione chiave: una voce è un HEADWORD se non è SOLO una forma di
     * un'altra parola. Wikizionario marca le flessioni con `tags: ['form-of']`
     * (es. `ato` → "prima persona singolare dell'indicativo presente di atare").
     * Le scartiamo: servono le voci autonome (`anta`, `alce`, `broccolo`).
     */
    const senses = obj.senses ?? [];
    const isForm = senses.length > 0 && senses.every((s) => (s.tags ?? []).includes('form-of'));
    if (isForm) continue;

    const word = normalize(obj.word ?? '');
    if (!word || word.length < 3 || word.length > 16) continue;

    const pos = POS_LABEL[obj.pos] ?? null;
    if (!pos) continue;

    const cur = heads.get(word) ?? { pos: new Set(), display: String(obj.word) };
    cur.pos.add(pos);
    heads.set(word, cur);
  }

  /*
   * Formato su disco: BUCKET per categoria grammaticale, non JSON per parola.
   *
   * Perché: `{"parola":{"pos":"sost","page":"parola"}}` ripete la chiave due volte
   * e pesa 3 MB. Raggruppando `pos → elenco parole` in testo semplice si scende a
   * 715 KB, che con brotli diventano ~200 KB — ragionevole da versionare.
   * Il costo in memoria (split di 715 KB all'avvio del server) è trascurabile.
   */
  const buckets = new Map();
  const accents = {};
  for (const [word, v] of heads) {
    for (const p of v.pos) {
      const list = buckets.get(p) ?? [];
      list.push(word);
      buckets.set(p, list);
    }
    // Solo per le forme accentate: la chiave ha perso l'accento, il link no.
    const display = v.display.replace(/ /g, '_');
    if (normalize(display) === word && display.toLowerCase() !== word) accents[word] = display;
  }

  /*
   * Sezione speciale `~acc` in coda: mappa `normale<TAB>originale` per le forme
   * accentate (`citta` → `città`). Sta nello STESSO file così c'è una sola risorsa
   * da versionare e da decomprimere; un file separato aggiungerebbe ~40 KB.
   */
  let text = '';
  for (const pos of [...buckets.keys()].sort()) {
    text += `${pos}\n${buckets.get(pos).sort().join(' ')}\n`;
  }
  const accentLines = Object.entries(accents)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([norm, display]) => `${norm}\t${display}`);
  if (accentLines.length > 0) text += `~acc\n${accentLines.join('\n')}\n`;

  const br = brotliCompressSync(Buffer.from(text, 'utf8'), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  await writeFile(OUT_BR, br);

  console.log(`✓ wiktionary-heads.br: ${heads.size.toLocaleString('it-IT')} headword, ${buckets.size} categorie, ${accentLines.length} forme accentate (${(br.length / 1024).toFixed(0)} KB)`);
  console.log(`  righe lette dal dump: ${lines.toLocaleString('it-IT')}`);
  if (process.env.KEEP_DUMP !== '1') {
    unlinkSync(GZ);
    console.log('  dump temporaneo rimosso (KEEP_DUMP=1 per conservarlo)');
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
