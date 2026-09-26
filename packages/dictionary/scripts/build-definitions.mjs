/**
 * Estrae le DEFINIZIONI delle parole dal dump di Wikizionario e produce
 * `data/definitions.br` (brotli), servito dal server per la modalità apprendimento.
 *
 * FONTE: `itwiktionary.jsonl.gz` (kaikki.org / wiktextract, derivato del dump di
 * Wikizionario, CC BY-SA 4.0 / GFDL). Il dump grezzo NON è versionato (~43 MB);
 * il file di OUTPUT (~1-2 MB compresso) sì, così il server ha le definizioni
 * senza dipendere dalla rete.
 *
 * COSA SI PRENDE:
 *  - le definizioni delle voci ITALIANE autonome (il caso normale);
 *  - per le FLESSIONI (`tags: ['form-of']`, es. `amo` → "prima persona di
 *    amare"), il gloss E il lemma (`form_of[].word`). Non sono definizioni del
 *    significato, ma sono un aiuto utile ("femminile di mulo") e coprono la
 *    maggior parte delle forme flesse, che altrimenti resterebbero senza nulla.
 *    Il client mostra prima la definizione VERA (del lemma, se disponibile) e
 *    sotto la nota grammaticale.
 *
 * Formato dell'output (righe, per non ripetere la categoria a ogni parola):
 *   `~sost\nparola<TAB>gloss1; gloss2 …\n…`
 *   `~=verb\nforma<TAB>lemma<TAB>gloss form-of\n…`
 * La sezione `~=` raccoglie le flessioni: forma, lemma e la nota grammaticale.
 * Le categorie sono quelle di Wikizionario (inglesi), mappate come nell'indice.
 *
 * Uso: node scripts/build-definitions.mjs [--force] [--min N]
 */
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const GZ = path.join(DATA, 'itwiktionary.jsonl.gz');
const WORDS = path.join(DATA, 'words.txt');
const MORPH = path.join(DATA, 'morph-it_048.txt');
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

/** true se la parola è giocabile (o se non abbiamo la lista per filtrarla). */
function playableHas(playable, word) {
  return playable === null || playable.has(word);
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

/**
 * true se il gloss è un PLACEHOLDER di Wikizionario, non una definizione.
 *
 * Wikizionario usa testi come "definizione mancante; se vuoi, aggiungila tu" per
 * le voci senza contenuto: mostrarli nel gioco sarebbe peggio del vuoto (il
 * giocatore leggerebbe un invito a scrivere su Wikimedia). Sono singoli SENSI,
 * non voci intere: `mare` ha la definizione vera E il placeholder, quindi si
 * scarta il singolo senso, non tutta la voce.
 */
function isPlaceholderGloss(text) {
  return /definizione mancante|se vuoi, aggiungila|da controllare|da verificare|^stub$|^da fare$/i.test(
    text,
  );
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

  /*
   * Parole GIOCABILI (`words.txt`): servono a scartare le flessioni inutili.
   *
   * Il dump contiene ~470.000 flessioni, ma il gioco accetta solo le parole di
   * `words.txt` (368.000): tenere tutte porterebbe il file a quasi 4 MB e a
   * ~43 MB in memoria all'avvio del server, per forme che nessuna griglia può
   * comporre. Filtriamo qui, una volta sola, invece di scartarle a runtime.
   *
   * Se `words.txt` manca, si prosegue senza filtro (file più grande ma corretto).
   */
  const playable = existsSync(WORDS)
    ? new Set(
        readFileSync(WORDS, 'utf8')
          .split('\n')
          .map((w) => normalizeWord(w.trim()))
          .filter(Boolean),
      )
    : null;
  if (playable) console.log(`✓ parole giocabili: ${playable.size.toLocaleString('it-IT')}`);

  /** parola → { pos: tag, senses: string[] } */
  const defs = new Map();
  /** forma → { lemma, gloss } per le flessioni (`~=`). */
  const inflected = new Map();
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
     * FLESSIONI (`form-of`): si tiene il gloss e il lemma. Una voce è flessione
     * quando TUTTE le sue analisi lo sono. Il gloss ("plurale di iato") è un
     * aiuto concreto, e il lemma permette al client di mostrare anche la
     * definizione vera (se il lemma ce l'ha).
     */
    const formOf = senses.filter((s) => (s.tags ?? []).includes('form-of'));
    if (formOf.length > 0 && formOf.length === senses.length) {
      const gloss = cleanGloss(formOf[0].glosses?.[0] ?? '');
      const lemma = normalizeWord(formOf[0].form_of?.[0]?.word ?? '');
      if (gloss.length >= 3 && !inflected.has(word) && playableHas(playable, word)) {
        inflected.set(word, { lemma: lemma || '', gloss });
      }
      continue;
    }

    const glosses = [];
    for (const sense of senses) {
      if ((sense.tags ?? []).includes('form-of')) continue;
      for (const g of sense.glosses ?? []) {
        const c = cleanGloss(g);
        // Scarta i gloss che, ripuliti, restano vuoti o sono solo rimandi.
        if (c.length < 3) continue;
        if (isPlaceholderGloss(c)) continue;
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

  /*
   * SECONDO PASSAGGIO con Morph-it: riempie le flessioni che Wikizionario non
   * elenca.
   *
   * Perché serve: Wikizionario marca `form-of` solo per alcune forme (`amo`,
   * `iati`), ma non per tutte (`mula` → `mulo` non è nel dump). Morph-it è un
   * analizzatore morfologico e conosce il lemma di OGNI forma flessa: usandolo
   * come ripiego, la copertura sulle parole giocabili sale dall'85% a oltre il
   * 90%. La nota la costruiamo dal lemma ("femminile di mulo") perché Morph-it
   * dà la categoria grammaticale, non il testo del rapporto.
   *
   * Gira QUI, in locale: `morph-it_048.txt` non è nell'immagine Docker (19 MB),
   * ma il file di output sì. Il server non ne ha bisogno.
   */
  let fromMorph = 0;
  if (existsSync(MORPH)) {
    const morph = readFileSync(MORPH, 'latin1');
    for (const line of morph.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const form = normalizeWord(parts[0]);
      const lemma = normalizeWord(parts[1]);
      if (!form || !lemma || form === lemma) continue;
      if (inflected.has(form) || defs.has(form)) continue;
      if (!playableHas(playable, form)) continue;
      // Serve a qualcosa solo se il LEMMA ha una definizione da mostrare.
      if (!defs.has(lemma)) continue;
      const tag = parts[2] ?? '';
      const nota = /^VER/.test(tag)
        ? `forma del verbo ${lemma}`
        : /^(NOM|ADJ)/.test(tag)
          ? `forma di ${lemma}`
          : `forma di ${lemma}`;
      inflected.set(form, { lemma, gloss: nota });
      fromMorph++;
    }
    console.log(`✓ +${fromMorph.toLocaleString('it-IT')} flessioni ricavate da Morph-it`);
  } else {
    console.warn(`⚠ ${path.basename(MORPH)} assente: le flessioni non elencate da Wikizionario resteranno scoperte.`);
  }

  const parts = [];
  for (const [pos, list] of [...byPos.entries()].sort((a, b) => b[1].length - a[1].length)) {
    parts.push(`~${pos}\n${list.join('\n')}`);
  }
  /*
   * Sezione `~=` delle flessioni: forma, lemma e gloss. Separata dalle categorie
   * perché il suo formato è diverso (tre colonne). Il carattere `=` la rende
   * impossibile da confondere con un tag grammaticale.
   */
  if (inflected.size > 0) {
    /*
     * Si tengono solo le flessioni il cui LEMMA ha una definizione.
     *
     * Perché: il client mostra la definizione del lemma e sotto la nota
     * grammaticale. Se il lemma non ha definizione, la nota resta sola
     * ("femminile di mulo") senza il significato, cioè un rimando a una parola
     * che il dizionario non spiega. Sono ~46.000 voci: scartandole il file cala
     * di ~4 MB decompressi senza togliere niente di utile.
     */
    const rows = [...inflected.entries()]
      .filter(([, v]) => v.lemma !== '' && defs.has(v.lemma))
      .map(([form, v]) => `${form}\t${v.lemma}\t${v.gloss}`);
    if (rows.length > 0) parts.push(`~=\n${rows.join('\n')}`);
    console.log(`  flessioni tenute: ${rows.length.toLocaleString('it-IT')} (il lemma ha una definizione)`);
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
  // Il conteggio EFFETTIVO (dopo il filtro "il lemma ha una definizione") è
  // stampato sopra: `inflected.size` è quanto raccolto, non quanto scritto.
  console.log(`✓ ${inflected.size.toLocaleString('it-IT')} flessioni raccolte (vedi "tenute" sopra)`);
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
