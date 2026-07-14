import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Operation } from '../lib/ot';
import { getAccessToken, getUsername } from '../lib/auth';

interface UseSocketOptions {
  roomId: string;
  onOperation: (op: Operation) => void;
  onRoomState: (state: { content: string; revision: number; role?: string }) => void;
  onCursorUpdate: (cursor: { userId: string; username: string; position: number; selection?: { start: number; end: number } }) => void;
  onUserJoined: (user: { userId: string; username: string }) => void;
  onUserLeft: (user: { userId: string }) => void;
  onConnectionError?: (message: string) => void;
  onOperationError?: (message: string) => void;
  onYjsSync?: (update: number[]) => void;
  onYjsUpdate?: (update: number[]) => void;
}

export function useSocket({
  roomId,
  onOperation,
  onRoomState,
  onCursorUpdate,
  onUserJoined,
  onUserLeft,
  onConnectionError,
  onOperationError,
  onYjsSync,
  onYjsUpdate,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef({
    onOperation,
    onRoomState,
    onCursorUpdate,
    onUserJoined,
    onUserLeft,
    onConnectionError,
    onOperationError,
    onYjsSync,
    onYjsUpdate,
  });

  handlersRef.current = {
    onOperation,
    onRoomState,
    onCursorUpdate,
    onUserJoined,
    onUserLeft,
    onConnectionError,
    onOperationError,
    onYjsSync,
    onYjsUpdate,
  };

  useEffect(() => {
    const token = getAccessToken();
    const username = getUsername() || 'Anonymous';

    const socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3001', {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { roomId, username });
    });

    socket.on('room_state', (state) => handlersRef.current.onRoomState(state));
    socket.on('operation', (op) => handlersRef.current.onOperation(op));
    socket.on('yjs_sync', (update: number[]) => handlersRef.current.onYjsSync?.(update));
    socket.on('yjs_update', (update: number[]) => handlersRef.current.onYjsUpdate?.(update));
    socket.on('cursor_update', (cursor) => handlersRef.current.onCursorUpdate(cursor));
    socket.on('user_joined', (user) => handlersRef.current.onUserJoined(user));
    socket.on('user_left', (user) => handlersRef.current.onUserLeft(user));
    socket.on('room_error', ({ message }: { message: string }) => {
      handlersRef.current.onConnectionError?.(message || 'Unable to join room.');
    });
    socket.on('operation_error', ({ message }: { message: string }) => {
      handlersRef.current.onOperationError?.(message || 'You cannot edit this room.');
    });
    socket.on('connect_error', (error) => {
      handlersRef.current.onConnectionError?.(error.message || 'Failed to connect to collaboration server.');
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const sendOperation = useCallback((op: Operation) => {
    socketRef.current?.emit('operation', op);
  }, []);

  const sendCursor = useCallback((position: number, selection?: { start: number; end: number }) => {
    socketRef.current?.emit('cursor', { position, selection });
  }, []);

  const sendYjsUpdate = useCallback((update: number[]) => {
    socketRef.current?.emit('yjs_update', update);
  }, []);

  return { sendOperation, sendCursor, sendYjsUpdate };
}
