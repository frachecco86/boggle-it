/**
 * Pianificazione del replay "arcade" di fine round.
 *
 * Da dove nasce: nel Boggle originale, a fine round, i nomi dei concorrenti
 * stanno in basso e le parole indovinate si accendono una dopo l'altra, con
 * punteggio che sale fino al totale. L'effetto non è decorativo: racconta CHI ha
 * trovato cosa e QUANDO, cosa che una lista statica non fa.
 *
 * La logica di temporizzazione è PURA e vive qui, separata dal componente React:
 * così si può testare senza browser (il progetto non usa jsdom). Il componente
 * si limita a chiedere "quante parole sono già visibili a questo istante?".
 *
 * Regola di temporizzazione: si rispetta la timeline REALE (l'ordine e le
 * distanze fra le scoperte), ma compressa in una finestra breve, come se si
 * ripercorresse la partita ad alta velocità. Le parole trovate nello stesso
 * istante o troppo vicine ricevono comunque una spaziatura minima, altrimenti
 * comparirebbero tutte insieme e non se ne capirebbe la sequenza.
 */
import type { RoundResultEntry, WordEvent } from '@boggle/shared';

/** Un passo del replay: una parola che si accende per un giocatore. */
export interface ReplayStep {
  playerId: string;
  nickname: string;
  word: string;
  points: number;
  /** Momento (ms) in cui la parola compare nel replay, dall'inizio. */
  atMs: number;
  /** true se vale doppio (trovata da un solo giocatore). */
  unique: boolean;
}

export interface ReplayPlan {
  steps: ReplayStep[];
  /** Durata totale del replay (incluso il ritardo iniziale e la coda finale). */
  durationMs: number;
  /** Momento in cui compare la prima parola: c'è per far "atterrare" la scena. */
  initialDelayMs: number;
  /** Punteggio finale per giocatore (raddoppio incluso), per l'accumulo. */
  totals: Record<string, number>;
}

export interface ReplayOptions {
  /** Pausa prima della prima parola: la scena si assesta. */
  initialDelayMs?: number;
  /** Spaziatura minima fra due parole consecutive. */
  minStepMs?: number;
  /** Durata-obiettivo della parte animata (esclusa la coda). */
  targetMs?: number;
  /** Coda dopo l'ultima parola, per far leggere i totali. */
  tailMs?: number;
  /** Tetto complessivo: oltre questo si accorcia la spaziatura. */
  maxMs?: number;
}

const DEFAULTS = {
  initialDelayMs: 550,
  minStepMs: 170,
  targetMs: 7_000,
  tailMs: 1_000,
  maxMs: 18_000,
} as const;

/**
 * Costruisce il piano di replay dalle timeline dei giocatori.
 *
 * Le timeline assenti (partite registrate prima di questa versione) vengono
 * semplicemente ignorate: se nessuno ha una timeline, il piano è vuoto e il
 * componente non si avvia.
 */
export function buildReplayPlan(
  results: RoundResultEntry[],
  options: ReplayOptions = {},
): ReplayPlan {
  const opts = { ...DEFAULTS, ...options };

  const totals: Record<string, number> = {};
  // Alimenta l'ordinamento: l'ultimo `at` reale determina la scala temporale.
  const raw: ReplayStep[] = [];

  for (const r of results) {
    let sum = 0;
    const timeline: WordEvent[] = r.timeline ?? [];
    for (const ev of timeline) {
      sum += ev.points;
      raw.push({
        playerId: r.playerId,
        nickname: r.nickname,
        word: ev.word,
        points: ev.points,
        atMs: ev.at,
        unique: Boolean(ev.unique),
      });
    }
    /*
     * Il totale mostrato alla fine è quello UFFICIALE del round (`roundScore`),
     * non la somma della timeline: se per qualche motivo mancasse un evento,
     * l'accumulo non deve finire su un numero diverso da quello in classifica.
     */
    totals[r.playerId] = r.roundScore ?? sum;
  }

  if (raw.length === 0) {
    return { steps: [], durationMs: 0, initialDelayMs: opts.initialDelayMs, totals };
  }

  // Ordine cronologico; a parità di istante, ordine stabile e leggibile.
  raw.sort(
    (a, b) =>
      a.atMs - b.atMs ||
      a.nickname.localeCompare(b.nickname, 'it') ||
      a.word.localeCompare(b.word, 'it'),
  );

  const lastAt = raw[raw.length - 1]!.atMs;
  const scale = lastAt > 0 ? opts.targetMs / lastAt : 0;

  /*
   * Con molte parole la spaziatura minima potrebbe far superare il tetto: in quel
   * caso la si riduce per rientrare. Il pavimento è bassissimo (8 ms): con
   * centinaia di parole si accetta una sequenza veloce, ma il replay NON deve mai
   * durare più del tetto, altrimenti bloccherebbe il round successivo.
   */
  let minStepMs = opts.minStepMs;
  const budget = opts.maxMs - opts.initialDelayMs - opts.tailMs;
  if (budget > 0 && raw.length > 1) {
    const needed = (raw.length - 1) * minStepMs;
    if (needed > budget) minStepMs = Math.max(8, budget / (raw.length - 1));
  }

  const steps: ReplayStep[] = [];
  let cursor = 0;
  for (const step of raw) {
    let at = opts.initialDelayMs + step.atMs * scale;
    // Niente due parole nello stesso istante: si impone la spaziatura minima.
    if (at < cursor + minStepMs) at = cursor + minStepMs;
    cursor = at;
    steps.push({ ...step, atMs: at });
  }

  /*
   * Rete di sicurezza: con centinaia di parole anche la spaziatura minima può far
   * superare il tetto. In quel caso si comprime tutto proporzionalmente, rinunciando
   * alla spaziatura minima: il replay non deve mai bloccare il round successivo.
   */
  const hardCap = opts.maxMs;
  if (cursor + opts.tailMs > hardCap && cursor > opts.initialDelayMs) {
    const span = cursor - opts.initialDelayMs;
    const room = Math.max(1, hardCap - opts.initialDelayMs - opts.tailMs);
    const k = room / span;
    for (const step of steps) step.atMs = opts.initialDelayMs + (step.atMs - opts.initialDelayMs) * k;
    cursor = opts.initialDelayMs + room;
  }

  return {
    steps,
    durationMs: cursor + opts.tailMs,
    initialDelayMs: opts.initialDelayMs,
    totals,
  };
}

/**
 * Quante parole sono visibili a `elapsedMs` dall'inizio del replay.
 *
 * Le parole con lo stesso `atMs` compaiono insieme: l'indice è il primo passo
 * ancora "futuro". Il componente usa questa funzione per sapere cosa rivelare a
 * ogni frame senza duplicare la logica di soglia.
 */
export function revealedCountAt(plan: ReplayPlan, elapsedMs: number): number {
  let n = 0;
  while (n < plan.steps.length && plan.steps[n]!.atMs <= elapsedMs) n++;
  return n;
}
