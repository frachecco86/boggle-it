// Genera la lista delle parole che terminano in consonante ed esistono davvero.
//
// Uso: node tools/gen-consonant-endings.mjs
//
// PERCHE' QUESTO SCRIPT
// Le schede scartano le forme che finiscono in consonante, perche' le fonti sono
// piene di TRONCAMENTI che non sono parole (`andar`, `abbic`, `abrog`, `maggior`).
// La vecchia regola era una lista curata a mano di 171 voci: piccola e incompleta,
// quindi parole vere come `tic`, `con`, `far`, `mar` restavano escluse.
//
// IL CRITERIO CORRETTO (da Morph-it, non un'euristica)
// Morph-it indica per ogni forma il suo LEMMA. Quindi:
//   - `tic`   -> lemma `tic`   => parola autonoma, si tiene
//   - `andar` -> lemma `andare`=> troncamento, si scarta
//   - `con`   -> lemma `con`   => parola autonoma
//
// ATTENZIONE ALL'ENCODING: Morph-it e' in ISO-8859-1 (Latin-1), NON UTF-8.
// Letto come UTF-8 gli accenti diventano byte invalidi e `normalita'` sembra
// un troncamento (`normalit`). Va decodificato come Latin-1.
//
// Sono esclusi i nomi propri (NPR), i simboli/emoticon (SMI) e le abbreviazioni (ABR):
// non sono parole componibili in una griglia.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MORPH = path.join(ROOT, 'packages/dictionary/data/morph-it_048.txt');
const CURATED = path.join(ROOT, 'packages/dictionary/data/consonant-endings.curated.txt');
const OUT = path.join(ROOT, 'packages/dictionary/data/consonant-endings.txt');

if (!existsSync(MORPH)) {
  console.error('✗ Morph-it non trovato in packages/dictionary/data/morph-it_048.txt');
  console.error('  Esegui prima: pnpm build:dict  (oppure pnpm --filter @boggle/dictionary fetch)');
  process.exit(1);
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

// Morph-it e' Latin-1: decodifica esplicita, altrimenti gli accenti si corrompono.
const morphText = new TextDecoder('latin1').decode(readFileSync(MORPH));

const autonome = new Set();
let scartateAccento = 0;
let scartateTipo = 0;
let scartateRumore = 0;
let infinitiTroncati = 0;

/**
 * Rumore da escludere. Criteri derivati ispezionando le voci che Morph-it
 * registra come autonome ma che non hanno posto in un gioco di parole.
 */
/**
 * Parole funzionali: articoli, preposizioni e congiunzioni.
 *
 * Erano gia' nella lista curata originale, ma non ha senso "trovare" `il` o `nel`
 * in una griglia: sono parole grammaticali, non lessicali. Le escludiamo qui.
 */
const PAROLE_FUNZIONALI = new Set([
  'a', 'ad', 'al', 'all', 'alla', 'allo', 'ai', 'agli', 'alle',
  'da', 'dal', 'dall', 'dalla', 'dai', 'dagli', 'dalle',
  'dei', 'del', 'dell', 'della', 'delle', 'degli', 'di',
  'e', 'ed', 'il', 'in', 'la', 'le', 'lo', 'i', 'gli',
  'nel', 'nell', 'nella', 'nelle', 'nei', 'negli',
  'non', 'o', 'od', 'per', 'pel', 'su', 'sul', 'sull', 'sui', 'sugli',
  'un', 'una', 'uno', 'che', 'chi', 'cui',
]);

const ESPLICITAMENTE_ESCLUSE = new Set([
  // parole funzionali inglesi o forme isolate, non componibili in italiano
  'all',
  // interiezioni e versi
  'aahh', 'ahah', 'uauuhh', 'ahhh', 'ohhh', 'mmmh', 'boh', 'beh', 'mah',
]);

/**
 * Composti `anti*` formati da un NOME PROPRIO o un acronimo.
 *
 * Morph-it registra `antibush`, `anticlinton`, `antibnp`, `antiarafat`: sono
 * coniazioni giornalistiche, non parole del lessico. Si riconoscono perche' la
 * parte dopo `anti` non e' una parola italiana (`bush`, `bnp`, `dc`, `pkk`).
 * Teniamo invece i composti reali: `antialcol`, `antidoping`, `antivirus`,
 * `antifurto`, `antismog`, `antiracket`, `antitrust`, `antigas`.
 */
const ANTI_LEGITTIMI = new Set([
  'antialcol', 'antidoping', 'antivirus', 'antifurto', 'antismog', 'antiracket',
  'antitrust', 'antigas', 'antico', 'anticipo', 'antipasto', 'antipatico',
  'antiquariato', 'antivigilia', 'antidoto', 'antiossidante',
]);

const isAntiInventato = (w) => w.startsWith('anti') && w.length > 4 && !ANTI_LEGITTIMI.has(w);

const isRumore = (w) =>
  isAntiInventato(w) ||
  // 3+ lettere identiche consecutive: versi (`ahhh`, `mmmh`)
  /(.)\1{2,}/.test(w) ||
  // sigle senza vocali: impossibili da comporre
  !/[aeiou]/.test(w) ||
  // troppo lunga per stare in una griglia (max 6x6 = 10 lettere utili)
  w.length > 11 ||
  ESPLICITAMENTE_ESCLUSE.has(w) ||
  PAROLE_FUNZIONALI.has(w);

for (const line of morphText.split('\n')) {
  if (!line) continue;
  const [formaRaw, lemmaRaw, tratti = ''] = line.split('\t');
  if (!formaRaw || !lemmaRaw) continue;

  /*
   * Tipi grammaticali da escludere: non sono parole giocabili.
   *   NPR    nomi propri (`Adams`, `Airbus`)
   *   SMI    simboli ed emoticon (`-D`, `:-p`)
   *   ABR    abbreviazioni (`ecc`, `dott`)
   *   INT    interiezioni e versi (`aleohoh`, `boh`)
   *   ARTPRE articoli e preposizioni (`all`, `del`, `nel`): parole funzionali
   *          che non ha senso "trovare" in una griglia
   */
  const tipo = tratti.toUpperCase();
  if (
    tipo.startsWith('NPR') ||
    tipo.startsWith('SMI') ||
    tipo.startsWith('ABR') ||
    tipo.startsWith('INT') ||
    tipo.startsWith('ARTPRE')
  ) {
    scartateTipo++;
    continue;
  }

  // Una forma che perde una lettera ACCENTATA finale non e' un troncamento:
  // e' la forma piena letta male (`normalità` -> `normalit`). La scartiamo qui
  // perche' la sua versione normalizzata e' assimilabile a un troncamento.
  if (/[àèéìòóùáíú]$/.test(formaRaw.toLowerCase())) {
    scartateAccento++;
    continue;
  }

  const forma = norm(formaRaw);
  const lemma = norm(lemmaRaw);
  if (forma.length < 3 || !endsInConsonant(forma)) continue;

  if (isRumore(forma)) {
    scartateRumore++;
    continue;
  }

  // Parola autonoma: il lemma coincide con la forma (`tic`, `con`, `per`).
  if (lemma === forma) {
    autonome.add(forma);
    continue;
  }

  /*
   * Infiniti troncati CORTO-COMUNI: `far` (fare), `dir` (dire), `dar` (dare),
   * `star` (stare), `par` (parere). Sono italiano corretto e usatissimo.
   *
   * ATTENZIONE: il criterio "forma + e = lemma" da solo e' SBAGLIATO, perche'
   * vale anche per i troncamenti delle fonti: `alzar` + `e` = `alzare` esiste,
   * ma `alzar` NON e' italiano. Misurando Morph-it, gli infiniti troncati
   * realmente in uso sono SOLO di 3-4 lettere:
   *   3: ber, dar, dir, far
   *   4: adir, agir, amar, aver, orar, osar, star, udir, unir, usar...
   * Da 5 lettere in su (`alzar`, `andar`, `affar`, `abitar`) sono troncamenti
   * delle fonti. Quindi il limite a 4 lettere e' il criterio, non una stima.
   */
  if (tipo.startsWith('VER') && forma.length <= 4 && lemma === forma + 'e') {
    autonome.add(forma);
    infinitiTroncati++;
  }
}

// La lista curata ha la precedenza per commenti e ordinamento; la leggo per preservarla.
const curatedRaw = existsSync(CURATED)
  ? readFileSync(CURATED, 'utf8')
  : existsSync(OUT)
    ? readFileSync(OUT, 'utf8')
    : '';
const curated = curatedRaw
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map(norm)
  .filter((w) => w.length >= 3);

const all = [...new Set([...curated, ...autonome])]
  .filter((w) => !PAROLE_FUNZIONALI.has(w) && !isRumore(w))
  .sort((a, b) => a.localeCompare(b, 'it'));

const oggi = new Date().toISOString().slice(0, 10);
const out = `# Parole italiane che terminano in CONSONANTE e sono realmente valide.
#
# ⚠️ FILE GENERATO da tools/gen-consonant-endings.mjs — non modificare a mano.
#    Per aggiungere voci curate usa \`consonant-endings.curated.txt\`.
#    Rigenerato il ${oggi}: ${all.length} voci (${curated.length} curate + ${autonome.size} da Morph-it).
#
# Perche' serve: le fonti contengono migliaia di forme TRONCATE che non sono parole
# (\`andar\`, \`abbic\`, \`abrog\`, \`maggior\`). Il generatore delle schede tiene una parola
# se TERMINA IN VOCALE oppure se compare in questa lista.
#
# Il criterio non e' un'euristica: viene dal LEMMA di Morph-it.
#   tic    -> lemma tic    => parola autonoma ✓
#   andar  -> lemma andare => troncamento ✗
# Sono esclusi nomi propri, simboli e abbreviazioni.

${all.join('\n')}
`;

writeFileSync(OUT, out);
console.log(`✓ ${all.length} voci scritte in packages/dictionary/data/consonant-endings.txt`);
console.log(`  di cui curate a mano: ${curated.length}`);
console.log(`  da Morph-it (lemma = forma): ${autonome.size}`);
console.log(`  scartate per tipo (NPR/SMI/ABR): ${scartateTipo.toLocaleString('it-IT')}`);
console.log(`  scartate per accento finale: ${scartateAccento.toLocaleString('it-IT')}`);
console.log(`  scartate come rumore (versi/sigle/composti): ${scartateRumore.toLocaleString('it-IT')}`);
console.log(`  infiniti troncati legittimi (far, dir): ${infinitiTroncati}`);
console.log(`\n  esempi: ${all.slice(0, 30).join(', ')}`);
