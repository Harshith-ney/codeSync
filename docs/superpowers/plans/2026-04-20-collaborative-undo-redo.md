# Collaborative Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ctrl+Z / Ctrl+Y collaborative undo/redo where the server transforms the inverse op through all concurrent edits before broadcasting, so every client converges correctly.

**Architecture:** The server tracks each user's applied ops in a per-user undo stack. On an undo request, the server computes the inverse of the target op, transforms it through all global ops that happened after it (using the existing `transform()` function), and broadcasts the result as a regular `operation` event. The client intercepts Ctrl+Z/Y and delegates everything to the server — no local undo state.

**Tech Stack:** Node.js + TypeScript · Socket.IO · Jest + ts-jest (new) · React + Monaco Editor

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `server/src/ws/operations.ts` | Modify | Add `EnrichedOp` type, `invertOp()`, `isNoOp()`, extend `Operation` with `isUndo?`/`isRedo?` |
| `server/src/ws/operations.test.ts` | Create | Unit tests for `invertOp` and `isNoOp` |
| `server/src/ws/index.ts` | Modify | Extend room state, enrich ops on apply, add `undo`/`redo` socket handlers |
| `client/src/lib/ot.ts` | Modify | Extend `Operation` with `isUndo?`/`isRedo?` |
| `client/src/hooks/useSocket.ts` | Modify | Add `sendUndo`, `sendRedo`, `onUndoError` |
| `client/src/components/Editor/Editor.tsx` | Modify | Key bindings, fix remote op filter, undo error toast |

---

## Task 1: Add Jest + ts-jest to the server

No tests exist yet. This task sets up the test runner.

**Files:**
- Modify: `server/package.json`
- Create: `server/jest.config.js`

- [ ] **Step 1: Install test dependencies**

```bash
cd server && npm install --save-dev jest ts-jest @types/jest
```

Expected: packages installed, `node_modules` updated.

- [ ] **Step 2: Create jest config**

Create `server/jest.config.js`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
};
```

- [ ] **Step 3: Add test script to server/package.json**

In the `"scripts"` section of `server/package.json`, add:

```json
"test": "jest"
```

So the scripts block becomes:

```json
"scripts": {
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "migrate": "ts-node src/db/migrate.ts",
  "test": "jest"
}
```

- [ ] **Step 4: Verify Jest runs (no tests yet)**

```bash
cd server && npm test
```

Expected output contains: `No test suites found` (or similar — not a crash).

---

## Task 2: Extend Operation types on server and client

Both `server/src/ws/operations.ts` and `client/src/lib/ot.ts` define `Operation`. Add two optional flags so clients can identify undo/redo ops from themselves and apply them (normally they skip their own ops).

**Files:**
- Modify: `server/src/ws/operations.ts`
- Modify: `client/src/lib/ot.ts`

- [ ] **Step 1: Add isUndo and isRedo to server Operation interface**

In `server/src/ws/operations.ts`, change the `Operation` interface to:

```typescript
export interface Operation {
  type: 'insert' | 'delete';
  position: number;
  content?: string;
  length?: number;
  revision: number;
  userId: string;
  roomId: string;
  isUndo?: boolean;
  isRedo?: boolean;
}
```

- [ ] **Step 2: Add isUndo and isRedo to client Operation interface**

In `client/src/lib/ot.ts`, change the `Operation` interface to:

```typescript
export interface Operation {
  type: 'insert' | 'delete';
  position: number;
  content?: string;
  length?: number;
  revision: number;
  userId: string;
  roomId: string;
  isUndo?: boolean;
  isRedo?: boolean;
}
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

```bash
cd ../client && npx tsc --noEmit
```

Expected: no errors.

---

## Task 3: Add EnrichedOp type and helper functions

Add the `EnrichedOp` type (an `Operation` enriched with deleted content for inverting), `invertOp()`, and `isNoOp()` to `server/src/ws/operations.ts`. Write tests first.

**Files:**
- Create: `server/src/ws/operations.test.ts`
- Modify: `server/src/ws/operations.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/ws/operations.test.ts`:

```typescript
import { invertOp, isNoOp, EnrichedOp } from './operations';

const base = { revision: 5, userId: 'u1', roomId: 'r1' };

describe('invertOp', () => {
  it('inverts an insert into a delete', () => {
    const op: EnrichedOp = { ...base, type: 'insert', position: 3, content: 'hello' };
    const inv = invertOp(op);
    expect(inv.type).toBe('delete');
    expect(inv.position).toBe(3);
    expect(inv.length).toBe(5);
    expect(inv.isUndo).toBe(true);
  });

  it('inverts a delete into an insert using deletedContent', () => {
    const op: EnrichedOp = { ...base, type: 'delete', position: 2, length: 3, deletedContent: 'abc' };
    const inv = invertOp(op);
    expect(inv.type).toBe('insert');
    expect(inv.position).toBe(2);
    expect(inv.content).toBe('abc');
    expect(inv.isUndo).toBe(true);
  });
});

describe('isNoOp', () => {
  it('returns true for a zero-length delete', () => {
    expect(isNoOp({ ...base, type: 'delete', position: 0, length: 0 })).toBe(true);
  });

  it('returns true for an empty-string insert', () => {
    expect(isNoOp({ ...base, type: 'insert', position: 0, content: '' })).toBe(true);
  });

  it('returns false for a real insert', () => {
    expect(isNoOp({ ...base, type: 'insert', position: 0, content: 'x' })).toBe(false);
  });

  it('returns false for a real delete', () => {
    expect(isNoOp({ ...base, type: 'delete', position: 0, length: 2 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd server && npm test
```

Expected: `Cannot find module './operations'` or `invertOp is not a function` — confirms tests are wired up but the functions don't exist yet.

- [ ] **Step 3: Add EnrichedOp, invertOp, and isNoOp to operations.ts**

In `server/src/ws/operations.ts`, add after the `Operation` interface:

```typescript
export interface EnrichedOp extends Operation {
  deletedContent?: string;
}

export function invertOp(op: EnrichedOp): Operation {
  if (op.type === 'insert') {
    return {
      type: 'delete',
      position: op.position,
      length: op.content!.length,
      revision: op.revision,
      userId: op.userId,
      roomId: op.roomId,
      isUndo: true,
    };
  }
  return {
    type: 'insert',
    position: op.position,
    content: op.deletedContent!,
    revision: op.revision,
    userId: op.userId,
    roomId: op.roomId,
    isUndo: true,
  };
}

export function isNoOp(op: Operation): boolean {
  if (op.type === 'delete') return !op.length || op.length === 0;
  if (op.type === 'insert') return !op.content || op.content === '';
  return false;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd server && npm test
```

Expected: `8 tests passed`.

---

## Task 4: Extend room state and enrich ops on apply

Add per-user undo/redo stacks to the in-memory room state. When a regular `operation` event arrives, extract `deletedContent` (for delete ops) and push an `EnrichedOp` to the user's undo stack.

**Files:**
- Modify: `server/src/ws/index.ts`

- [ ] **Step 1: Update the import line at the top of index.ts**

Change:
```typescript
import { Operation, transform, applyOperation } from './operations';
```
To:
```typescript
import { Operation, EnrichedOp, transform, applyOperation, invertOp, isNoOp } from './operations';
```

- [ ] **Step 2: Update the room state type and getRoomState initializer**

Change the `roomState` declaration from:
```typescript
const roomState = new Map<string, { revision: number; content: string; history: Operation[] }>();
```
To:
```typescript
const roomState = new Map<string, {
  revision: number;
  content: string;
  history: Operation[];
  userUndoStacks: Map<string, EnrichedOp[]>;
  userRedoStacks: Map<string, EnrichedOp[]>;
}>();
```

In `getRoomState()`, change the `roomState.set(...)` call to:
```typescript
roomState.set(roomId, {
  revision: row?.revision ?? 0,
  content: row?.content ?? '',
  history: [],
  userUndoStacks: new Map(),
  userRedoStacks: new Map(),
});
```

- [ ] **Step 3: Enrich ops in the existing operation handler**

In `server/src/ws/index.ts`, inside `socket.on('operation', ...)`, replace these three lines:

```typescript
state.content = applyOperation(state.content, transformedOp);
state.revision = transformedOp.revision;
state.history.push(transformedOp);
```

With:

```typescript
// Capture deleted content before applying (needed for undo inversion)
let deletedContent: string | undefined;
if (transformedOp.type === 'delete' && transformedOp.length) {
  deletedContent = state.content.slice(transformedOp.position, transformedOp.position + transformedOp.length);
}

state.content = applyOperation(state.content, transformedOp);
state.revision = transformedOp.revision;
state.history.push(transformedOp);

// Track enriched op for undo/redo
const enriched: EnrichedOp = deletedContent !== undefined
  ? { ...transformedOp, deletedContent }
  : { ...transformedOp };

const undoStack = state.userUndoStacks.get(op.userId) || [];
undoStack.push(enriched);
state.userUndoStacks.set(op.userId, undoStack);
state.userRedoStacks.set(op.userId, []);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

---

## Task 5: Add undo socket event handler

**Files:**
- Modify: `server/src/ws/index.ts`

Add this handler inside the `io.on('connection', ...)` block, after the existing `cursor` handler and before `disconnect`:

- [ ] **Step 1: Add the undo handler**

```typescript
socket.on('undo', async () => {
  const roomId = (socket as any).roomId as string;
  if (!roomId) return;

  const state = await getRoomState(roomId);
  const undoStack = state.userUndoStacks.get(userId) || [];

  if (undoStack.length === 0) {
    socket.emit('undo_error', { message: 'Nothing to undo' });
    return;
  }

  const record = undoStack[undoStack.length - 1];

  // Guard: if history was pruned and we can't find all ops after record, refuse
  const earliestHistoryRevision = state.history.length > 0 ? state.history[0].revision : Infinity;
  if (earliestHistoryRevision > record.revision + 1) {
    socket.emit('undo_error', { message: 'Too far back to undo' });
    return;
  }

  undoStack.pop();
  state.userUndoStacks.set(userId, undoStack);

  const opsAfter = state.history.filter((h) => h.revision > record.revision);

  let inverseOp = invertOp(record);
  for (const histOp of opsAfter) {
    inverseOp = transform(inverseOp, histOp);
  }

  // Clamp position to document bounds
  inverseOp = { ...inverseOp, position: Math.min(inverseOp.position, state.content.length) };

  // Track redo before potential early return
  const redoStack = state.userRedoStacks.get(userId) || [];
  redoStack.push(record);
  state.userRedoStacks.set(userId, redoStack);

  if (isNoOp(inverseOp)) return; // nothing to broadcast, but redo stack updated

  inverseOp = { ...inverseOp, revision: state.revision + 1, isUndo: true };
  state.content = applyOperation(state.content, inverseOp);
  state.revision = inverseOp.revision;
  state.history.push(inverseOp);
  if (state.history.length > 1000) state.history.splice(0, 500);

  schedulePersist(roomId);

  try {
    await redis.publish(`room:${roomId}`, JSON.stringify(inverseOp));
  } catch {
    io.to(roomId).emit('operation', inverseOp);
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

---

## Task 6: Add redo socket event handler

**Files:**
- Modify: `server/src/ws/index.ts`

Add this handler after the `undo` handler (still inside `io.on('connection', ...)`):

- [ ] **Step 1: Add the redo handler**

```typescript
socket.on('redo', async () => {
  const roomId = (socket as any).roomId as string;
  if (!roomId) return;

  const state = await getRoomState(roomId);
  const redoStack = state.userRedoStacks.get(userId) || [];

  if (redoStack.length === 0) {
    socket.emit('undo_error', { message: 'Nothing to redo' });
    return;
  }

  const record = redoStack[redoStack.length - 1];
  redoStack.pop();
  state.userRedoStacks.set(userId, redoStack);

  const opsAfter = state.history.filter((h) => h.revision > record.revision);

  // Start from the original op (not the inverse) and transform forward
  let redoOp: Operation = {
    type: record.type,
    position: record.position,
    content: record.content,
    length: record.length,
    revision: record.revision,
    userId: record.userId,
    roomId: record.roomId,
    isRedo: true,
  };

  for (const histOp of opsAfter) {
    redoOp = transform(redoOp, histOp);
  }

  redoOp = { ...redoOp, position: Math.min(redoOp.position, state.content.length) };

  // Capture deleted content for future undo of this redo
  let deletedContent: string | undefined;
  if (redoOp.type === 'delete' && redoOp.length) {
    deletedContent = state.content.slice(redoOp.position, redoOp.position + redoOp.length);
  }

  redoOp = { ...redoOp, revision: state.revision + 1 };

  if (isNoOp(redoOp)) return;

  state.content = applyOperation(state.content, redoOp);
  state.revision = redoOp.revision;
  state.history.push(redoOp);
  if (state.history.length > 1000) state.history.splice(0, 500);

  schedulePersist(roomId);

  // Push back to undo stack with updated revision so next undo transforms from here
  const undoStack = state.userUndoStacks.get(userId) || [];
  const enrichedRedone: EnrichedOp = { ...redoOp, deletedContent };
  undoStack.push(enrichedRedone);
  state.userUndoStacks.set(userId, undoStack);

  try {
    await redis.publish(`room:${roomId}`, JSON.stringify(redoOp));
  } catch {
    io.to(roomId).emit('operation', redoOp);
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run existing tests to make sure nothing is broken**

```bash
cd server && npm test
```

Expected: `8 tests passed`, same as before.

---

## Task 7: Fix handleRemoteOp in Editor.tsx to apply undo/redo ops from self

Currently `handleRemoteOp` skips any op whose `userId` matches the local user. But undo/redo ops are computed by the server and the client needs to apply them, even when `userId` matches.

**Files:**
- Modify: `client/src/components/Editor/Editor.tsx`

- [ ] **Step 1: Update the handleRemoteOp filter**

In `Editor.tsx`, find:

```typescript
const handleRemoteOp = useCallback((op: Operation) => {
  if (op.userId === userId) return;
  suppressRef.current = true;
  applyRemoteOperation(op, editorRef);
  setRevision(op.revision);
  suppressRef.current = false;
}, [applyRemoteOperation, userId]);
```

Change the guard to:

```typescript
const handleRemoteOp = useCallback((op: Operation) => {
  if (op.userId === userId && !op.isUndo && !op.isRedo) return;
  suppressRef.current = true;
  applyRemoteOperation(op, editorRef);
  setRevision(op.revision);
  suppressRef.current = false;
}, [applyRemoteOperation, userId]);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors (`isUndo` and `isRedo` are now on the `Operation` type from Task 2).

---

## Task 8: Add sendUndo, sendRedo, and onUndoError to useSocket

**Files:**
- Modify: `client/src/hooks/useSocket.ts`

- [ ] **Step 1: Add onUndoError to UseSocketOptions and wire up the event**

Replace the entire content of `client/src/hooks/useSocket.ts` with:

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Operation } from '../lib/ot';
import { getAccessToken, getUsername } from '../lib/auth';

interface UseSocketOptions {
  roomId: string;
  onOperation: (op: Operation) => void;
  onRoomState: (state: { content: string; revision: number }) => void;
  onCursorUpdate: (cursor: { userId: string; username: string; position: number }) => void;
  onUserJoined: (user: { userId: string; username: string }) => void;
  onUserLeft: (user: { userId: string }) => void;
  onConnectionError?: (message: string) => void;
  onUndoError?: (message: string) => void;
}

export function useSocket({
  roomId,
  onOperation,
  onRoomState,
  onCursorUpdate,
  onUserJoined,
  onUserLeft,
  onConnectionError,
  onUndoError,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef({
    onOperation,
    onRoomState,
    onCursorUpdate,
    onUserJoined,
    onUserLeft,
    onConnectionError,
    onUndoError,
  });

  handlersRef.current = {
    onOperation,
    onRoomState,
    onCursorUpdate,
    onUserJoined,
    onUserLeft,
    onConnectionError,
    onUndoError,
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
    socket.on('cursor_update', (cursor) => handlersRef.current.onCursorUpdate(cursor));
    socket.on('user_joined', (user) => handlersRef.current.onUserJoined(user));
    socket.on('user_left', (user) => handlersRef.current.onUserLeft(user));
    socket.on('connect_error', (error) => {
      handlersRef.current.onConnectionError?.(error.message || 'Failed to connect to collaboration server.');
    });
    socket.on('undo_error', ({ message }: { message: string }) => {
      handlersRef.current.onUndoError?.(message);
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

  const sendUndo = useCallback(() => {
    socketRef.current?.emit('undo');
  }, []);

  const sendRedo = useCallback(() => {
    socketRef.current?.emit('redo');
  }, []);

  return { sendOperation, sendCursor, sendUndo, sendRedo };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

---

## Task 9: Wire undo key bindings and error toast in Editor.tsx

Intercept Ctrl+Z / Ctrl+Y (and Cmd+Z / Cmd+Shift+Z on Mac) in Monaco and route them to the server. Show a brief error banner when the server says there is nothing to undo/redo.

**Files:**
- Modify: `client/src/components/Editor/Editor.tsx`

- [ ] **Step 1: Add undoError state and auto-dismiss effect**

In `Editor()`, after the existing `useState` declarations, add:

```typescript
const [undoError, setUndoError] = useState<string | null>(null);

useEffect(() => {
  if (!undoError) return;
  const t = setTimeout(() => setUndoError(null), 2000);
  return () => clearTimeout(t);
}, [undoError]);
```

- [ ] **Step 2: Add refs for sendUndo/sendRedo**

After the line `const sendOperationRef = useRef<(op: Operation) => void>(() => {});`, add:

```typescript
const sendUndoRef = useRef<() => void>(() => {});
const sendRedoRef = useRef<() => void>(() => {});
```

- [ ] **Step 3: Get sendUndo and sendRedo from useSocket and pass onUndoError**

In the `useSocket(...)` call, add `onUndoError` and destructure the new methods:

```typescript
const { sendOperation, sendCursor, sendUndo, sendRedo } = useSocket({
  roomId,
  onOperation: handleRemoteOp,
  onRoomState: ({ content, revision: rev }) => {
    const value = content || LANGUAGE_TEMPLATES[language] || '';
    pendingInitialStateRef.current = { content: value, revision: rev };

    const model = editorRef.current?.getModel();
    if (!model) return;

    suppressRef.current = true;
    if (model.getValue() !== value) {
      model.setValue(value);
    }
    setRevision(rev);
    suppressRef.current = false;
    setConnectionError(null);
  },
  onCursorUpdate: (cursor) => {
    setCursors((prev) => {
      const filtered = prev.filter((c) => c.userId !== cursor.userId);
      return [...filtered, cursor];
    });
  },
  onUserJoined: () => {},
  onUserLeft: ({ userId: uid }) => {
    setCursors((prev) => prev.filter((c) => c.userId !== uid));
  },
  onConnectionError: setConnectionError,
  onUndoError: setUndoError,
});
sendOperationRef.current = sendOperation;
sendUndoRef.current = sendUndo;
sendRedoRef.current = sendRedo;
```

- [ ] **Step 4: Update onMount to accept the monaco instance and register key bindings**

Change the `onMount` function signature and add key bindings. The `@monaco-editor/react` `onMount` prop passes `(editor, monaco)` — the second arg is the monaco namespace needed for key codes.

Replace:

```typescript
function onMount(editor: Monaco.editor.IStandaloneCodeEditor) {
```

With:

```typescript
function onMount(editor: Monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco) {
```

At the end of `onMount`, after `editor.onDidChangeCursorPosition(...)`, add:

```typescript
// Override Monaco's local undo/redo with server-side collaborative versions
editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyZ, () => {
  sendUndoRef.current();
});
editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyY, () => {
  sendRedoRef.current();
});
editor.addCommand(
  monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyZ,
  () => { sendRedoRef.current(); },
);
```

- [ ] **Step 5: Add undo error banner to JSX**

In the `return (...)` of `Editor()`, after the existing `connectionError` banner, add:

```tsx
{undoError && (
  <div style={undoErrorStyle}>{undoError}</div>
)}
```

And add the style constant at the bottom of the file with the other style constants:

```typescript
const undoErrorStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: 12,
  color: '#ffe0a3',
  background: '#3d2f00',
  borderBottom: '1px solid #5c4500',
};
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run server tests one final time**

```bash
cd server && npm test
```

Expected: `8 tests passed`.

---

## Manual Verification Checklist

Once all tasks are complete, start the full stack (PostgreSQL + Redis + server + client) and verify:

- [ ] Open the editor in two browser tabs (Tab A and Tab B)
- [ ] In Tab A: type "hello world"
- [ ] Press Ctrl+Z in Tab A: "hello world" disappears from both tabs
- [ ] Press Ctrl+Y in Tab A: "hello world" reappears in both tabs
- [ ] In Tab A: type "foo", in Tab B immediately type "bar" after it
- [ ] Press Ctrl+Z in Tab A: "foo" is removed without touching "bar" in both tabs
- [ ] Press Ctrl+Z repeatedly until stack is empty: undo error banner appears briefly
- [ ] Verify Tab B's undo stack is independent of Tab A's
