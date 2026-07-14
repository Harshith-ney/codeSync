import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import { redis, setCursor, getCursors, removeCursor } from './presence';
import { db } from '../db';

interface HistoryOperation {
  type: 'insert' | 'delete';
  position: number;
  content?: string;
  length?: number;
  revision: number;
  userId: string;
  roomId: string;
}

// In-memory room state: revision + document content
const roomState = new Map<string, {
  revision: number;
  content: string;
  history: HistoryOperation[];
  ydoc: Y.Doc;
  ytext: Y.Text;
}>();

async function getUserRoomRole(roomId: string, userId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
  const result = await db.query(
    `SELECT CASE
              WHEN r.owner_id = $2 THEN 'owner'
              WHEN rm.role IS NOT NULL THEN rm.role
              WHEN r.access_mode = 'public' THEN r.default_role
              ELSE NULL
            END as role
     FROM rooms r
     LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $2
     WHERE r.id = $1`,
    [roomId, userId],
  );

  return result.rows[0]?.role ?? null;
}

function canEdit(role: string | null) {
  return role === 'owner' || role === 'editor';
}

function toUpdatePayload(update: Uint8Array) {
  return Array.from(update);
}

function fromUpdatePayload(update: number[]) {
  return new Uint8Array(update);
}

function parseCookieHeader(header?: string) {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey || rawValue.length === 0) return cookies;
    cookies[rawKey] = decodeURIComponent(rawValue.join('='));
    return cookies;
  }, {});
}

function diffToOperation(
  before: string,
  after: string,
  base: Pick<HistoryOperation, 'revision' | 'userId' | 'roomId'>,
): HistoryOperation | null {
  if (before === after) return null;

  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const removed = beforeEnd - start;
  const inserted = after.slice(start, afterEnd);

  if (removed > 0 && inserted.length === 0) {
    return { ...base, type: 'delete', position: start, length: removed };
  }

  if (inserted.length > 0 && removed === 0) {
    return { ...base, type: 'insert', position: start, content: inserted };
  }

  return null;
}

async function logOperation(op: HistoryOperation) {
  await db.query(
    `INSERT INTO document_operations (room_id, user_id, type, position, content, length, revision)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      op.roomId,
      op.userId,
      op.type,
      op.position,
      op.content ?? null,
      op.length ?? null,
      op.revision,
    ],
  );
}

async function getRoomState(roomId: string) {
  if (!roomState.has(roomId)) {
    const result = await db.query(
      'SELECT content, revision FROM documents WHERE room_id = $1',
      [roomId],
    );
    const row = result.rows[0];
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('monaco');
    ytext.insert(0, row?.content ?? '');
    roomState.set(roomId, {
      revision: row?.revision ?? 0,
      content: ytext.toString(),
      history: [],
      ydoc,
      ytext,
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
         SELECT $1, $2, $3
         WHERE EXISTS (SELECT 1 FROM rooms WHERE id = $1)
         ON CONFLICT (room_id) DO UPDATE SET content = $2, revision = $3, updated_at = NOW()`,
        [roomId, state.content, state.revision],
      );
    }, 2000),
  );
}

export function setupWebSocket(io: Server) {
  // Redis pub/sub for multi-instance support (optional — degrades gracefully if Redis is down)
  const sub = redis.duplicate();
  sub.options.maxRetriesPerRequest = 0;
  sub.on('error', (err) => {
    if (err.message.includes('Connection in subscriber mode')) return;
    if ((sub as any)._lastLoggedError !== err.message) {
      console.warn('[Redis sub] connection error:', err.message);
      (sub as any)._lastLoggedError = err.message;
    }
  });

  sub.on('message', async (channel: string, message: string) => {
    if (!channel.startsWith('yjs-room:')) {
      return;
    }

    const roomId = channel.replace('yjs-room:', '');
    const update = fromUpdatePayload(JSON.parse(message) as number[]);
    const state = await getRoomState(roomId);
    const before = state.ytext.toString();
    Y.applyUpdate(state.ydoc, update, 'redis-yjs');
    const after = state.ytext.toString();
    if (before !== after) {
      state.content = after;
      state.revision += 1;
      schedulePersist(roomId);
    }
    io.to(roomId).emit('yjs_update', toUpdatePayload(update));
  });

  io.use((socket: Socket, next) => {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies.accessToken || socket.handshake.auth.token as string;
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
      const role = await getUserRoomRole(roomId, userId);
      if (!role) {
        socket.emit('room_error', { message: 'You do not have access to this room.' });
        return;
      }

      socket.join(roomId);
      (socket as any).roomId = roomId;
      (socket as any).username = username;
      (socket as any).roomRole = role;

      try {
        await sub.subscribe(`yjs-room:${roomId}`);
      } catch { /* Redis unavailable, single-instance mode */ }

      const state = await getRoomState(roomId);
      socket.emit('room_state', { content: state.content, revision: state.revision, role });
      socket.emit('yjs_sync', toUpdatePayload(Y.encodeStateAsUpdate(state.ydoc)));

      let cursors: Awaited<ReturnType<typeof getCursors>> = [];
      try { cursors = await getCursors(roomId); } catch { /* Redis unavailable */ }
      socket.emit('cursors', cursors);

      socket.to(roomId).emit('user_joined', { userId, username });
    });

    socket.on('yjs_update', async (payload: number[]) => {
      const roomId = (socket as any).roomId as string;
      if (!roomId) return;
      if (!canEdit((socket as any).roomRole)) {
        socket.emit('operation_error', { message: 'This room is read-only for you.' });
        return;
      }

      const state = await getRoomState(roomId);
      const before = state.ytext.toString();
      const update = fromUpdatePayload(payload);
      Y.applyUpdate(state.ydoc, update, socket.id);
      const after = state.ytext.toString();
      if (before === after) return;

      state.content = after;
      state.revision += 1;

      const op = diffToOperation(before, after, {
        revision: state.revision,
        userId,
        roomId,
      });
      if (op) {
        state.history.push(op);
        if (state.history.length > 1000) state.history.splice(0, 500);
        try { await logOperation(op); } catch (err: any) {
          console.warn('[History] failed to log Yjs operation:', err.message);
        }
      }

      schedulePersist(roomId);
      socket.to(roomId).emit('yjs_update', toUpdatePayload(update));
      try {
        await redis.publish(`yjs-room:${roomId}`, JSON.stringify(toUpdatePayload(update)));
      } catch { /* Redis unavailable, local broadcast already sent */ }
    });

    socket.on('cursor', async (cursorState: { position: number; selection?: { start: number; end: number } }) => {
      const roomId = (socket as any).roomId as string;
      const username = (socket as any).username as string;
      if (!roomId) return;

      const state = { userId, username, ...cursorState };
      try { await setCursor(roomId, state); } catch { /* Redis unavailable */ }
      socket.to(roomId).emit('cursor_update', state);
    });

    socket.on('disconnect', async () => {
      const roomId = (socket as any).roomId as string;
      if (!roomId) return;
      try { await removeCursor(roomId, userId); } catch { /* Redis unavailable */ }
      socket.to(roomId).emit('user_left', { userId });
    });
  });
}
