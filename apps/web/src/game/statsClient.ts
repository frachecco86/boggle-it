/**
 * Client per partite, leaderboard e statistiche.
 *
 * La leaderboard è pubblica (si vede anche da non registrati), mentre registrare
 * una partita richiede un token: il profilo lo decide il server, non il client.
 */
import type {
  Difficulty,
  GridSize,
  LeaderboardFilters,
  LeaderboardResponse,
  PlayerStats,
  SubmitGamePayload,
} from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Registra una partita conclusa. Ritorna le statistiche aggiornate, o null se fallisce. */
export async function submitGame(
  payload: SubmitGamePayload,
  token: string | null,
): Promise<{ id: string; stats: PlayerStats } | null> {
  if (!token) return null; // senza profilo la partita non è classificabile
  try {
    const res = await fetch(`${SERVER_BASE}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; stats: PlayerStats };
  } catch {
    // Offline o server non raggiungibile: la partita non viene persa, semplicemente
    // non entra in classifica. Non è un errore da mostrare all'utente.
    return null;
  }
}

/** Scarica la classifica. Pubblica: funziona anche senza token. */
export async function fetchLeaderboard(
  filters: Partial<LeaderboardFilters>,
  token: string | null,
  signal?: AbortSignal,
): Promise<LeaderboardResponse | null> {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.period) params.set('period', filters.period);
  if (filters.gridSize) params.set('gridSize', String(filters.gridSize));
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  try {
    const res = await fetch(`${SERVER_BASE}/leaderboard?${params.toString()}`, {
      headers: authHeaders(token),
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardResponse;
  } catch {
    return null;
  }
}

/** Statistiche personali del giocatore autenticato. */
export async function fetchMyStats(
  token: string | null,
  signal?: AbortSignal,
): Promise<PlayerStats | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${SERVER_BASE}/me/stats`, { headers: authHeaders(token), signal });
    if (!res.ok) return null;
    return (await res.json()) as PlayerStats;
  } catch {
    return null;
  }
}

export type { Difficulty, GridSize };
