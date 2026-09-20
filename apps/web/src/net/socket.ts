import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@boggle/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** Socket singleton verso il server (proxy Vite in sviluppo). */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'], autoConnect: true });
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
