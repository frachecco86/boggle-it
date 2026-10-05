// Genera la lista delle parole TECNICHE che le fonti scartavano per mancanza di
// attestazione su Wikizionario.
//
// Uso: node tools/gen-technical-words.mjs
//
// IL PROBLEMA CHE RISOLVE
// `build-words.mjs` accetta la lista piatta dei 280k solo se la parola e' una voce
// autonoma di Wikizionario (`wiktionary-heads.br`). Il filtro serve: la lista
// piatta contiene rumore (`acta`, `agfa`, `baili`, `savere`). Ma Wikizionario ha
// copertura debole sui TECNICISMI, quindi il filtro scarta ~83k voci, e fra queste
// ci sono parole italiane vere: `setosa` (botanica/zoologia, da `seta`),
// `absidale`, `accelerometrico`, `mucillaginoso`, `arenaceo`.
//
// IL CRITERIO (due prove indipendenti, non un'euristica)
// Una voce entra in questa lista solo se supera ENTRAMBE:
//   1. DERIVAZIONE REGOLARE: e' `base + suffisso` di una base ATTESTATA nel
//      dizionario (parola del lessico corrente, quindi gia' accettata dal gioco).
//      E' il criterio che distingue `setoso` (da `seta`) da `agfa`.
//   2. ATTESTAZIONE DELLA FORMA: la forma compare nella lista piatta dei 280k.
//
// IDEMPOTENZA
// Le basi sono il LESSICO CANONICO, cioe' `words.txt` MENO la whitelist scritta
// dall'esecuzione precedente. Serve: `words.txt` e' l'output del build e contiene
// gia' le voci di questa lista, quindi senza la sottrazione la lista crescerebbe a
// ogni esecuzione (le proprie voci diventerebbero basi di nuovi derivati).
//
// REGOLA DEL PARADIGMA (>=2 forme)
// Almeno DUE forme dello stesso paradigma devono essere attestate nella lista
// piatta. E' il filtro che elimina i falsi positivi della regola 1: il gerundio
// con clitico `abbarbicandosi` si scompone come `abbarbicand` + `osi`, ma
// `abbarbicandoso` non esiste, quindi il paradigma non e' completo e la voce cade.
// Vale anche per le forme verbali isolate (`mozzica`) che non sono derivati.
//
// PERCHE' NON `-ano` NE' `-ario`
// Sono i due suffissi piu' produttivi e piu' ambigui: `-ano` cattura le terze
// persone plurali (`argentano`) e gli etnici (`mozambicano`), `-ario` i plurali
// di nomi rari (`armari`, `pomari`, `limani`). Non sono tecnicismi e sporcano il
// dizionario: restano fuori. Vedi la misura in `docs/`.
//
// ATTENZIONE: qui NON entrano parole che terminano in consonante. Il filtro di
// giocabilita' (`schedaPool.ts`) accetta una parola in consonante solo se sta in
// `consonant-endings.txt`, che e' l'UNICA fonte di verita' per quel caso. Se una
// voce tecnica termina in consonante, va aggiunta la', non qui.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'packages/dictionary/data');

const WORDS = path.join(DATA, 'words.txt');
const FLAT = path.join(DATA, '280000_parole_italiane.txt');
const BLOCKED = path.join(DATA, 'blocked-words.txt');
const CURATED = path.join(DATA, 'technical-words.curated.txt');
const OUT = path.join(DATA, 'technical-words.txt');

for (const [file, hint] of [
  [WORDS, 'pnpm --filter @boggle/dictionary ensure'],
  [FLAT, 'pnpm --filter @boggle/dictionary fetch'],
]) {
  if (!existsSync(file)) {
    console.error(`✗ manca ${path.relative(ROOT, file)}`);
    console.error(`  Esegui prima: ${hint}`);
    process.exit(1);
  }
}

/** Normalizza come il resto del progetto: minuscolo, accenti tolti, solo a-z. */
const norm = (w) =>
  w
    .toLowerCase()
    .replace(/[àáâä]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[^a-z]/g, '');

const endsInConsonant = (w) => /[bcdfghjklmnpqrstvwxyz]$/.test(w);

/*
 * Paradigmi ammessi: suffisso canonico -> tutte le forme + categoria grammaticale.
 *
 * Il tag viene scritto accanto alla parola (`parola<TAB>agg`) e finisce in
 * `word-index.br`: senza, le ~4.3k voci entrerebbero come `n.c.` e farebbero
 * scendere la copertura dei tag che il progetto misura a ogni build.
 */
const GROUPS = {
  oso: { forms: ['oso', 'osa', 'osi', 'ose'], tag: 'agg' },
  ico: { forms: ['ico', 'ica', 'ici', 'iche'], tag: 'agg' },
  ale: { forms: ['ale', 'ali'], tag: 'agg' },
  aceo: { forms: ['aceo', 'acea', 'acee', 'acei'], tag: 'agg' },
  ifero: { forms: ['ifero', 'ifera', 'iferi', 'ifere'], tag: 'agg' },
  iforme: { forms: ['iforme', 'iformi'], tag: 'agg' },
  istico: { forms: ['istico', 'istica', 'istici', 'istiche'], tag: 'agg' },
  ivo: { forms: ['ivo', 'iva', 'ivi', 'ive'], tag: 'agg' },
  ense: { forms: ['ense', 'ensi'], tag: 'agg' },
  // `-oide` NON e' solo aggettivale: `coroide` (anatomia) e' un sostantivo.
  oide: { forms: ['oide', 'oidi'], tag: 'n.c.' },
};

/** Legge una lista, una voce per riga, righe `#` e vuote ignorate. */
function readList(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0])
    .map(norm)
    .filter(Boolean);
}

const base = new Set(readList(WORDS));
const flat = new Set(readList(FLAT));
const blocked = new Set(readList(BLOCKED));

/*
 * IDEMPOTENZA — perché si sottrae la whitelist PRECEDENTE dal lessico delle basi.
 *
 * `words.txt` è l'OUTPUT del build, e il build ci mette dentro le voci di
 * `technical-words.txt`. Se il generatore usasse `words.txt` così com'è, al
 * secondo giro troverebbe le proprie voci già nel lessico, le userebbe come BASI
 * e produrrebbe un anello ulteriore di derivati sempre più oscuri: la lista
 * crescerebbe a ogni esecuzione e non sarebbe più riproducibile.
 *
 * Sottraendo la whitelist precedente (che comprende anche le voci curate), le
 * basi tornano a essere il LESSICO CANONICO — quello che il gioco accettava prima
 * della whitelist. È anche il criterio giusto: vogliamo riammettere i derivati di
 * basi già note, non inventarne di nuovi a catena. Così due esecuzioni di fila
 * producono lo stesso file.
 */
const prevTech = new Set(readList(OUT));
for (const w of prevTech) base.delete(w);

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** parola -> { tag, base, group } */
const generated = new Map();
let paradigmiScartati = 0;

for (const b of base) {
  // Base troppo corta o in consonante: nessuna derivazione affidabile.
  if (b.length < 4 || !VOWELS.has(b[b.length - 1])) continue;
  const stem = b.slice(0, -1);
  if (stem.length < 2) continue;

  for (const [group, { forms, tag }] of Object.entries(GROUPS)) {
    const present = forms
      .map((s) => stem + s)
      .filter((c) => c.length >= 3 && c.length <= 16 && flat.has(c) && !blocked.has(c));
    // Regola del paradigma: una forma sola non basta (vedi la nota in testa).
    if (present.length < 2) {
      if (present.length === 1) paradigmiScartati++;
      continue;
    }
    for (const cand of present) {
      if (base.has(cand)) continue; // gia' nel lessico: niente da fare
      if (!generated.has(cand)) generated.set(cand, { tag, base: b, group });
    }
  }
}

/*
 * Le voci curate a mano hanno la PRECEDENZA sulla generazione: servono a
 * correggere un tag o ad aggiungere un tecnicismo che le regole non coprono.
 * Si raccolgono in una mappa per parola, così l'uscita resta ordinata
 * alfabeticamente invece di avere le curate in testa al file.
 */
const entries = new Map();
for (const [w, { tag }] of generated) entries.set(w, tag);
let curatedCount = 0;
if (existsSync(CURATED)) {
  for (const line of readFileSync(CURATED, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [rawWord, rawTag] = trimmed.split(/\s+/);
    const w = norm(rawWord ?? '');
    if (!w) continue;
    const tag = (rawTag ?? '').toLowerCase();
    entries.set(w, tag || 'n.c.');
    curatedCount++;
  }
}

const ordered = [...entries.entries()].sort((a, b) => a[0].localeCompare(b[0], 'it'));

const perTag = {};
for (const [, tag] of ordered) perTag[tag] = (perTag[tag] ?? 0) + 1;
const oggi = new Date().toISOString().slice(0, 10);
const righe = ordered.map(([w, tag]) => `${w}\t${tag}`).join('\n');

const out = `# Parole TECNICHE italiane che il filtro di attestazione di Wikizionario
# scartava pur essendo parole reali (derivati regolari, tecnicismi, etnici).
#
# ⚠️ FILE GENERATO da tools/gen-technical-words.mjs — non modificare a mano.
#    Per aggiungere o correggere voci usa \`technical-words.curated.txt\`.
#    Rigenerato il ${oggi}: ${ordered.length} voci (${curatedCount} curate + ${generated.size} generate).
#    Categorie: ${Object.entries(perTag).map(([t, n]) => `${t} ${n}`).join(', ')}.
#
# PERCHE' SERVE
# La lista piatta dei 280k entra nel dizionario solo se la voce e' attestata su
# Wikizionario (\`wiktionary-heads.br\`). Il filtro scarta il rumore (\`acta\`,
# \`agfa\`, \`baili\`) ma anche ~83k voci, fra cui parole italiane vere:
#   \`setosa\`  (botanica/zoologia, da \`seta\`)   \`absidale\` (da \`abside\`)
#   \`arenaceo\` (geologia)                        \`accelerometrico\`
# Questa lista le riammette, scavalcando il filtro (non la lista \`blocked-words.txt\`).
#
# CRITERIO (due prove indipendenti)
#   1. derivazione regolare da una base ATTESTATA nel lessico (\`setoso\` da \`seta\`);
#   2. presenza nella lista piatta dei 280k.
# Più la REGOLA DEL PARADIGMA: almeno 2 forme dello stesso paradigma attestate,
# che elimina i falsi positivi (il gerundio \`abbarbicandosi\` = \`abbarbicand\`+\`osi\`).
# Sono esclusi \`-ano\` e \`-ario\`: catturano terze persone plurali e plurali rari,
# non tecnicismi.
#
# ⚠️ NIENTE PAROLE IN CONSONANTE: quelle vanno in \`consonant-endings.txt\`, che è
#    l'unica fonte di verità per il filtro di giocabilità (\`schedaPool.ts\`).
#
# FORMATO: \`parola\` oppure \`parola<TAB>tag\` (tag = \`agg\`, \`sost\`, \`n.c.\`, …).
# Il tag finisce in \`word-index.br\` ed è quello mostrato nella pagina Parole.

${righe}
`;

writeFileSync(OUT, out);
console.log(`✓ ${ordered.length} voci scritte in packages/dictionary/data/technical-words.txt`);
console.log(`  curate a mano: ${curatedCount}`);
console.log(`  generate: ${generated.size}`);
console.log(`  per categoria: ${Object.entries(perTag).map(([t, n]) => `${t} ${n}`).join(', ')}`);
console.log(`  paradigmi incompleti scartati: ${paradigmiScartati.toLocaleString('it-IT')}`);
console.log(`\n  esempi: ${ordered.slice(0, 12).map(([w]) => w).join(', ')}`);
