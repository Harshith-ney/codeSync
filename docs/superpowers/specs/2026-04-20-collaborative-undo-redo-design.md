its# Collaborative Undo/Redo — Design Spec

**Date:** 2026-04-20  
**Project:** CodeSync  
**Feature:** Server-side collaborative undo/redo via per-user op history and OT transform

---

## Goal

Add Ctrl+Z / Ctrl+Y undo/redo to the collaborative editor that works correctly when multiple users are editing simultaneously. Each user undoes only their own edits, and the server transforms the inverse op through any concurrent edits before applying it — so the document always converges to a consistent state across all clients.

---

## Approach

**Option chosen: Server-side transform (per-user history)**

The server tracks each user's applied ops separately. On an undo request, the server computes the inverse of the target op, transforms it through all global ops that happened after it, and broadcasts the result as a regular operation. The client stays dumb — it intercepts Ctrl+Z/Y and delegates everything to the server.

This builds directly on the existing `transform()` function and room state structure.

---

## Architecture

```
Client                          Server                         Other Clients
  |                               |                                |
  |-- undo event ---------------→ |                                |
  |                               | pop from userUndoStack         |
  |                               | compute inverse op             |
  |                               | transform through history[n+1…]|
  |                               | apply to document              |
  |                               | push to userRedoStack          |
  |                               |-- operation (broadcast) ------→|
  |←-- operation ---------------  |                                |
  | (apply like any remote op)    |                                |
```

No new apply path on the client — the server's inverse op arrives via the existing `operation` event and is applied like any remote edit.

---

## Data Structures

### EnrichedOp

Extends `Operation` with two server-only fields:

```typescript
interface EnrichedOp extends Operation {
  deletedContent?: string;  // extracted by server for delete ops before applying
  historyIndex: number;     // position in global history[] when this op was applied
}
```

`deletedContent` is needed to invert a `delete` back into an `insert`. The client only sends `length` for deletes; the server knows the document content at apply time so it extracts and stores the deleted text there.

### Room State Extensions

```typescript
{
  revision: number;
  content: string;
  history: Operation[];                         // existing, unchanged
  userUndoStacks: Map<string, EnrichedOp[]>;   // userId → undo-able ops
  userRedoStacks: Map<string, EnrichedOp[]>;   // userId → redo-able ops
}
```

---

## Server Logic

### On regular `operation` event (changes to existing handler)

1. Enrich the op before storing:
   - If `type === 'delete'`: extract `content.slice(position, position + length)` and store as `deletedContent`
   - Set `historyIndex` to current `history.length` (before pushing)
2. Push enriched op to `userUndoStacks[userId]`
3. Clear `userRedoStacks[userId]` (new edit invalidates redo)
4. Continue with existing transform/apply/broadcast logic unchanged

### On `undo` event `{ roomId }`

1. Pop last `EnrichedOp` from `userUndoStacks[userId]` — if empty, emit `undo_error: "Nothing to undo"` to sender only
2. Compute inverse:
   - `insert` → `{ type: 'delete', position: op.position, length: op.content.length }`
   - `delete` → `{ type: 'insert', position: op.position, content: op.deletedContent }`
3. Collect all history entries where `entry.historyIndex > record.historyIndex`
4. Transform inverse through each of those entries in order using `transform()`
5. Clamp transformed position to `[0, content.length]` (guards against out-of-bounds)
6. If transformed op is a zero-length delete, skip apply and broadcast (silent no-op)
7. Apply to document, increment revision, push to history (tagged `isUndo: true`)
8. Broadcast transformed inverse as `operation` to room
9. Push original `EnrichedOp` to `userRedoStacks[userId]`

### On `redo` event `{ roomId }`

1. Pop last `EnrichedOp` from `userRedoStacks[userId]` — if empty, emit `undo_error: "Nothing to redo"`
2. Use the original op (not inverted)
3. Collect all history entries after `record.historyIndex`
4. Transform through each entry, clamp, check for no-op
5. Apply, increment revision, push to history (tagged `isRedo: true`)
6. Broadcast as `operation`
7. Push a **new** `EnrichedOp` to `userUndoStacks[userId]` — same op but with `historyIndex` updated to the redo op's position in history (so a subsequent undo only transforms through ops after the redo, not through the original undo op too)

### `isUndo` / `isRedo` tags

Ops tagged with `isUndo: true` or `isRedo: true` are **not** pushed to any user's undo stack when they arrive. This prevents undo of an undo from re-entering the stack incorrectly. These tags are server-only and stripped before broadcast.

---

## Client Changes

### Intercept Monaco's native undo/redo

Monaco has its own local undo — we must suppress it and replace it with our socket-based version.

In `useEditor`:

```typescript
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
  sendUndo();
});
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => {
  sendRedo();
});
// macOS: Cmd+Shift+Z
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
  () => { sendRedo(); }
);
```

### useSocket additions

```typescript
sendUndo: () => socket.emit('undo', { roomId });
sendRedo: () => socket.emit('redo', { roomId });
```

Listen for `undo_error` and surface a brief toast notification.

---

## Error Handling & Edge Cases

| Case | Handling |
|---|---|
| Undo stack empty | Emit `undo_error` to sender only, no broadcast |
| Transformed inverse is zero-length delete | Silent no-op, no broadcast |
| Transformed position out of bounds | Clamp to `[0, content.length]` |
| Op older than pruned history window (>1000) | `undo_error: "Too far back to undo"` — documented limitation |
| Redo after new concurrent edits | Transform handles it; result may shift position but is always consistent |

---

## Testing Plan

1. **`invertOp` unit test** — insert→delete and delete→insert round-trips produce correct inverse ops
2. **`transformInverse` unit test** — undo of op X after concurrent op Y (insert and delete combinations) produces correct transformed inverse
3. **Socket integration test** — two-client room: Client A types, Client B types, Client A undoes — verify document state on both clients converges correctly

---

## Known Limitations & Tradeoffs

| Decision | Tradeoff |
|---|---|
| Undo only your own ops | Users cannot undo others' edits — standard for collaborative editors |
| History pruning at 1000 ops | Cannot undo ops older than the pruning window |
| New edit clears redo stack | Standard text editor behavior; expected by users |
| `isUndo` tag stripped before broadcast | Keeps existing client op handling unchanged |

---

## Files to Change

| File | Change |
|---|---|
| `server/src/ws/index.ts` | Extend room state, enrich ops, add `undo`/`redo` event handlers |
| `server/src/ws/operations.ts` | Add `EnrichedOp` type, `invertOp()`, `isNoOp()` helpers |
| `client/src/hooks/useSocket.ts` | Add `sendUndo`, `sendRedo`, `undo_error` listener |
| `client/src/hooks/useEditor.ts` | Intercept Ctrl+Z/Y, wire to `sendUndo`/`sendRedo` |
| `client/src/components/Editor/Editor.tsx` | Surface `undo_error` toast |
