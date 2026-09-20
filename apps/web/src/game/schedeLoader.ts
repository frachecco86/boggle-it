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
import type { Difficulty, GridSize, Scheda } from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';

export interface CatalogInfo {
  total: number;
  byKey: Record<string, number>;
  ids: Record<string, string[]>;
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

async function fetchJson<T>(url: string, timeoutMs = 2500): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
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

/** Una scheda casuale per dimensione/difficoltà, con lo stesso fallback. */
export async function loadRandomScheda(
  size: GridSize,
  difficulty: Difficulty,
): Promise<Scheda | null> {
  const online = await fetchJson<{ schedaId: string | null }>(
    `${SERVER_BASE}/preview?gridSize=${size}&difficulty=${encodeURIComponent(difficulty)}`,
  );
  if (online?.schedaId) {
    const scheda = await loadScheda(online.schedaId);
    if (scheda) return scheda;
  }

  // Offline: pesca a caso dall'indice incluso nel bundle.
  const catalog = await fetchJson<Omit<CatalogInfo, 'offline'>>(`${LOCAL_BASE}/index.json`);
  const key = `${size}-${difficulty}`;
  const list = catalog?.ids?.[key];
  if (!list || list.length === 0) return null;
  const id = list[Math.floor(Math.random() * list.length)]!;
  const all = await fetchJson<{ schede: Scheda[] }>(`${LOCAL_BASE}/${schedaFileFor(id)}`);
  return all?.schede.find((s) => s.id === id) ?? null;
}
