# Local Testing Report

**Date:** 2026-08-03
**Scope:** Real-time collaborative editing (Yjs CRDT sync, typing presence, cursor broadcast)
**Method:** Playwright, two independent browser sessions simulating two users (Alice, Bob) against the local dev stack (client on `:5173`, server on `:3001`, local Postgres + Redis).

## Summary

| Area | Result |
|---|---|
| Register / login flow | Pass |
| Room creation + join (public room) | Pass |
| Typing presence broadcast (remote) | Pass |
| Local typing presence (self) | Pass |
| Typing indicator clears after idle | Pass |
| Yjs document sync (plain text) | Pass |
| Yjs document sync (compound edits, e.g. auto-closed brackets) | **Fail — see issue below (now fixed, see Resolution)** |

## Issue: Document sync permanently desyncs on compound edits

**Severity:** High — affects the app's core feature (real-time collaborative editing).

**Status:** Root-caused, fixed, and verified against the Playwright repro below. See **Resolution** at the end of this section.

**Symptom:** When one user types text that causes Monaco to fire multiple content-change events in quick succession (e.g. typing `{` triggers an auto-inserted matching `}`, combined with auto-indent on Enter), the other collaborator's editor stops receiving further updates from that point on. The two documents diverge and never resync, even as the first user keeps typing.

**Reproduction:**
1. Two users join the same room.
2. User A types plain text (no brackets) → syncs correctly for both users. (Control case — confirms the base sync pipeline works.)
3. User A types text containing a brace pair and newline, e.g.:
   ```
   function hello() {
     return 'hi';
   }
   ```
4. User B's editor stops updating partway through (observed stopping right after `function hello()`, missing the `{` onward), while User A's own editor shows the full text.
5. Reproduced consistently across multiple runs, and in both directions (A→B and B→A).

**Root cause:** [`server/src/ws/index.ts:230-271`](server/src/ws/index.ts#L230-L271), the `yjs_update` socket handler:

```ts
socket.on('yjs_update', async (payload: number[]) => {
  ...
  const state = await getRoomState(roomId);
  const before = state.ytext.toString();
  const update = fromUpdatePayload(payload);
  Y.applyUpdate(state.ydoc, update, socket.id);
  const after = state.ytext.toString();
  if (before === after) return;   // <-- silently drops the broadcast
  ...
  socket.to(roomId).emit('yjs_update', toUpdatePayload(update));
  ...
});
```

**Update — the paragraphs above described the original hypothesis (async-handler interleaving). Re-verification below found the actual mechanism is different; see "What the evidence actually showed."**

**What the evidence actually showed:** The handler was instrumented to log `before`/`after`/early-returns and the repro was rerun. Every message's `before` value exactly matched the *previous* message's `after` value — `yjs_update` messages are applied strictly in order, never interleaved. There is no race to serialize.

The early return instead fires on a single update that, applied entirely on its own, leaves the text unchanged. This lines up with Monaco's "type over an auto-closed bracket" behavior: when the user types `)` immediately after Monaco auto-inserted a matching `)`, Monaco just moves the cursor over the existing character instead of inserting a new one. The Yjs binding still emits a real update for that keystroke, and while it's textually a no-op, it's *structurally* significant — it introduces new CRDT items that the client's later edits reference. Skipping the broadcast because `before === after` starves the other peer of that structural update; once their `Y.Doc` is missing it, everything integrated afterward becomes unintegrable ("pending") on their side, which is exactly where the observed desync starts (`function hello()`, right after a closing-paren type-over).

**Not the cause (ruled out):**
- Not a Playwright/test artifact — an isolated control test typing plain alphanumeric text (no brackets, no rapid compound edits) synced perfectly between both users.
- Not a typing-presence regression from `Broadcast typing state from edits` / `Fix typing broadcast fanout` — those commits didn't introduce this bug. That said, the `typing_update` broadcast at L262-266 is emitted from inside this same handler and was gated behind the identical `before === after` check, so it was a secondary casualty of this bug: a type-over keystroke silently dropped the typing indicator too, not just the document content.
- Not an async/interleaving race — ruled out directly by the instrumented re-run (see above). The originally suspected mechanism does not occur.

## Resolution

**Fix applied:** [`server/src/ws/index.ts:230-271`](server/src/ws/index.ts#L230-L271) no longer gates the broadcast (`socket.to(roomId).emit('yjs_update', ...)`) or the Redis publish on `before !== after`. Both now always run, forwarding every update regardless of its visible text diff. Only the revision bump, history/operation logging, and debounced persistence are gated behind `before !== after`, since those only care about visible content. This mirrors the pattern already used correctly by the Redis pub/sub relay handler a few lines up ([server/src/ws/index.ts:168-185](server/src/ws/index.ts#L168-L185)), which broadcasts unconditionally and only gates its own state/persist logic on the diff.

**Verification:** Re-ran the Playwright repro against the fixed server.
- Compound-edit case (`test_collab.py`): document content now syncs correctly in both directions (A→B and B→A); typing presence also passes.
- Plain-text control case (`test_sync_isolated.py`): still passes, confirming no regression.

## Test artifacts

- Playwright scripts: `/private/tmp/claude-501/-Users-harshitheturu-codeSync/ca911c76-ec9c-42e3-bebf-e665ee00c79c/scratchpad/test_collab.py`, `test_sync_isolated.py`
- Screenshots: `alice.png`, `bob.png` in the same scratchpad directory
