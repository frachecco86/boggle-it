/**
 * Memoria LOCALE delle schede già viste: il specchio in `localStorage` della
 * cronologia che il server tiene sul profilo.
 *
 * Perché esiste, visto che il server ha già `played_schede`: l'app Android
 * gioca **offline** (le schede sono nel bundle), e in quel momento non c'è né un
 * token da validare né un `/preview` che escluda le schede già viste — la pesca
 * locale del fallback era puramente casuale e ripeteva le griglie. Senza questo
 * specchio, basta un volo in modalità aereo (o un profilo che gioca sempre da
 * telefono spento dietro) per tornare al comportamento di sempre.
 *
 * Tre scelte da capire prima di toccare:
 *
 *  - **NON è la fonte autoritativa**: è una copia. Quando c'è rete decide il
 *    server (che conosce il profilo da tutti i dispositivi); qui si legge solo
 *    quando si pesca dal bundle, e si scrive a ogni partita iniziata, così il
 *    specchio resta vicino alla verità anche fra una sessione e l'altra. Le
 *    partite in stanza NON passano di qui (le segna il server, che sa chi le ha
 *    viste): offline di multiplayer non ce n'è, e lo specchio serve a quello.
 *  - **per profilo**: la memoria è di CHI GIOCA, non del telefono. Su un
 *    dispositivo condiviso due profili hanno chiavi diverse (l'anonimo ha la sua).
 *  - **si tronca, non si cresce all'infinito**: `localStorage` è per-origine e
 *    condiviso con lo store dell'app. Tenere le N griglie più recenti basta allo
 *    scopo («non ripetermi quelle di recente») e tiene il JSON piccolo.
 *
 * I valori sono CONTATORI, non flag: «vista di meno» significa somma dei
 * contatori più bassa, quindi una griglia rigiocata cento volte deve pesare
 * cento (vedi `pickScheda`).
 */
import { getActiveProfile } from './profileStore.js';

/** Prefisso storico `boggle-it.`: sono DATI dell'utente, rinominarli li perderebbe. */
const KEY_PREFIX = 'boggle-it.schedaMemory.v1.';
/** Chiave di chi gioca senza profilo (nessuna cronologia sul server). */
const ANON_KEY = 'anonimo';
/**
 * Quante griglie ricordare per profilo. I gruppi del catalogo sono 10-15 schede
 * per dimensione × difficoltà × variante: 800 voci coprono tutte le
 * combinazioni giocate in mesi, e restano un JSON da poche decine di KB.
 */
const MAX_ENTRIES = 800;

function storageKey(): string {
  return KEY_PREFIX + (getActiveProfile()?.id ?? ANON_KEY);
}

function read(): Map<string, number> {
  const out = new Map<string, number>();
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return out;
    for (const [id, value] of Object.entries(parsed)) {
      const n = Number(value);
      // Un valore corrotto non deve far sparire la memoria: vale come una vista.
      out.set(id, Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1);
    }
  } catch {
    /* storage disabilitato o JSON rotto: si pesca come senza memoria */
  }
  return out;
}

function write(counts: Map<string, number>): void {
  try {
    // `localStorage` è per-origine: se lo store è pieno (foto, profili) si
    // rinuncia alla memoria invece di far fallire qualcos'altro.
    localStorage.setItem(storageKey(), JSON.stringify(Object.fromEntries(counts)));
  } catch {
    /* ignora */
  }
}

/**
 * Contatori delle schede già viste dal profilo attivo.
 *
 * Ha la forma che `SchedaMemory` si aspetta per il livello `player`, così la
 * pesca offline usa la STESSA regola di quella del server (`pickScheda`), non
 * una versione semplificata che poi diverge.
 */
export function localViewCounts(): Map<string, number> {
  return read();
}

/**
 * Una vista in più per una scheda: si chiama quando la partita INIZIA, come il
 * `POST /me/played-schede` del server — una scheda pescata e mai giocata non
 * deve restare esclusa per sempre.
 */
export function markLocalSeen(schedaId: string | null | undefined): void {
  if (!schedaId) return;
  const counts = read();
  counts.set(schedaId, (counts.get(schedaId) ?? 0) + 1);
  // Gli oggetti JS mantengono l'ordine di inserimento, quindi le chiavi più
  // vecchie sono in testa e si tronca da lì: si dimentica la griglia vista da più
  // tempo, che è anche la meno interessante da escludere.
  while (counts.size > MAX_ENTRIES) {
    const oldest = counts.keys().next();
    if (oldest.done) break;
    counts.delete(oldest.value);
  }
  write(counts);
}

/** Dimentica la memoria locale del profilo attivo. */
export function clearLocalSeen(): void {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    /* ignora */
  }
}
