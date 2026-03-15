import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Operation } from '../lib/ot';

interface UseSocketOptions {
  roomId: string;
  onOperation: (op: Operation) => void;
  onRoomState: (state: { content: string; revision: number }) => void;
  onCursorUpdate: (cursor: { userId: string; username: string; position: number }) => void;
  onUserJoined: (user: { userId: string; username: string }) => void;
  onUserLeft: (user: { userId: string }) => void;
}

export function useSocket({
  roomId,
  onOperation,
  onRoomState,
  onCursorUpdate,
  onUserJoined,
  onUserLeft,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const username = localStorage.getItem('username') || 'Anonymous';

    const socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3001', {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { roomId, username });
    });

    socket.on('room_state', onRoomState);
    socket.on('operation', onOperation);
    socket.on('cursor_update', onCursorUpdate);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);

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

  return { sendOperation, sendCursor };
}
