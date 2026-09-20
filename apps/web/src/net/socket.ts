import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@boggle/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * URL del server.
 * - In sviluppo: stringa vuota → usa l'origine corrente e il proxy di Vite.
 * - In produzione con frontend su CDN (Netlify) e server altrove: `VITE_SERVER_URL`.
 * - In produzione monolite (Express serve il frontend): stringa vuota → same-origin.
 */
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

/** Base per gli asset del server (dizionario). */
export const SERVER_BASE = SERVER_URL.replace(/\/$/, '');

let socket: GameSocket | null = null;

/** Socket singleton verso il server. */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SERVER_BASE || undefined, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
