import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { redis, setCursor, getCursors, removeCursor } from './presence';
import { Operation, transform, applyOperation } from './operations';
import { db } from '../db';

// In-memory room state: revision + document content
const roomState = new Map<string, { revision: number; content: string; history: Operation[] }>();

async function getRoomState(roomId: string) {
  if (!roomState.has(roomId)) {
    const result = await db.query(
      'SELECT content, revision FROM documents WHERE room_id = $1',
      [roomId],
    );
    const row = result.rows[0];
    roomState.set(roomId, {
      revision: row?.revision ?? 0,
      content: row?.content ?? '',
      history: [],
    });
  }
  return roomState.get(roomId)!;
}

// Debounced persistence: save document to DB 2s after last edit
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePersist(roomId: string) {
  if (persistTimers.has(roomId)) clearTimeout(persistTimers.get(roomId)!);
  persistTimers.set(
    roomId,
    setTimeout(async () => {
      const state = roomState.get(roomId);
      if (!state) return;
      await db.query(
        `INSERT INTO documents (room_id, content, revision)
         VALUES ($1, $2, $3)
         ON CONFLICT (room_id) DO UPDATE SET content = $2, revision = $3, updated_at = NOW()`,
        [roomId, state.content, state.revision],
      );
    }, 2000),
  );
}

export function setupWebSocket(io: Server) {
  // Redis pub/sub for multi-instance support
  const sub = redis.duplicate();
  sub.on('error', (err) => {
    if ((sub as any)._lastLoggedError !== err.message) {
      console.warn('[Redis sub] connection error:', err.message);
      (sub as any)._lastLoggedError = err.message;
    }
  });

  sub.on('message', (channel: string, message: string) => {
    const roomId = channel.replace('room:', '');
    const op = JSON.parse(message) as Operation;
    io.to(roomId).emit('operation', op);
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string;

    socket.on('join_room', async ({ roomId, username }: { roomId: string; username: string }) => {
      socket.join(roomId);
      (socket as any).roomId = roomId;
      (socket as any).username = username;

      await sub.subscribe(`room:${roomId}`);

      const state = await getRoomState(roomId);
      socket.emit('room_state', { content: state.content, revision: state.revision });

      const cursors = await getCursors(roomId);
      socket.emit('cursors', cursors);

      socket.to(roomId).emit('user_joined', { userId, username });
    });

    socket.on('operation', async (op: Operation) => {
      const roomId = (socket as any).roomId as string;
      if (!roomId) return;

      const state = await getRoomState(roomId);

      let transformedOp = { ...op };

      // Transform against all ops applied since the client's revision
      if (op.revision < state.revision) {
        const opsToTransformAgainst = state.history.slice(op.revision);
        for (const appliedOp of opsToTransformAgainst) {
          transformedOp = transform(transformedOp, appliedOp);
        }
      }

      transformedOp.revision = state.revision + 1;
      state.content = applyOperation(state.content, transformedOp);
      state.revision = transformedOp.revision;
      state.history.push(transformedOp);

      // Keep history bounded
      if (state.history.length > 1000) state.history.splice(0, 500);

      schedulePersist(roomId);

      await redis.publish(`room:${roomId}`, JSON.stringify(transformedOp));
    });

    socket.on('cursor', async (cursorState: { position: number; selection?: { start: number; end: number } }) => {
      const roomId = (socket as any).roomId as string;
      const username = (socket as any).username as string;
      if (!roomId) return;

      const state = { userId, username, ...cursorState };
      await setCursor(roomId, state);
      socket.to(roomId).emit('cursor_update', state);
    });

    socket.on('disconnect', async () => {
      const roomId = (socket as any).roomId as string;
      if (!roomId) return;
      await removeCursor(roomId, userId);
      socket.to(roomId).emit('user_left', { userId });
    });
  });
}
