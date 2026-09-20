/**
 * Profili salvati sul dispositivo, con switch rapido.
 *
 * Perché più profili: sullo stesso telefono giocano più persone. Ogni profilo
 * tiene il proprio token (non la password), così il passaggio è immediato e non
 * serve reinserire nulla.
 *
 * Sicurezza: salviamo il TOKEN di sessione, non la password. I token stanno in
 * `localStorage`, che è per-origine: nessun altro sito può leggerli. Su un
 * dispositivo condiviso chiunque apra il gioco può usare i profili salvati:
 * è la stessa exposure di un'app che "ricorda l'accesso".
 */
import type { ProfilePrivate } from '@boggle/shared';

/**
 * Chiavi di `localStorage`.
 *
 * NOTA: mantengono il prefisso storico `boggle-it.` anche se il gioco ora si chiama
 * Sbooble. Queste chiavi contengono i DATI DEGLI UTENTI (profili, token di sessione),
 * quindi rinominarle senza migrazione li perderebbe. Il nome interno non è visibile
 * all'utente: non vale il rischio di una migrazione per cambiarlo.
 */
const STORAGE_KEY = 'boggle-it.profiles.v1';
const ACTIVE_KEY = 'boggle-it.activeProfile.v1';

export interface SavedProfile {
  /** Id del profilo sul server. */
  id: string;
  token: string;
  nickname: string;
  avatar: string;
  /** URL della foto (per cache-busting: cambia quando si aggiorna). */
  photoUrl?: string;
  /** Copia locale del profilo, per mostrare subito la schermata. */
  profile: ProfilePrivate;
}

function readAll(): SavedProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedProfile[];
    return Array.isArray(parsed) ? parsed.filter((p) => p?.id && p?.token) : [];
  } catch {
    return [];
  }
}

function writeAll(profiles: SavedProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* quota o storage disabilitato: il gioco funziona comunque senza persistenza */
  }
}

export function listProfiles(): SavedProfile[] {
  return readAll();
}

export function getActiveProfile(): SavedProfile | null {
  const id = localStorage.getItem(ACTIVE_KEY);
  if (!id) return null;
  return readAll().find((p) => p.id === id) ?? null;
}

export function setActiveProfile(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignora */
  }
}

/** Aggiunge (o aggiorna) un profilo e lo rende attivo. */
export function saveProfile(entry: SavedProfile): void {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === entry.id);
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  writeAll(all);
  setActiveProfile(entry.id);
}

/** Aggiorna i dati di un profilo salvato senza cambiarne il token. */
export function updateSavedProfile(
  id: string,
  patch: Partial<Omit<SavedProfile, 'id' | 'token'>>,
): void {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx]!, ...patch };
  writeAll(all);
}

export function removeProfile(id: string): void {
  const all = readAll().filter((p) => p.id !== id);
  writeAll(all);
  if (localStorage.getItem(ACTIVE_KEY) === id) setActiveProfile(all[0]?.id ?? null);
}

export function clearAllProfiles(): void {
  writeAll([]);
  setActiveProfile(null);
}

/** Token del profilo attivo, per autenticare le chiamate e Socket.IO. */
export function activeToken(): string | null {
  return getActiveProfile()?.token ?? null;
}
