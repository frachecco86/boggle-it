/**
 * Esporta una sessione di pi in un documento leggibile (Markdown).
 *
 * Uso:
 *   node tools/export-session.mjs <file-sessione.jsonl> <cartella-destinazione>
 *   node tools/export-session.mjs                      # sessione corrente (PI_SESSION_FILE)
 *
 * Cosa produce, nella cartella indicata:
 *   - `transcript.md`      — la conversazione leggibile: messaggi dell'utente e
 *                            dell'assistente per intero, il ragionamento in blocchi
 *                            richiudibili, le chiamate agli strumenti in una riga e
 *                            i loro risultati in blocchi richiudibili (troncati);
 *   - `session.jsonl.br`   — il log originale, compresso (brotli): è la fonte
 *                            completa, il transcript è una sua resa leggibile.
 *
 * Perché un file a parte e non `pi export`: serve un formato adatto a stare nel
 * repository accanto al codice (Markdown con blocchi richiudibili), e la stessa
 * resa per sessioni diverse. Il log resta comunque allegato, così nulla va perso.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';

const OUT_CHARS = 800; // caratteri di output degli strumenti mostrati per intero
const ARGS_CHARS = 220; // caratteri di argomenti delle chiamate

function arg(i, fallback) {
  return process.argv[i] ?? fallback;
}

/** Blocco richiudibile (HTML dentro Markdown: reso da GitHub, VS Code, ecc.). */
function details(summary, body, open = false) {
  const safe = body.replace(/<\/?details>/g, '');
  return `<details${open ? ' open' : ''}>\n<summary>${summary}</summary>\n\n${safe}\n\n</details>\n`;
}

/** Tronca con una nota, senza tagliare a metà riga se possibile. */
function truncate(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastNewline = cut.lastIndexOf('\n');
  const body = lastNewline > limit * 0.6 ? cut.slice(0, lastNewline) : cut;
  return `${body}\n… [troncato: ${text.length - body.length} caratteri in più nel log completo]`;
}

/** Racconto in una riga di una chiamata a strumento. */
function describeToolCall(call) {
  const args = call.arguments ?? {};
  const parts = [];
  if (typeof args.command === 'string') parts.push(args.command.split('\n')[0]);
  if (typeof args.path === 'string') parts.push(args.path);
  if (typeof args.query === 'string') parts.push(`"${args.query}"`);
  if (typeof args.agent === 'string') parts.push(`agent=${args.agent}`);
  if (Array.isArray(args.edits)) parts.push(`${args.edits.length} modifiche`);
  if (typeof args.workflowScript === 'string') parts.push('workflow raw');
  const detail = parts.length > 0 ? parts.join(' · ') : JSON.stringify(args);
  return `${call.name} — ${truncate(detail, ARGS_CHARS).replace(/\n/g, ' ')}`;
}

function main() {
  const sessionFile = arg(2, process.env.PI_SESSION_FILE);
  if (!sessionFile) {
    console.error('Serve il file di sessione: node tools/export-session.mjs <file.jsonl> <cartella>');
    process.exit(1);
  }
  const outDir = arg(3);
  if (!outDir) {
    console.error('Serve la cartella di destinazione: node tools/export-session.mjs <file.jsonl> <cartella>');
    process.exit(1);
  }

  const raw = readFileSync(sessionFile);
  const lines = raw.toString('utf8').split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Riga illeggibile (log troncato a metà scrittura): si salta.
    }
  }

  const session = entries.find((e) => e.type === 'session') ?? {};
  const modelChanges = entries.filter((e) => e.type === 'model_change');
  const messages = entries.filter((e) => e.type === 'message');

  const users = messages.filter((m) => m.message?.role === 'user');
  const assistants = messages.filter((m) => m.message?.role === 'assistant');
  const results = messages.filter((m) => m.message?.role === 'toolResult');
  const toolCalls = assistants.flatMap((m) => (m.message.content ?? []).filter((c) => c.type === 'toolCall'));
  /** Strumenti più usati (per l'indice del README). */
  const toolCounts = new Map();
  for (const call of toolCalls) toolCounts.set(call.name, (toolCounts.get(call.name) ?? 0) + 1);

  const firstAt = messages[0]?.timestamp ?? session.timestamp ?? '';
  const lastAt = messages[messages.length - 1]?.timestamp ?? firstAt;
  const day = (iso) => (iso ? iso.slice(0, 10) : 'n.d.');
  const dayRange = day(firstAt) === day(lastAt) ? day(firstAt) : `${day(firstAt)} → ${day(lastAt)}`;

  // ------------------------------------------------------------ transcript.md
  const out = [];
  out.push(`# Sessione pi — ${dayRange}`);
  out.push('');
  out.push(`- **id sessione**: \`${session.id ?? 'n.d.'}\``);
  out.push(`- **cartella di lavoro**: \`${session.cwd ?? 'n.d.'}\``);
  out.push(`- **modello**: ${modelChanges.map((m) => `${m.provider}/${m.modelId}`).join(', ') || 'n.d.'}`);
  out.push(`- **messaggi**: ${messages.length} (utente ${users.length}, assistente ${assistants.length}, risultati ${results.length}) · chiamate a strumenti: ${toolCalls.length}`);
  out.push(`- **log completo**: \`session.jsonl.br\` (${(raw.length / 1024).toFixed(0)} KB → ${(brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length / 1024).toFixed(0)} KB)`);
  out.push('');
  out.push('Documento generato da `tools/export-session.mjs`. I messaggi sono riportati per intero; il ragionamento e i risultati degli strumenti stanno in blocchi richiudibili; gli output lunghi sono troncati (il testo integrale è nel log compresso).');
  out.push('');
  out.push('---');
  out.push('');

  let turn = 0;
  // I risultati seguono le chiamate: si accoppiano per id.
  const resultById = new Map();
  for (const r of results) {
    const id = r.message?.toolCallId ?? r.message?.id;
    if (id) resultById.set(id, r);
  }

  for (const entry of messages) {
    const msg = entry.message ?? {};
    const when = entry.timestamp ? entry.timestamp.replace('T', ' ').slice(0, 19) : '';
    if (msg.role === 'user') {
      turn++;
      const text = (msg.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();
      out.push(`## ${turn}. Utente · ${when}`);
      out.push('');
      out.push(text);
      out.push('');
    } else if (msg.role === 'assistant') {
      const thinking = (msg.content ?? []).filter((c) => c.type === 'thinking').map((c) => c.thinking).join('\n\n');
      const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n\n');
      const calls = (msg.content ?? []).filter((c) => c.type === 'toolCall');
      const pieces = [];
      if (thinking.trim()) pieces.push(details('ragionamento', truncate(thinking.trim(), 2000)));
      if (text.trim()) pieces.push(text.trim());
      for (const call of calls) {
        const result = resultById.get(call.id);
        const output = (result?.message?.content ?? [])
          .filter((c) => c.type === 'text' || c.type === 'toolResult')
          .map((c) => c.text ?? c.content ?? '')
          .join('\n')
          .trim();
        pieces.push(`**🔧 ${describeToolCall(call)}**`);
        if (output) pieces.push(details('esito', truncate(output, OUT_CHARS)));
      }
      if (pieces.length === 0) continue;
      out.push(`### Assistente · ${when}`);
      out.push('');
      out.push(pieces.join('\n\n'));
      out.push('');
    }
  }

  mkdirSync(outDir, { recursive: true });
  const transcriptPath = path.join(outDir, 'transcript.md');
  const logPath = path.join(outDir, 'session.jsonl.br');
  writeFileSync(transcriptPath, out.join('\n'));
  writeFileSync(logPath, brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));

  console.log(`✓ ${transcriptPath} (${(out.join('\n').length / 1024).toFixed(0)} KB, ${turn} turni utente)`);
  console.log(`✓ ${logPath} (${(brotliCompressSync(raw).length / 1024).toFixed(0)} KB)`);
  const topTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`  strumenti: ${topTools.map(([n, c]) => `${n} ${c}`).join(', ')}`);
  console.log(`  intervallo: ${dayRange} · modello: ${modelChanges.map((m) => m.modelId).join(', ')}`);
}

main();
