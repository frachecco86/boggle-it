/**
 * Accesso alle schede con fallback OFFLINE.
 *
 * Ordine di risoluzione:
 *  1. se c'è rete, chiede al server (catalogo sempre aggiornato, incluse le
 *     schede aggiunte dall'admin);
 *  2. se la rete manca o il server non risponde, usa le schede incluse nel
 *     bundle (`public/schede/`, copiate da `copy-schede.mjs`).
 *
 * Così l'app Android ha il single player completo anche senza connessione,
 * mentre la pagina scheda e il multiplayer restano online.
 */
import {
  pickScheda,
  SchedaMemory,
  schedaVariantOf,
  type Difficulty,
  type GridSize,
  type Scheda,
  type SchedaVariant,
} from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';
import { localViewCounts, markLocalSeen } from './localSchedaMemory.js';
import { activeToken } from './profileStore.js';

/**
 * Metadati di una scheda per la pagina "Sfoglia schede".
 *
 * Sono già nel catalogo (`/schede`), così il client può filtrare e ordinare 750
 * schede senza scaricarle tutte: `maxScore` richiederebbe altrimenti una richiesta
 * per scheda, cioè 750 chiamate per una pagina.
 */
export interface SchedaMeta {
  id: string;
  size: GridSize;
  difficulty: Difficulty;
  /** Insieme di criteri con cui è stata generata (standard / full criteria). */
  variant?: SchedaVariant;
  /** Parole trovabili. */
  words: number;
  /** Punteggio massimo ottenibile: somma dei punti di tutte le parole. */
  maxScore: number;
  /** Lunghezza della parola più lunga (mai la parola: sarebbe la soluzione). */
  longest: number;
}

export interface CatalogInfo {
  total: number;
  byKey: Record<string, number>;
  bySize?: Record<string, number>;
  ids: Record<string, string[]>;
  /** Metadati per filtri e ordinamento. Assente se il server è vecchio. */
  meta?: SchedaMeta[];
  /** true se i dati arrivano dal bundle locale (offline). */
  offline: boolean;
}

/**
 * Base locale delle schede incluse nel bundle.
 *
 * Percorso DISTINTO da `/schede` (che è l'API del server): con lo stesso nome
 * le due cose collidono, perché `/schede/index.json` verrebbe catturato dalla
 * rotta API `/schede/:id`.
 */
const LOCAL_BASE = `${import.meta.env.BASE_URL ?? '/'}bundled-schede`.replace(/\/+$/, '');

/**
 * Header `Authorization` col token del profilo attivo, se c'è.
 *
 * Il token vive in `profileStore` (localStorage): leggerlo qui evita di far
 * dipendere il caricamento delle schede dallo store dell'app, che ha bisogno di
 * React montato. Senza token ritorna un oggetto vuoto: le richieste al server
 * restano valide e comportano solo il comportamento anonimo.
 */
function authHeaders(): Record<string, string> {
  const token = activeToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Segna una scheda come GIA' GIOCATA dal profilo attivo.
 *
 * Si chiama quando la partita INIZIA davvero (non quando la scheda viene
 * pescata): una scheda pescata e mai giocata non deve restare esclusa per
 * sempre. Senza profilo il `POST` al server non parte (non c'è una cronologia da
 * aggiornare), ma la copia LOCALE si aggiorna comunque: è l'unica memoria che
 * esiste per chi gioca anonimo o offline.
 *
 * Non lancia e non attende il risultato: è un'informazione accessoria, e un
 * fallimento di rete non deve interferire con la partita in corso.
 */
export function markSchedaPlayed(schedaId: string | null | undefined): void {
  if (!schedaId) return;
  markLocalSeen(schedaId);
  const token = activeToken();
  if (!token) return;
  void fetch(`${SERVER_BASE}/me/played-schede`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ schedaId }),
  }).catch(() => undefined);
}

async function fetchJson<T>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T | null> {
  const timeoutMs = options.timeoutMs ?? 2500;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, headers: options.headers });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Catalogo completo (online con fallback offline). */
export async function loadCatalog(): Promise<CatalogInfo | null> {
  const online = await fetchJson<Omit<CatalogInfo, 'offline'>>(`${SERVER_BASE}/schede`);
  if (online?.total) return { ...online, offline: false };

  const local = await fetchJson<Omit<CatalogInfo, 'offline'>>(`${LOCAL_BASE}/index.json`);
  if (local?.total) return { ...local, offline: true };
  return null;
}

/** Una scheda per id (online con fallback offline). */
export async function loadScheda(id: string): Promise<Scheda | null> {
  const online = await fetchJson<Scheda>(`${SERVER_BASE}/schede/${encodeURIComponent(id)}`);
  if (online?.grid) return online;
  // Offline: il file del bundle contiene TUTTE le schede del suo gruppo,
  // va estratta quella richiesta.
  const file = await fetchJson<{ schede?: Scheda[] }>(`${LOCAL_BASE}/${schedaFileFor(id)}`);
  return file?.schede?.find((s) => s.id === id) ?? null;
}
/** Deriva il nome del file dal prefisso dell'id (`4-normale-017` -> `schede-4-normale.json`). */
function schedaFileFor(id: string): string {
  const parts = id.split('-');
  const difficulty = parts.slice(1, -1).join('-');
  return `schede-${parts[0]}-${difficulty}.json`;
}

/**
 * Una scheda casuale per dimensione/difficoltà, con lo stesso fallback.
 *
 * `variant` sceglie l'insieme di criteri delle schede (`standard` o `full`):
 * online lo applica il server, offline si filtra l'indice del bundle.
 */
export async function loadRandomScheda(
  size: GridSize,
  difficulty: Difficulty,
  variant: SchedaVariant = 'standard',
): Promise<Scheda | null> {
  /*
   * Il token del profilo va nella richiesta: il server esclude le schede che
   * questo profilo ha gia' giocato (vedi `GET /preview`). Senza token (nessun
   * profilo) il server si comporta come prima.
   */
  const online = await fetchJson<{ schedaId: string | null }>(
    `${SERVER_BASE}/preview?gridSize=${size}&difficulty=${encodeURIComponent(difficulty)}&variant=${variant}`,
    { headers: authHeaders() },
  );
  if (online?.schedaId) {
    const scheda = await loadScheda(online.schedaId);
    if (scheda) return scheda;
  }

  /*
   * Offline: pesca dall'indice incluso nel bundle, filtrando la variante e
   * RISPETTANDO la memoria locale (vedi `localSchedaMemory`).
   *
   * Serve un oggetto `SchedaMemory` invece di un elenco di id da scartare: la
   * regola è la stessa del server — prima le mai viste, poi quelle con la somma
   * dei contatori più bassa — e con i pool da 10-15 schede il secondo caso è la
   * normalità, non l'eccezione.
   */
  const catalog = await fetchJson<Omit<CatalogInfo, 'offline'>>(`${LOCAL_BASE}/index.json`);
  const key = `${size}-${difficulty}`;
  const list = catalog?.ids?.[key];
  if (!list || list.length === 0) return null;

  const all = await fetchJson<{ schede: Scheda[] }>(`${LOCAL_BASE}/${schedaFileFor(list[0]!)}`);
  const matching = (all?.schede ?? []).filter((s) => schedaVariantOf(s) === variant);
  if (matching.length === 0) return null;
  return pickScheda(matching, new SchedaMemory({ player: localViewCounts() }))?.scheda ?? null;
}
