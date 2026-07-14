import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { getUsername } from '../lib/auth';

interface UseSocketOptions {
  roomId: string;
  onRoomState: (state: { content: string; revision: number; role?: string }) => void;
  onCursors?: (cursors: Array<{ userId: string; username: string; position: number; selection?: { start: number; end: number }; typing?: boolean }>) => void;
  onCursorUpdate: (cursor: { userId: string; username: string; position: number; selection?: { start: number; end: number }; typing?: boolean }) => void;
  onUserJoined: (user: { userId: string; username: string }) => void;
  onUserLeft: (user: { userId: string }) => void;
  onConnectionError?: (message: string) => void;
  onOperationError?: (message: string) => void;
  onYjsSync?: (update: number[]) => void;
  onYjsUpdate?: (update: number[]) => void;
  onTypingUpdate?: (update: { userId: string; username: string; typing: boolean }) => void;
}

export function useSocket({
  roomId,
  onRoomState,
  onCursors,
  onCursorUpdate,
  onUserJoined,
  onUserLeft,
  onConnectionError,
  onOperationError,
  onYjsSync,
  onYjsUpdate,
  onTypingUpdate,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef({
    onRoomState,
    onCursors,
    onCursorUpdate,
    onUserJoined,
    onUserLeft,
    onConnectionError,
    onOperationError,
    onYjsSync,
    onYjsUpdate,
    onTypingUpdate,
  });

  handlersRef.current = {
    onRoomState,
    onCursors,
    onCursorUpdate,
    onUserJoined,
    onUserLeft,
    onConnectionError,
    onOperationError,
    onYjsSync,
    onYjsUpdate,
    onTypingUpdate,
  };

  useEffect(() => {
    const username = getUsername() || 'Anonymous';

    const socket = io(import.meta.env.VITE_WS_URL || window.location.origin, {
      withCredentials: true,
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { roomId, username });
    });

    socket.on('room_state', (state) => handlersRef.current.onRoomState(state));
    socket.on('yjs_sync', (update: number[]) => handlersRef.current.onYjsSync?.(update));
    socket.on('yjs_update', (update: number[]) => handlersRef.current.onYjsUpdate?.(update));
    socket.on('typing_update', (update) => handlersRef.current.onTypingUpdate?.(update));
    socket.on('cursors', (cursors) => handlersRef.current.onCursors?.(cursors));
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

  const sendCursor = useCallback((position: number, selection?: { start: number; end: number }, typing = false) => {
    socketRef.current?.emit('cursor', { position, selection, typing });
  }, []);

  const sendYjsUpdate = useCallback((update: number[]) => {
    socketRef.current?.emit('yjs_update', update);
  }, []);

  return { sendCursor, sendYjsUpdate };
}
