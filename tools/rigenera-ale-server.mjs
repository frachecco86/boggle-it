/**
 * Rigenera le schede "ale" generate a runtime su un server (schede-ale/).
 *
 * Perché serve: le schede ale create dal pannello admin NON stanno in git, vivono
 * nel volume del server (`DATA_DIR/schede-ale/`). Quando cambia la calibrazione
 * (metrica ad anelli, rail delle rare) o la scala dei punteggi, quelle schede
 * restano con la semantica vecchia pur essendo taggate `ale`: la difficoltà non è
 * più omogenea con il catalogo versonato. Questo script le mette da parte,
 * svuota la cartella dal pannello (scope `ale`) e rigenera i lotti con il codice
 * che il server ha in esecuzione.
 *
 * Sicurezze:
 *   - di default è un DRY-RUN: mostra cosa farebbe e non tocca niente;
 *   - prima di cancellare scarica un BACKUP JSON di tutte le schede ale;
 *   - rifiuta di procedere se il server non usa la scala Boggle classica
 *     (segno che gira ancora il codice vecchio: rigenerare non servirebbe);
 *   - verifica i gate delle rare sulle schede appena create;
 *   - non tocca `schede-extra/`, né il catalogo base versionato.
 *
 * Uso:
 *   SERVER_URL=https://... ADMIN_USER=... ADMIN_PASSWORD=... \
 *     node tools/rigenera-ale-server.mjs                    # dry-run
 *     node tools/rigenera-ale-server.mjs --apply            # esegue
 *     node tools/rigenera-ale-server.mjs --apply --per-key 15
 *
 * Ripristino da un backup (scrive i file da copiare nel volume):
 *   node tools/rigenera-ale-server.mjs --restore backup-ale-<data>.json --out ./ripristino
 *
 * Opzioni:
 *   --url <url>            server (default: SERVER_URL o http://localhost:3001)
 *   --per-key <n>          schede ale per chiave da generare (default 15)
 *   --sizes <4,5,6>        dimensioni (default tutte)
 *   --difficulty <a,b,c>   facile,normale,difficile (default tutte)
 *   --backup-dir <dir>     dove salvare il backup (default: ./backup-ale-<data>)
 *   --no-backup            salta il backup (sconsigliato)
 *   --skip-generate        svuota e basta, senza rigenerare
 *   --skip-delete          rigenera senza svuotare (aggiunge)
 *   --verify <n>           quante schede nuove controllare per chiave (default 3)
 *   --timeout <ms>         timeout per richiesta (default 600000: la generazione è lenta)
 *   --apply                esegue davvero (senza, dry-run)
 *   --force                procede anche se la scala punteggi non è quella nuova
 *   --restore <file>       modalità ripristino da backup
 *   --out <dir>            cartella di uscita per --restore
 *   --help
 *
 * Credenziali: SOLO da ambiente (`ADMIN_USER`, `ADMIN_PASSWORD`), mai da riga di
 * comando: la history della shell non è un posto sicuro per una password.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SIZES = [4, 5, 6];
const DIFFICULTIES = ['facile', 'normale', 'difficile'];
/** Token rari H/Z/QU come nel resto della pipeline (`schedaAle.ts`). */
const RARE = new Set(['h', 'z', 'q']);

// ------------------------------------------------------------------ argomenti

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const name = a.slice(2);
    const next = argv[i + 1];
    const takesValue = next !== undefined && !next.startsWith('--');
    if (name === 'apply' || name === 'help' || name === 'force' || name === 'no-backup' ||
        name === 'skip-generate' || name === 'skip-delete') {
      out[name] = true;
    } else if (takesValue) {
      out[name] = next;
      i++;
    } else {
      out[name] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
  process.exit(0);
}

const URL_BASE = String(args.url ?? process.env.SERVER_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const TIMEOUT = Number(args.timeout ?? 600000);
const PER_KEY = Number(args['per-key'] ?? 15);
const VERIFY = Number(args.verify ?? 3);
const SIZES_SEL = args.sizes ? String(args.sizes).split(',').map((s) => Number(s.trim())) : SIZES;
const DIFFS_SEL = args.difficulty ? String(args.difficulty).split(',').map((s) => s.trim()) : DIFFICULTIES;
const APPLY = Boolean(args.apply);
const BACKUP = !args['no-backup'];

const say = {
  step: (m) => console.log(`\n▶ ${m}`),
  ok: (m) => console.log(`  ✓ ${m}`),
  info: (m) => console.log(`  · ${m}`),
  warn: (m) => console.log(`  ! ${m}`),
  err: (m) => console.error(`  ✗ ${m}`),
};

for (const s of SIZES_SEL) if (!SIZES.includes(s)) fail(`dimensione non valida: ${s}`);
for (const d of DIFFS_SEL) if (!DIFFICULTIES.includes(d)) fail(`difficoltà non valida: ${d}`);

function fail(message) {
  say.err(message);
  process.exit(1);
}

// ------------------------------------------------------------------ HTTP

let token = null;

async function api(route, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`${URL_BASE}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* risposta non JSON: la riportiamo grezza nell'errore */
  }
  if (!res.ok) {
    const detail = json?.error ?? text.slice(0, 300) ?? res.statusText;
    throw new Error(`${method} ${route} → HTTP ${res.status}: ${detail}`);
  }
  return json;
}

async function login() {
  const user = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (!user || !password) {
    fail('servono ADMIN_USER e ADMIN_PASSWORD in ambiente (non da riga di comando)');
  }
  const data = await api('/admin/login', { method: 'POST', body: { user, password }, auth: false });
  token = data.token;
  say.ok(`login riuscito (sessione ${Math.round((data.expiresInMs ?? 0) / 3600000)}h)`);
}

const catalog = () => api('/schede', { auth: false });
const scheda = (id) => api(`/schede/${encodeURIComponent(id)}`, { auth: false });

// ------------------------------------------------------------------ utilità

const norm = (grid) => String(grid).replace(/\s+/g, '').toLowerCase();
const gridChars = (grid) => norm(grid).split('');
const wordsOf = (s) => (s.words ?? []).map((w) => (typeof w === 'string' ? w : w.word));

/** Punti con la scala classica e con la lineare: per capire che codice gira. */
function scoreSums(words) {
  let linear = 0;
  let classic = 0;
  for (const w of words) {
    linear += Math.max(0, w.length - 2);
    classic += w.length <= 4 ? 1 : w.length === 5 ? 2 : w.length === 6 ? 3 : w.length === 7 ? 5 : 11;
  }
  return { linear, classic };
}

function byKey(meta) {
  const out = new Map();
  for (const m of meta) {
    const key = `${m.size}-${m.difficulty}`;
    const entry = out.get(key) ?? { standard: 0, full: 0, ale: 0, aleIds: [] };
    const variant = m.variant ?? 'standard';
    entry[variant] = (entry[variant] ?? 0) + 1;
    if (variant === 'ale') entry.aleIds.push(m.id);
    out.set(key, entry);
  }
  return out;
}

function printCatalog(label, cat) {
  const meta = Array.isArray(cat.meta) ? cat.meta : [];
  const groups = byKey(meta);
  const ale = meta.filter((m) => (m.variant ?? 'standard') === 'ale').length;
  say.info(`${label}: ${cat.total} schede totali, ${ale} ale`);
  for (const size of SIZES_SEL) {
    for (const d of DIFFS_SEL) {
      const g = groups.get(`${size}-${d}`) ?? { standard: 0, full: 0, ale: 0 };
      say.info(`  ${size}×${size} ${d.padEnd(9)} standard ${g.standard} · full ${g.full} · ale ${g.ale}`);
    }
  }
  return groups;
}

// ------------------------------------------------------------------ controlli

/**
 * Il server deve girare con la scala nuova: altrimenti rigenerare le ale
 * produrrebbe schede calibrate sulla scala vecchia (il problema che vogliamo
 * risolvere). Lo capiamo confrontando i punti esposti con le due scale.
 */
async function checkScale(cat) {
  const meta = (cat.meta ?? []).find((m) => (m.variant ?? 'standard') === 'ale') ?? (cat.meta ?? [])[0];
  if (!meta) {
    say.warn('catalogo vuoto: salto il controllo della scala punteggi');
    return 'sconosciuta';
  }
  const full = await scheda(meta.id);
  const words = wordsOf(full);
  const { linear, classic } = scoreSums(words);
  const which = meta.maxScore === classic ? 'classica' : meta.maxScore === linear ? 'lineare' : 'sconosciuta';
  say.info(`scala punteggi (da ${meta.id}): ${which} (maxScore ${meta.maxScore}, classica ${classic}, lineare ${linear})`);
  if (which !== 'classica' && !args.force) {
    fail(
      'il server non usa la scala Boggle classica: gira ancora il codice vecchio.\n' +
        '    Deploya prima master (0.41.0) su questo servizio, poi rilancia.\n' +
        '    Per procedere comunque: --force',
    );
  }
  return which;
}

// ------------------------------------------------------------------ azioni

async function doBackup(aleIds, dir) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ale-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const schede = new Array(aleIds.length);
  let done = 0;

  /*
   * Backup di TUTTE le schede ale, non solo di quelle a runtime: l'API non dice
   * da quale cartella viene una scheda, quindi non possiamo distinguerle prima
   * della cancellazione. Le ale del catalogo base sono comunque in git: averle
   * anche qui non fa danno, e il ripristino resta completo.
   * Pool di 4 richieste in parallelo: su ~500 schede la differenza si sente.
   */
  const queue = aleIds.map((id, i) => ({ id, i }));
  const pool = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      schede[item.i] = await scheda(item.id);
      done++;
      if (done % 25 === 0 || done === aleIds.length) say.info(`backup ${done}/${aleIds.length}`);
    }
  });
  await Promise.all(pool);

  const payload = {
    generatedAt: new Date().toISOString(),
    server: URL_BASE,
    total: schede.length,
    schede,
  };
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  say.ok(`backup: ${file} (${schede.length} schede, ${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
  return file;
}

async function doDelete() {
  const result = await api('/admin/schede?scope=ale&confirm=DELETE', { method: 'DELETE' });
  say.ok(`cancellate ${result.removed} schede ale (${result.files} file) · restano ${result.remaining}`);
  return result;
}

async function doGenerate() {
  const created = [];
  for (const size of SIZES_SEL) {
    for (const d of DIFFS_SEL) {
      let remaining = PER_KEY;
      while (remaining > 0) {
        // L'API accetta al massimo 100 schede per chiamata.
        const chunk = Math.min(100, remaining);
        const started = Date.now();
        const res = await api('/admin/schede/genera', {
          method: 'POST',
          body: { size, difficulty: d, count: chunk, variant: 'ale' },
        });
        remaining -= chunk;
        created.push(...res.created.map((m) => ({ ...m, size, difficulty: d })));
        say.ok(
          `${size}×${size} ${d}: +${res.created.length} ale (${Math.round((Date.now() - started) / 1000)}s) · ` +
            `totale catalogo ${res.total}`,
        );
      }
    }
  }
  return created;
}

/** I gate delle rare devono valere anche per le schede appena generate. */
async function verify(created) {
  const sample = new Map();
  for (const s of created) {
    const key = `${s.size}-${s.difficulty}`;
    const list = sample.get(key) ?? [];
    if (list.length < VERIFY) list.push(s.id);
    sample.set(key, list);
  }
  let checked = 0;
  let bad = 0;
  for (const [key, ids] of sample) {
    const difficulty = key.split('-')[1];
    for (const id of ids) {
      const full = await scheda(id);
      const chars = gridChars(full.grid);
      const rare = chars.filter((c) => RARE.has(c)).length;
      const qu = chars.includes('q');
      const h = chars.includes('h');
      const z = chars.includes('z');
      checked++;
      let ok = true;
      if (difficulty === 'difficile' && rare < 1) ok = false;
      if (difficulty === 'facile' && rare > 1) ok = false;
      if (!ok) bad++;
      say.info(
        `  ${id} · ${wordsOf(full).length} parole · rare ${rare} (Qu ${qu ? 'sì' : 'no'}, h ${h ? 'sì' : 'no'}, z ${z ? 'sì' : 'no'})` +
          (ok ? '' : '  ← FUORI GATE'),
      );
    }
  }
  if (bad > 0) say.warn(`${bad}/${checked} schede fuori dai gate delle rare`);
  else say.ok(`gate delle rare rispettati su ${checked} schede controllate`);
  return bad;
}

/**
 * La versione di formato delle schede, letta da un file del catalogo versionato:
 * così il ripristino scrive file identici a quelli che il server si aspetta anche
 * se un domani la versione cambia (niente costante duplicata a mano).
 */
function schedaFormatVersion() {
  try {
    const base = path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '..',
      'packages',
      'shared',
      'schede',
      'schede-4-facile.json',
    );
    return JSON.parse(readFileSync(base, 'utf8')).version ?? 3;
  } catch {
    return 3;
  }
}

function doRestore(file, outDir) {
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const schede = Array.isArray(payload) ? payload : payload.schede;
  if (!Array.isArray(schede)) fail(`${file}: non contiene un elenco di schede`);
  mkdirSync(outDir, { recursive: true });
  const groups = new Map();
  for (const s of schede) {
    const key = `${s.size}-${s.difficulty}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(s);
  }
  for (const [key, list] of groups) {
    const [size, difficulty] = key.split('-');
    const file = path.join(outDir, `schede-${size}-${difficulty}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        { version: schedaFormatVersion(), generatedAt: new Date().toISOString(), size: Number(size), difficulty, schede: list },
        null,
        2,
      ) + '\n',
    );
    say.ok(`${file} (${list.length} schede ale)`);
  }
  say.info(`copia questi file in <volume>/schede-ale/ e RIAVVIA il server (il catalogo si legge all'avvio)`);
}

// ------------------------------------------------------------------ main

async function main() {
  if (args.restore) {
    say.step(`Ripristino da ${args.restore}`);
    if (!args.out) fail('serve --out <cartella> con --restore');
    doRestore(String(args.restore), String(args.out));
    return;
  }

  say.step(`Server ${URL_BASE}${APPLY ? '' : '  (DRY-RUN: nessuna modifica)'}`);
  await login();

  const before = await catalog();
  say.step('Catalogo attuale');
  printCatalog('prima', before);

  const meta = Array.isArray(before.meta) ? before.meta : [];
  const aleIds = meta.filter((m) => (m.variant ?? 'standard') === 'ale').map((m) => m.id);
  if (aleIds.length === 0) say.warn('nessuna scheda ale a runtime: c\'è solo quella del catalogo base');

  say.step('Controllo del codice in esecuzione');
  await checkScale(before);

  const planned = SIZES_SEL.length * DIFFS_SEL.length * PER_KEY;
  say.step('Piano');
  say.info(`ale ora nel catalogo: ${aleIds.length} (base versionata + runtime)`);
  say.info('verranno cancellate SOLO le ale a runtime, cioè quelle in <volume>/schede-ale/');
  say.info(`da generare: ${planned} schede ale (${SIZES_SEL.join('/')} × ${DIFFS_SEL.join('/')} × ${PER_KEY} per chiave)`);
  say.info('intatte: schede standard, full e il catalogo versionato in packages/shared/schede');
  if (SIZES_SEL.length !== SIZES.length || DIFFS_SEL.length !== DIFFICULTIES.length) {
    say.warn(
      'ATTENZIONE: lo svuotamento è GLOBALE (tutta schede-ale/), la rigenerazione è limitata a ' +
        `${SIZES_SEL.join('/')} × ${DIFFS_SEL.join('/')}: le altre chiavi resteranno senza ale a runtime`,
    );
  }

  if (!APPLY) {
    say.warn('DRY-RUN: rilancia con --apply per eseguire');
    return;
  }

  let backupFile = null;
  if (BACKUP && aleIds.length > 0) {
    say.step('Backup delle schede ale');
    const dir = String(args['backup-dir'] ?? `backup-ale-${new Date().toISOString().slice(0, 10)}`);
    backupFile = await doBackup(aleIds, dir);
  } else if (aleIds.length > 0) {
    say.warn('backup saltato (--no-backup): le schede ale attuali non saranno recuperabili');
  }

  let removed = 0;
  if (!args['skip-delete'] && aleIds.length > 0) {
    say.step('Svuotamento di schede-ale/');
    const result = await doDelete();
    removed = result.removed;
    /*
     * `removed` viene dalla cancellazione di schede-ale/: le ale che restano
     * sono quelle del catalogo versionato (che NON va toccato). È il modo per
     * separare "ale a runtime" da "ale di base", che l'API non distingue.
     */
    say.info(`ale a runtime cancellate: ${removed} · ale di base rimaste: ${aleIds.length - removed}`);
  }

  if (!args['skip-generate']) {
    say.step('Rigenerazione con il codice in esecuzione');
    const created = await doGenerate();
    say.step('Verifica delle schede nuove');
    await verify(created);
  }

  say.step('Catalogo dopo');
  const after = await catalog();
  printCatalog('dopo', after);

  say.step('Riepilogo');
  if (removed > 0) say.info(`ale a runtime cancellate: ${removed}`);
  if (backupFile) say.info(`backup: ${backupFile}`);
  if (backupFile) say.info(`ripristino: node tools/rigenera-ale-server.mjs --restore ${backupFile} --out ./ripristino`);
  say.info('le schede nuove usano la calibrazione e la scala punteggi dell\'immagine ora in esecuzione');
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
