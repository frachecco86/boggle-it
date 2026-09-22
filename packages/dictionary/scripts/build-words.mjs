// Costruisce data/words.txt (lista ordinata, deduplicata) + data/words.br (brotli)
// e data/word-index.json (categoria grammaticale + link al dizionario).
// Uso: node scripts/build-words.mjs
//
// Fonti:
//  - Morph-it! 0.48 (UniBO)   — forme flesse incl. coniugazioni verbali — CC BY-SA 2.0 / LGPL
//  - paroleitaliane (napolux) — lessico comune per colmare lacune di Morph-it
//  - 280k parole italiane     — sostantivi e aggettivi che Morph-it NON copre
//  - abbreviazioni.txt        — abbreviazioni da dizionario (Wikizionario, CC BY-SA 3.0)
//  - Wikizionario (kaikki.org) — HEADWORD + categoria grammaticale (CC BY-SA 4.0)
//
// PERCHÉ SERVONO PIÙ LISTE DI PAROLE (e non due)
// Morph-it è un ANALIZZATORE MORFOLOGICO: delle sue 505k righe, 391k sono forme
// verbali e solo 35k sono sostantivi. Copre benissimo la coniugazione ma gli
// mancano i nomi concreti di uso quotidiano — `anta`, `broccoli`, `spinaci`,
// `aspirapolvere`, `abaco` — che non stanno nemmeno nei 60k (lista di frequenza).
// Senza la terza lista quelle parole non erano componibili nelle griglie.
//
// PERCHÉ LA LISTA PIATTA NON BASTA PIÙ (e serve il filtro degli headword)
// La lista 280k è una lista PIATTA senza analisi grammaticale: contiene nomi
// comuni utilissimi ma anche rumore — `acta`, `agfa`, `baili`, `burbe`, `savere`.
// Una parola della lista piatta entra solo se è attestata come voce autonoma in
// Wikizionario (headword). Questo scarta ~76k forme inesistenti lasciando
// `broccolo`, `anta`, `alce`, `tris`. Vedi `fetch-wiktionary.mjs`.
//
// Regole di normalizzazione:
//  - minuscolo, accenti -> vocale base, rimozione apostrofi/simboli
//  - accettate solo [a-z]{3,16}
//  - escluse le voci di `blocked-words.txt` (volgarità: il gioco è per famiglie)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');

const MIN_LEN = 3;
const MAX_LEN = 16;

/**
 * Carica gli headword di Wikizionario (vedi `fetch-wiktionary.mjs`).
 *
 * Formato su disco: bucket `categoria` → parole separate da spazio, più due
 * sezioni speciali in coda: `~acc` (normale<TAB>originale, forme accentate) e
 * `~w` (l'elenco delle parole con voce di Wikizionario).
 * Ritorna `{ byWord, accents }`; `null` se il file manca (build offline).
 */
async function loadWiktionary() {
  const file = path.join(DATA, 'wiktionary-heads.br');
  if (!existsSync(file)) return null;
  const lines = brotliDecompressSync(await readFile(file)).toString('utf8').split('\n');
  const byWord = new Map();
  const accents = new Map();
  let i = 0;
  while (i < lines.length) {
    const section = lines[i++];
    if (!section) continue;
    if (section === '~acc') {
      // Righe `normale<TAB>originale` fino al prossimo marcatore `~…` o a fine file.
      while (i < lines.length && lines[i] && !lines[i].startsWith('~')) {
        const [norm, display] = lines[i++].split('\t');
        if (norm && display) accents.set(norm, display);
      }
      continue;
    }
    // Bucket di categoria: la riga successiva elenca le parole.
    const words = lines[i++] ?? '';
    for (const w of words.split(' ')) {
      if (w) byWord.set(w, section);
    }
  }
  return { byWord, accents };
}

export function normalizeWord(raw) {
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
 * ============================================================================
 * REGOLA CANONICA DI "PAROLA GIOCABILE"
 * ============================================================================
 *
 * Il dizionario deve contenere ESATTAMENTE le parole giocabili: una parola che
 * sta qui ma non entra in nessuna scheda è una promessa non mantenuta (era il
 * caso di `tua`: presente nel dizionario, rifiutata in partita).
 *
 * Le regole sono le stesse applicate dalle schede (`schedaPool.ts`), cioè:
 *   1. lunghezza 3..16, solo [a-z] dopo la normalizzazione;
 *   2. non bloccata (`blocked-words.txt`);
 *   3. se termina in consonante, deve essere una parola autonoma attestata
 *      (`consonant-endings.txt`, derivata dal lemma di Morph-it) oppure
 *      un'abbreviazione curata (`abbreviations.txt`).
 *
 * PERCHÉ SERVIVA: le fonti contengono migliaia di TRONCAMENTI (`andar`, `alzar`,
 * `maggior`, `normalit`, `abbacchiaron`) che non sono parole italiane. Prima
 * restavano nel dizionario e il gioco li rifiutava sempre: ~48k voci fantasma.
 *
 * Le stesse liste sono lette dal generatore delle schede, quindi non possono
 * più disallinearsi.
 */

/** true se la parola termina in consonante (dopo normalizzazione). */
const endsInConsonant = (w) => /[bcdfghjklmnpqrstvwxyz]$/.test(w);

/** Legge una lista curata (una voce per riga, righe `#` ignorate). */
async function loadCuratedList(file) {
  const full = path.join(DATA, file);
  if (!existsSync(full)) return new Set();
  const set = new Set();
  for (const line of (await readFile(full, 'utf8')).split('\n')) {
    const w = normalizeWord(line.trim());
    if (w) set.add(w);
  }
  return set;
}

/**
 * Voci escluse dal dizionario.
 *
 * Perché: il gioco è per famiglie e le liste pubbliche contengono volgarità.
 * La lista è curata (una voce per riga) e non è negoziabile dal gioco.
 */
async function loadBlocked() {
  const file = path.join(DATA, 'blocked-words.txt');
  if (!existsSync(file)) return new Set();
  const set = new Set();
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const w = normalizeWord(line.trim());
    if (w) set.add(w);
  }
  return set;
}

const isUsable = (w) => w.length >= MIN_LEN && w.length <= MAX_LEN;

/**
 * Filtro di giocabilità: identico alla regola di `schedaPool.ts`.
 * Ritorna una funzione costruita sulle liste curate già caricate.
 */
function makePlayableFilter({ allowedEndings, abbreviations, blocked }) {
  return (w) => {
    if (!isUsable(w) || blocked.has(w)) return false;
    if (!endsInConsonant(w)) return true;
    return allowedEndings.has(w) || abbreviations.has(w);
  };
}

async function findMorphIt() {
  const preferred = path.join(DATA, 'morph-it_048.txt');
  if (existsSync(preferred)) return preferred;
  const entries = await readdir(DATA).catch(() => []);
  const match = entries.find((f) => /^morph-it.*\.txt$/.test(f));
  return match ? path.join(DATA, match) : null;
}

/**
 * Rigenera `words.br` da una lista di parole normalizzate e ordinate.
 */
async function writeOutputs(sorted) {
  const txt = sorted.join('\n') + '\n';
  const wordsTxt = path.join(DATA, 'words.txt');
  const wordsBr = path.join(DATA, 'words.br');
  await writeFile(wordsTxt, txt);
  const br = brotliCompressSync(Buffer.from(txt, 'utf8'), {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: txt.length,
    },
  });
  await writeFile(wordsBr, br);
  return { txt, br };
}

/**
 * Scrive `words.txt`/`words.br` a partire da un insieme di parole già accettate.
 */
async function writeDictionary(words) {
  const sorted = [...words].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const { txt, br } = await writeOutputs(sorted);
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(
    `✓ words.txt  ${sorted.length.toLocaleString('it-IT')} parole  (${kb(txt.length)})`,
  );
  console.log(`✓ words.br   ${kb(br.length)}  (ratio ${((br.length / txt.length) * 100).toFixed(1)}%)`);
  return sorted;
}

/*
 * Categorie grammaticali di Wikizionario → tag italiani brevi.
 * I tag sono in MINUSCOLO perché Wikizionario e Morph-it usano case diversi
 * (`noun` contro `NOUN`): normalizzando qui il confronto non dipende dalla fonte.
 * Deve restare allineato a `POS_LABEL` in `fetch-wiktionary.mjs` (che produce le
 * categorie) e a `apps/server/src/wordIndex.ts` (che le serve al client).
 */
const POS_LABEL = {
  noun: 'sost',
  verb: 'verb',
  // Morph-it abbrevia `VER` (391k righe!): senza queste due chiavi i verbi
  // restavano senza tag e la copertura crollava al 27%.
  ver: 'verb',
  adj: 'agg',
  adv: 'avv',
  name: 'n.pr',
  npr: 'n.pr',
  pron: 'pron',
  pro: 'pron',
  prep: 'prep',
  pre: 'prep',
  conj: 'cong',
  con: 'cong',
  intj: 'inter',
  int: 'inter',
  article: 'art',
  art: 'art',
  artpre: 'art',
  det: 'det',
  num: 'num',
  particle: 'part',
  prefix: 'pref',
  suffix: 'suff',
  phrase: 'loc',
  adv_phrase: 'loc.avv',
  prep_phrase: 'loc.prep',
  abbrev: 'abbr',
  abl: 'abbr',
  symbol: 'sim',
  sym: 'sim',
  smi: 'sim',
  character: 'car',
  affix: 'aff',
};

/**
 * Costruisce `word-index.br`: la categoria grammaticale di ogni parola e
 * l'indicazione se ha una voce su Wikizionario.
 *
 * Priorità della fonte del tag:
 *  1. Wikizionario (headword + categoria, la più precisa);
 *  2. Morph-it (categoria del lemma: la flessione eredita il tag);
 *  3. `n.c.` (non classificata) — marginale con il filtro headword.
 *
 * Formato BUCKET, non una riga per parola: `tag\nparola parola …\n` per ogni
 * categoria, più due sezioni di link (`~w` = voce Wikizionario, `~n` = nessuna)
 * e `~acc` per le forme accentate. Con una riga per parola il file pesava 757 KB,
 * così scende a ~700 KB e il server lo carica in una mappa unica.
 */
async function writeWordIndex(sorted, morphPath, wiktionary) {
  // Morph-it: forma → categoria (o categorie) del lemma.
  const morphPos = new Map();
  const morphRaw = new TextDecoder('latin1').decode(await readFile(morphPath));
  for (const line of morphRaw.split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const w = normalizeWord(parts[0]);
    if (!w) continue;
    // `VER:ind+pres+3+s` → `ver` → `verb`; `NOUN-F:s` → `noun` → `sost`.
    const key = parts[2].split(':')[0].split('-')[0].trim().toLowerCase();
    const cat = POS_LABEL[key];
    if (!cat) continue;
    const cur = morphPos.get(w);
    if (cur) {
      if (!cur.includes(cat)) morphPos.set(w, `${cur} ${cat}`);
    } else {
      morphPos.set(w, cat);
    }
  }

  const buckets = new Map();
  const linked = [];
  let withTag = 0;
  for (const w of sorted) {
    const wiki = wiktionary?.byWord.get(w) ?? null;
    const tag = wiki ?? morphPos.get(w) ?? 'n.c.';
    if (tag !== 'n.c.') withTag++;
    const list = buckets.get(tag) ?? [];
    list.push(w);
    buckets.set(tag, list);
    if (wiki) linked.push(w);
  }

  // Testo e scrittura sono condivisi con il percorso offline (`writeWordIndexFile`),
  // così il formato non può divergere fra i due build.
  const { br } = await writeWordIndexFile(buckets, linked, wiktionary?.accents ?? new Map(), sorted);
  console.log(
    `✓ word-index.br  ${sorted.length.toLocaleString('it-IT')} voci, ${withTag.toLocaleString('it-IT')} con tag (${((withTag / sorted.length) * 100).toFixed(1)}%), ${linked.length.toLocaleString('it-IT')} con voce Wikizionario  (${(br.length / 1024).toFixed(0)} KB)`,
  );
}

/**
 * Compone il testo di `word-index.br` dai bucket (formato documentato sopra).
 * Estratto da `writeWordIndex` per essere riusabile anche nel percorso offline.
 */
function composeWordIndexText(buckets, linked, accents) {
  let text = '';
  for (const tag of [...buckets.keys()].sort()) {
    text += `${tag}\n${buckets.get(tag).join(' ')}\n`;
  }
  /*
   * Solo le parole CON voce su Wikizionario: l'assenza da questo elenco significa
   * "nessun link", quindi ripetere anche le altre sarebbe peso inutile.
   */
  text += `~w\n${linked.join(' ')}\n`;
  if (accents.size > 0) {
    const accentLines = [...accents]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([norm, display]) => `${norm}\t${display}`);
    text += `~acc\n${accentLines.join('\n')}\n`;
  }
  return text;
}

/** Scrive `word-index.br` compresso. */
async function writeWordIndexFile(buckets, linked, accents, sorted) {
  const text = composeWordIndexText(buckets, linked, accents);
  const br = brotliCompressSync(Buffer.from(text, 'utf8'), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  await writeFile(path.join(DATA, 'word-index.br'), br);
  return { br, text };
}

/**
 * Caso offline: le fonti grezze non ci sono, ma `words.txt` esiste.
 * Il dizionario e' gia' generato: applichiamo il filtro canonico (così un
 * dizionario vecchio viene ripulito dai troncamenti) e riscriviamo l'output.
 * E' il percorso usato nei build di deploy (Netlify, Docker).
 *
 * Genera ANCHE `word-index.br`: prima questo percorso non lo produceva, quindi in
 * produzione la tab Dizionario restava vuota e i tag sparivano (bug noto). I tag
 * grammaticali (`pos`) non sono ricostruibili senza Morph-it, che è gitignored e
 * non arriva nei build di deploy: in quel caso l'indice contiene tutte le parole
 * con categoria `n.c.`, il che ripristina almeno l'elenco completo del lessico e i
 * link a Wikizionario (da `wiktionary-heads.br`, che è versionato). Per i tag
 * pieni serve `build:full` (o rigenerare e versionare `word-index.br`).
 */
async function buildFromExistingWords() {
  const existing = path.join(DATA, 'words.txt');
  const blocked = await loadBlocked();
  const allowedEndings = await loadCuratedList('consonant-endings.txt');
  const abbreviations = await loadCuratedList('abbreviations.txt');
  const accepted = makePlayableFilter({ allowedEndings, abbreviations, blocked });

  let dropped = 0;
  const words = new Set();
  for (const line of (await readFile(existing, 'utf8')).split('\n')) {
    const w = normalizeWord(line.trim());
    if (!w) continue;
    if (accepted(w)) words.add(w);
    else if (isUsable(w)) dropped++;
  }
  /*
   * Aggiunge le voci della whitelist in consonante che non fossero nel dizionario
   * precedente: senza questo, un dizionario vecchio resterebbe incoerente con la
   * whitelist usata dalle schede (`tag`, `host`, `flip` mancherebbero ancora).
   */
  for (const w of allowedEndings) {
    if (accepted(w)) words.add(w);
  }
  const sorted = [...words].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const { txt, br } = await writeOutputs(sorted);
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`✓ words.txt  ${sorted.length.toLocaleString('it-IT')} parole  (${kb(txt.length)})  [da lista gia' generata]`);
  console.log(`✓ words.br   ${kb(br.length)}  (ratio ${((br.length / txt.length) * 100).toFixed(1)}%)`);
  if (dropped > 0) {
    console.log(`  ripulite ${dropped.toLocaleString('it-IT')} voci non giocabili (troncamenti/abbreviazioni non ammesse)`);
  }

  /*
   * Indice parole: i tag pieni richiedono Morph-it (assente nei build di deploy),
   * quindi qui mettiamo tutte le parole in un unico bucket `n.c.` più i link di
   * Wikizionario. Senza almeno questo, la tab Dizionario restava vuota.
   */
  const wiktionary = await loadWiktionary();
  const buckets = new Map();
  const linked = [];
  for (const w of sorted) {
    const list = buckets.get('n.c.') ?? [];
    list.push(w);
    buckets.set('n.c.', list);
    if (wiktionary?.byWord.has(w)) linked.push(w);
  }
  const { br: idxBr } = await writeWordIndexFile(buckets, linked, wiktionary?.accents ?? new Map(), sorted);
  console.log(
    `✓ word-index.br  ${sorted.length.toLocaleString('it-IT')} voci, ${linked.length.toLocaleString('it-IT')} con voce Wikizionario  (${(idxBr.length / 1024).toFixed(0)} KB)`,
  );
  if (!wiktionary) {
    console.warn('  ⚠ wiktionary-heads.br assente: nessun link di dizionario e nessun tag.');
  }
  console.log('  (fonti grezze assenti: tag grammaticali limitati. Usa `build:full` per la copertura piena!)');
}

async function main() {
  const morphPath = await findMorphIt();

  // Nessuna fonte grezza ma dizionario presente: build offline.
  if (!morphPath) {
    if (existsSync(path.join(DATA, 'words.txt'))) {
      await buildFromExistingWords();
      return;
    }
    throw new Error(
      'Nessuna fonte disponibile. Esegui `pnpm --filter @boggle/dictionary build:full` per scaricare le fonti.',
    );
  }

  const words = new Set();
  const blocked = await loadBlocked();
  // Liste canoniche: definiscono cosa è una parola giocabile (vedi sopra).
  const allowedEndings = await loadCuratedList('consonant-endings.txt');
  const abbreviations = await loadCuratedList('abbreviations.txt');
  console.log(
    `  filtro giocabilità: ${allowedEndings.size} finali in consonante ammesse, ${abbreviations.size} abbreviazioni`,
  );

  /** true se la parola entra nel dizionario (e quindi è giocabile). */
  const accepted = makePlayableFilter({ allowedEndings, abbreviations, blocked });

  /*
   * 1. Morph-it: la prima colonna e' la forma flessa.
   *
   * ATTENZIONE ALL'ENCODING: Morph-it e' in ISO-8859-1 (Latin-1), NON UTF-8.
   * Leggendolo come UTF-8 gli accenti si corrompono e le forme accentate si
   * perdono: mancavano `fruirà`, `città`, `verità` e tutti i futuri in -erà/-irà
   * (2.433 parole). Decodifichiamo esplicitamente come Latin-1.
   */
  const morphRaw = new TextDecoder('latin1').decode(await readFile(morphPath));
  let morphCount = 0;
  for (const line of morphRaw.split('\n')) {
    if (!line) continue;
    const form = line.split('\t')[0];
    if (!form) continue;
    const w = normalizeWord(form);
    if (accepted(w)) {
      words.add(w);
      morphCount++;
    }
  }

  // 2. paroleitaliane: lessico comune.
  const commonPath = path.join(DATA, '60000_parole_italiane.txt');
  let commonCount = 0;
  if (existsSync(commonPath)) {
    const commonRaw = await readFile(commonPath, 'utf8');
    for (const line of commonRaw.split('\n')) {
      const w = normalizeWord(line.trim());
      if (accepted(w)) {
        if (!words.has(w)) commonCount++;
        words.add(w);
      }
    }
  } else {
    console.warn('⚠ 60000_parole_italiane.txt assente: salto l\'integrazione');
  }

  /*
   * 2b. Lista estesa (280k): sostantivi e aggettivi che Morph-it non copre.
   *
   * È la fonte che risolve `anta`, `broccoli`, `spinaci`, `aspirapolvere`,
   * `abaco`, `alce`. Non sostituisce le altre: le completa.
   *
   * FILTRO HEADWORD: essendo una lista PIATTA (senza analisi grammaticale)
   * contiene anche rumore — `acta`, `agfa`, `baili`, `burbe`, `savere`. Una parola
   * che non è già stata accettata da Morph-it/60k entra solo se è una voce
   * autonoma di Wikizionario. Senza il filtro (o se il dump manca) si accetta
   * tutto, come prima: il gioco resta giocabile, con qualche parola in più.
   */
  const wiktionary = await loadWiktionary();
  const extendedPath = path.join(DATA, '280000_parole_italiane.txt');
  let extendedCount = 0;
  let extendedDropped = 0;
  if (existsSync(extendedPath)) {
    const extendedRaw = await readFile(extendedPath, 'utf8');
    for (const line of extendedRaw.split('\n')) {
      const w = normalizeWord(line.trim());
      if (!accepted(w)) continue;
      // Già coperta da una fonte con analisi grammaticale: nessun dubbio.
      if (words.has(w)) continue;
      if (wiktionary && !wiktionary.byWord.has(w)) {
        extendedDropped++;
        continue;
      }
      extendedCount++;
      words.add(w);
    }
  } else {
    console.warn('⚠ 280000_parole_italiane.txt assente: sostantivi comuni limitati');
  }
  if (wiktionary) {
    console.log(`  headword Wikizionario: ${wiktionary.byWord.size.toLocaleString('it-IT')}, ${wiktionary.accents.size.toLocaleString('it-IT')} forme accentate`);
    console.log(`  lista piatta scartata (non attestata): ${extendedDropped.toLocaleString('it-IT')}`);
  } else {
    console.warn('⚠ wiktionary-heads.br assente: nessun filtro sugli headword');
  }

  /*
   * 3. Composti e neologismi curati.
   *
   * Morph-it analizza `dona` e `la` separatamente, quindi `donala` non esiste
   * come forma unica in nessuna fonte; lo stesso per i neologismi (`googlare`,
   * `taggare`). Queste liste li aggiungono a mano.
   */
  const modernPath = path.join(DATA, 'modern-words.txt');
  let modernCount = 0;
  if (existsSync(modernPath)) {
    const modernRaw = await readFile(modernPath, 'utf8');
    for (const line of modernRaw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const w = normalizeWord(trimmed);
      if (accepted(w)) {
        if (!words.has(w)) modernCount++;
        words.add(w);
      }
    }
  }

  // 4. Abbreviazioni curate.
  const abbrPath = path.join(DATA, 'abbreviations.txt');
  let abbrCount = 0;
  if (existsSync(abbrPath)) {
    const abbrRaw = await readFile(abbrPath, 'utf8');
    for (const line of abbrRaw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const w = normalizeWord(trimmed);
      if (accepted(w)) {
        if (!words.has(w)) abbrCount++;
        words.add(w);
      }
    }
  }

  /*
   * 5. Parole in consonante ammesse dalla whitelist (`consonant-endings.txt`).
   *
   * PERCHÉ SERVE: il pool delle schede aggiunge questa lista alle parole valide
   * (`schedaPool.ts`, `allowedKept`), ma il dizionario non la usava come sorgente.
   * Risultato: `tag`, `host`, `flip`, `foul`, `report` finivano nelle schede senza
   * essere nel dizionario (schede "stale"). Aggiungendola qui, i due insiemi
   * coincidono: sono le stesse parole in entrambi i lati.
   */
  let endingCount = 0;
  for (const w of allowedEndings) {
    if (accepted(w)) {
      if (!words.has(w)) endingCount++;
      words.add(w);
    }
  }


  const sorted = await writeDictionary(words);
  await writeWordIndex(sorted, morphPath, wiktionary);

  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(`  da Morph-it: ${morphCount.toLocaleString('it-IT')}`);
  console.log(`  da comuni:   +${commonCount.toLocaleString('it-IT')}`);
  console.log(`  lista estesa: +${extendedCount.toLocaleString('it-IT')}`);
  console.log(`  abbreviazioni: +${abbrCount}`);
  console.log(`  finali in consonante: +${endingCount}`);
  console.log(`  composti e neologismi: +${modernCount}`);
}

// Eseguito direttamente?
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('✗', err.message);
    process.exit(1);
  });
}
