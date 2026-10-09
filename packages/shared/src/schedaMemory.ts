/**
 * Memoria delle schede già viste.
 *
 * Il gioco pesca le schede da pool piccoli (10-15 schede per dimensione,
 * difficoltà e variante: il catalogo versionato ne ha 270 in totale su nove
 * combinazioni e tre varianti). Una pesca puramente casuale ripeteva la stessa
 * griglia due volte nella stessa partita nel 17-28% dei casi su 3 round, e a chi
 * rigioca nella stessa stanza capitava di ritrovare la griglia di cinque minuti
 * prima.
 *
 * La memoria è a **livelli** perché le domande a cui deve rispondere sono tre
 * diverse, con tre forze diverse:
 *
 *  | livello    | domanda                          | forza |
 *  |------------|----------------------------------|-------|
 *  | `match`    | l'ho già giocata in QUESTA partita? | vincolo duro |
 *  | `room`     | l'ho già giocata in QUESTA stanza?  | quasi duro |
 *  | `player`   | l'ho già giocata in passato?        | preferenza |
 *
 * Un unico elenco di "schede da non riproporre" non basterebbe: la partita
 * ricomincia (la rivincita nella stessa stanza deve azzerare il livello
 * `match`, non gli altri) e il livello `player` dipende da CHI guarda, non dalla
 * stanza. Tenere i livelli separati è anche l'unico modo di dire *quale* vincolo
 * si sta sacrificando quando i candidati finiscono: i pool sono piccoli, quindi
 * prima o poi una scheda già vista va riproposta comunque — fermare il gioco
 * sarebbe peggio.
 *
 * Ogni livello sa anche QUANTE VOLTE ognuna di quelle schede è stata vista, e
 * non è un vezzo: è ciò che permette di ripiegare su quella «vista da meno»
 * invece di ripiegarne una a caso (vedi `pickScheda`). Con i pool da 10-15
 * schede è il caso normale dopo qualche partita, non un'eccezione.
 *
 * Il livello `player` è la cronologia personale, e dal 0.50.0 lo usano ENTRAMBE
 * le modalità:
 *  - **single player**: `GET /preview`, con il profilo attivo, passa la storia di
 *    chi ha chiesto il sorteggio;
 *  - **multiplayer**: la stanza lo riempie con le cronologie dei presenti
 *    sommate (`Room.syncPlayerMemory`), così si gioca la griglia che **nessuno
 *    di loro** ha mai visto; se l'hanno vista comunque tutti, non si pesca a
 *    caso: vince la **somma dei contatori**, cioè quella che in totale è stata
 *    giocata di meno.
 *
 * Era il rovescio della scelta della 0.49.0 («la cronologia di uno non decide la
 * griglia di tutti», che in pratica significava: in stanza la memoria personale
 * non conta e le griglie si ripetono). Dal 0.50.0 decide, ma *per quanto
 * possibile*: il livello `player` resta il primo a cadere, quindi un giocatore
 * che ha visto tutto il catalogo non blocca la partita e non la degrada — si
 * riparte dalle sue schede, preferendo quelle che gli altri non conoscono.
 */

/**
 * Livelli di memoria, dal più vincolante al più morbido.
 *
 * L'ordine è parte del contratto: `pickScheda` allenta i livelli procedendo DAL
 * FONDO di questo elenco, quindi il primo elemento è l'ultimo a cadere.
 */
export const SCHEDA_MEMORY_LAYERS = ['match', 'room', 'player'] as const;

export type SchedaMemoryLayer = (typeof SCHEDA_MEMORY_LAYERS)[number];

/** Etichette leggibili (diagnosi e log): quale memoria si è dovuta allentare. */
export const SCHEDA_MEMORY_LABELS: Record<SchedaMemoryLayer, string> = {
  match: 'la partita in corso',
  room: 'la stanza',
  player: 'il passato dei giocatori',
};

/**
 * Quante volte ogni scheda è stata vista dentro un livello.
 *
 * Non è «l'ha vista qualcuno»: è una **somma di ripetizioni**, ed è la misura con
 * cui `pickScheda` decide cosa riproporre quando una scheda mai vista non c'è
 * più. Nel livello `player` della stanza i contatori dei presenti li somma il
 * server (`ProfileStore.playedSchedaCounts`), quindi il numero risponde a «quante
 * volte questa griglia è già passata fra queste persone»: una vista 100 volte da
 * uno solo vale 100 e viene DOPO una vista una volta da sette, che vale 7.
 * Contare le persone invece che le volte avrebbe premiato la prima.
 */
export type SchedaViewCounts = ReadonlyMap<string, number>;

/** Il seme accetta sia un elenco di id sia i conteggi. */
export type SchedaMemorySeed = Partial<
  Record<SchedaMemoryLayer, Iterable<string> | SchedaViewCounts>
>;

function isCounts(seed: Iterable<string> | SchedaViewCounts): seed is SchedaViewCounts {
  return seed instanceof Map;
}

function seedEntries(seed: Iterable<string> | SchedaViewCounts): Array<readonly [string, number]> {
  return isCounts(seed) ? [...seed.entries()] : [...seed].map((id) => [id, 1] as const);
}

/**
 * Un livello di memoria: gli id già visti e quante volte lo sono stati.
 *
 * I due contenitori restano allineati per costruzione (`ids` è sempre l'insieme
 * delle chiavi di `counts`): un livello che esclude una scheda ma non sa
 * quante volte l'ha vista farebbe scegliere peggio, quindi non si possono
 * toccare separatamente.
 */
class MemoryLayer {
  readonly ids = new Set<string>();
  readonly counts = new Map<string, number>();

  /**
   * Una vista in più. `times` sotto 1 (o NaN) conta comunque 1: un livello che
   * conosce una scheda la DEVE escludere, il conteggio è un dettaglio.
   */
  add(id: string, times = 1): void {
    this.ids.add(id);
    const n = Number.isFinite(times) && times > 0 ? Math.trunc(times) : 1;
    this.counts.set(id, (this.counts.get(id) ?? 0) + n);
  }

  setIds(ids: Iterable<string>): void {
    this.clear();
    for (const id of ids) this.add(id);
  }

  setViews(entries: Iterable<readonly [string, number]>): void {
    this.clear();
    for (const [id, times] of entries) this.add(id, times);
  }

  clear(): void {
    this.ids.clear();
    this.counts.clear();
  }
}

/**
 * Insiemi (e conteggi) di schede già viste, separati per livello.
 *
 * La classe NON è immutabile: la stanza la popola mentre si gioca
 * (`record`) e la azzera parzialmente quando ricomincia una partita
 * (`startMatch`). Non è condivisa fra stanze e non è mai condivisa fra
 * dispositivi: è memoria di una singola stanza (o di una singola richiesta).
 */
export class SchedaMemory {
  private readonly layers = new Map<SchedaMemoryLayer, MemoryLayer>(
    SCHEDA_MEMORY_LAYERS.map((layer) => [layer, new MemoryLayer()]),
  );

  constructor(seed?: SchedaMemorySeed) {
    if (!seed) return;
    for (const layer of SCHEDA_MEMORY_LAYERS) {
      const ids = seed[layer];
      if (!ids) continue;
      const target = new MemoryLayer();
      target.setViews(seedEntries(ids));
      this.layers.set(layer, target);
    }
  }

  /** Gli id già visti in un livello (insieme vivo: non copiarlo per modificarlo). */
  ids(layer: SchedaMemoryLayer): ReadonlySet<string> {
    return this.layers.get(layer)!.ids;
  }

  /** Quante volte ogni id è stato visto nello stesso livello (insieme vivo). */
  views(layer: SchedaMemoryLayer): SchedaViewCounts {
    return this.layers.get(layer)!.counts;
  }

  /** true se la scheda è stata vista in UN QUALSIASI livello. */
  has(id: string): boolean {
    return SCHEDA_MEMORY_LAYERS.some((layer) => this.layers.get(layer)!.ids.has(id));
  }

  /** Volte che una scheda è stata vista sommando TUTTI i livelli (diagnosi). */
  timesSeen(id: string): number {
    let total = 0;
    for (const layer of SCHEDA_MEMORY_LAYERS) total += this.layers.get(layer)!.counts.get(id) ?? 0;
    return total;
  }

  /** Aggiunge una scheda a un livello (di default: una vista). */
  add(layer: SchedaMemoryLayer, id: string, times = 1): void {
    this.layers.get(layer)!.add(id, times);
  }

  /**
   * Sostituisce il contenuto di un livello con un elenco di id (una vista cadauno).
   *
   * Serve per i livelli che non si accumulano ma si *ricalcolano*, come
   * `player`: l'insieme delle schede già viste dai giocatori presenti cambia
   * quando qualcuno entra o esce dalla stanza. Con i conteggi c'è `setViews`.
   */
  setLayer(layer: SchedaMemoryLayer, ids: Iterable<string>): void {
    this.layers.get(layer)!.setIds(ids);
  }

  /**
   * Sostituisce un livello con id E conteggi (l'id da escludere sono le chiavi).
   *
   * È la forma del livello `player` in stanza: il server la ricava da
   * `ProfileStore.playedSchedaCounts`, che somma i contatori di quei profili, e il
   * conteggio è ciò che permette a `pickScheda` di scegliere «quella vista di
   * meno» quando una griglia pulita non c'è più.
   */
  setViews(layer: SchedaMemoryLayer, counts: SchedaViewCounts | Iterable<readonly [string, number]>): void {
    this.layers.get(layer)!.setViews(counts);
  }

  /**
   * Registra una scheda giocata ADESSO: entra nella partita e nella stanza.
   *
   * Il livello `player` NON si tocca qui: è la cronologia personale, che il
   * server scrive altrove (`played_schede`) e che in stanza viene **caricata**
   * con `setViews` dai profili dei presenti, non accumulata round per round.
   */
  record(id: string): void {
    this.add('match', id);
    this.add('room', id);
  }

  /**
   * Ricomincia una partita nella stessa stanza: si dimentica SOLO il livello
   * della partita.
   *
   * È il pezzo che rende "schede nuove" una rivincita nella stessa stanza: la
   * memoria della stanza resta, quindi il secondo round della seconda partita
   * non ripropone la griglia della prima partita. Il livello `player` resta
   * com'è: la storia personale di chi è in stanza non dipende da quante partite
   * ha giocato la stanza.
   */
  startMatch(): void {
    this.layers.get('match')!.clear();
  }

  /** Dimentica tutto (stanza che si resetta, test). */
  clear(): void {
    for (const layer of SCHEDA_MEMORY_LAYERS) this.layers.get(layer)!.clear();
  }

  /** Unione di tutti i livelli: per diagnosi, mai per pescare. */
  all(): Set<string> {
    const out = new Set<string>();
    for (const layer of SCHEDA_MEMORY_LAYERS) {
      for (const id of this.layers.get(layer)!.ids) out.add(id);
    }
    return out;
  }
}

/** Esito di una pesca, con i livelli a cui si è dovuto rinunciare. */
export interface SchedaChoice<T> {
  scheda: T;
  /**
   * Livelli ALLANTATI per trovare una scheda, dal più morbido al più duro.
   * Vuoto = la scheda non l'ha vista nessuno dei livelli conosciuti.
   */
  relaxed: SchedaMemoryLayer[];
  /**
   * Volte che la scheda scelta era già vista dai livelli ALLENTATI (0 quando non
   * se n'è allentato nessuno: la scheda è pulita).
   *
   * È la somma dei contatori, non il numero di testimoni: in multiplayer dice
   * «quante volte questo gruppo di persone ha già giocato quella griglia».
   */
  seenTimes: number;
}

/**
 * Pesca una scheda dal pool rispettando la memoria, dal vincolo più duro al più
 * morbido.
 *
 * Ordine tentato (si scende solo se il gradino sopra non ha candidati):
 *  1. scheda mai vista da nessuno;
 *  2. si rinuncia al livello `player` (la preferenza: "non hai già visto questa?");
 *  3. si rinuncia a `room` (la stanza);
 *  4. si rinuncia a `match` (la partita: l'ultimo vincolo a cadere);
 *  5. pool intero.
 *
 * Il rilassamento è **cumulativo e nell'ordine di `SCHEDA_MEMORY_LAYERS` al
 * rovescio**: si molla prima il livello più morbido. Con i pool da 10-15 schede
 * è la situazione normale dopo qualche partita nella stessa stanza, non un
 * caso limite: per questo l'esito porta i livelli rilassati, così chi chiama può
 * loggarlo (o, in futuro, mostrarlo: «ti ho riproposto una griglia, il catalogo
 * di questa difficoltà è finito»).
 *
 * **Una volta rinunciati dei livelli non si pesca a caso fra le superstiti**: si
 * scelgono quelle con la minor SOMMA di contatori sui livelli mollati. «Non
 * l'ha vista nessuno» non è più ottenibile, ma «in totale l'abbiamo giocata due
 * volte invece che quaranta» sì, ed è la stessa regola spinta un gradino più in
 * là. A pari merito si sorteggia, che è il comportamento di sempre.
 *
 * Ritorna `null` solo con il pool vuoto: "nessuna scheda per questa
 * dimensione/difficoltà/variante" resta un errore esplicito, non una pesca
 * ripiegata su criteri diversi.
 */
export function pickScheda<T extends { id: string }>(
  pool: readonly T[],
  memory?: SchedaMemory,
  rng: () => number = Math.random,
): SchedaChoice<T> | null {
  if (pool.length === 0) return null;

  const honored = new Set<SchedaMemoryLayer>(SCHEDA_MEMORY_LAYERS);
  const relaxed: SchedaMemoryLayer[] = [];

  /** Viste accumulate nei soli livelli a cui abbiamo già rinunciato. */
  const seenTimes = (id: string): number => {
    let total = 0;
    for (const layer of relaxed) total += memory?.views(layer).get(id) ?? 0;
    return total;
  };

  /**
   * Sorteggio fra i candidati con la somma di contatori più bassa.
   *
   * È «vista di meno» nel senso chiesto: vince il totale più piccolo, quindi una
   * griglia vista cento volte da una persona sola non passa davanti a una vista
   * una volta da tutti. Un solo `rng()`, come prima: il sorteggio cambia solo fra
   * i pari merito.
   */
  const pickLeastSeen = (candidates: readonly T[]): T => {
    let best: T[] = [];
    let min = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const value = seenTimes(candidate.id);
      if (value < min) {
        min = value;
        best = [candidate];
      } else if (value === min) {
        best.push(candidate);
      }
    }
    return best[Math.floor(rng() * best.length)]!;
  };

  for (;;) {
    const excluded = new Set<string>();
    for (const layer of honored) {
      for (const id of memory?.ids(layer) ?? []) excluded.add(id);
    }
    const fresh = excluded.size === 0 ? [...pool] : pool.filter((s) => !excluded.has(s.id));
    if (fresh.length > 0) {
      const scheda = pickLeastSeen(fresh);
      return { scheda, relaxed: [...relaxed], seenTimes: seenTimes(scheda.id) };
    }
    // Nessun candidato: molla il livello più morbido che sta escludendo qualcosa.
    const toRelax = [...SCHEDA_MEMORY_LAYERS]
      .reverse()
      .find((layer) => honored.has(layer) && (memory?.ids(layer).size ?? 0) > 0);
    if (!toRelax) break;
    honored.delete(toRelax);
    relaxed.push(toRelax);
  }

  // Pool non vuoto ma interamente escluso a ogni livello (memoria che copre il
  // pool e oltre): si riparte da capo, sempre preferendo la meno vista. Meglio
  // una scheda già vista che nessuna.
  const scheda = pickLeastSeen(pool);
  return { scheda, relaxed: [...relaxed], seenTimes: seenTimes(scheda.id) };
}
