/**
 * lib/socket.ts — Singleton Socket.io client with typed event helpers
 */
import { io, Socket } from 'socket.io-client';

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface PlayerData {
  id:           string;
  name:         string;
  group:        number;
  gender?:      'boy' | 'girl';
  currentRoom?: string;
  x:            number;
  y:            number;
  color:        string;
  facing?:      string;
}

export interface MovePayload {
  id:           string;
  x:            number;
  y:            number;
  currentRoom?: string;
  facing?:      string;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    const url = process.env.NEXT_PUBLIC_SERVER_URL || 'https://ase-aomc.onrender.com';
    _socket = io(url, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    _socket.on('connect', () =>
      console.log(`[Socket] Connected: ${_socket?.id}`)
    );
    _socket.on('disconnect', (reason) =>
      console.log(`[Socket] Disconnected: ${reason}`)
    );
    _socket.on('connect_error', (err) =>
      console.error('[Socket] Connection error:', err.message)
    );
  }
  return _socket;
}

export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}

// ─── Typed Emitters ───────────────────────────────────────────────────────────

export function emitJoin(socket: Socket, data: Omit<PlayerData, 'id' | 'color'>): void {
  socket.emit('join', data);
}

export function emitMove(socket: Socket, data: Omit<MovePayload, 'id'>): void {
  socket.emit('move', data);
}
