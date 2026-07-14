import { io } from '../client/node_modules/socket.io-client/build/esm/index.js';
import * as Y from '../client/node_modules/yjs/dist/yjs.mjs';

const API = process.env.CODESYNC_API_URL || 'http://localhost:3001/api';
const WS = process.env.CODESYNC_WS_URL || 'http://localhost:3001';
const suffix = Date.now();
const createdRooms = [];
const sockets = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TestSession {
  cookies = new Map();

  get cookieHeader() {
    return Array.from(this.cookies.entries()).map(([key, value]) => `${key}=${value}`).join('; ');
  }

  absorb(res) {
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : splitSetCookieHeader(res.headers.get('set-cookie'));

    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(';');
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
  }
}

function splitSetCookieHeader(header) {
  if (!header) return [];
  return header.split(/,(?=\s*[^;,]+=)/g).map((value) => value.trim());
}

async function request(method, path, body, session) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.cookieHeader ? { Cookie: session.cookieHeader } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  session?.absorb(res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

const get = (path, session) => request('GET', path, undefined, session);
const post = (path, body, session) => request('POST', path, body, session);
const patch = (path, body, session) => request('PATCH', path, body, session);
const del = (path, session) => request('DELETE', path, undefined, session);

function waitFor(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connect(session) {
  const socket = io(WS, {
    extraHeaders: session?.cookieHeader ? { Cookie: session.cookieHeader } : {},
    forceNew: true,
    transports: ['websocket'],
  });
  sockets.push(socket);
  return socket;
}

function updatePayload(update) {
  return Array.from(update);
}

async function assertServerReady() {
  const healthUrl = `${API.replace(/\/api$/, '')}/health`;
  const res = await fetch(healthUrl).catch((error) => {
    throw new Error(`Server is not reachable at ${healthUrl}: ${error.message}`);
  });
  if (!res.ok) {
    throw new Error(`Server health check failed: ${res.status}`);
  }
}

async function makeUser(label) {
  const session = new TestSession();
  const user = await post('/auth/register', {
    username: `${label}_${suffix}`,
    email: `${label}_${suffix}@codesync.local`,
    password: 'codesync-test',
  }, session);
  return Object.assign(session, user);
}

async function createRoom(owner, overrides = {}) {
  const room = await post('/rooms', {
    name: `Smoke ${suffix}`,
    language: 'javascript',
    accessMode: 'public',
    defaultRole: 'editor',
    ...overrides,
  }, owner);
  createdRooms.push({ id: room.id, owner });
  return room;
}

async function testYjsCollaboration(owner, userA, userB) {
  const room = await createRoom(owner, { name: `Yjs smoke ${suffix}` });
  const socketA = connect(userA);
  const socketB = connect(userB);
  await Promise.all([waitFor(socketA, 'connect'), waitFor(socketB, 'connect')]);

  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const textA = docA.getText('monaco');
  const textB = docB.getText('monaco');

  socketA.on('yjs_update', (update) => Y.applyUpdate(docA, new Uint8Array(update), 'remote'));
  socketB.on('yjs_update', (update) => Y.applyUpdate(docB, new Uint8Array(update), 'remote'));
  docA.on('update', (update, origin) => {
    if (origin === 'local') socketA.emit('yjs_update', updatePayload(update));
  });
  docB.on('update', (update, origin) => {
    if (origin === 'local') socketB.emit('yjs_update', updatePayload(update));
  });

  const stateA = waitFor(socketA, 'room_state');
  const stateB = waitFor(socketB, 'room_state');
  const syncA = waitFor(socketA, 'yjs_sync');
  const syncB = waitFor(socketB, 'yjs_sync');
  socketA.emit('join_room', { roomId: room.id, username: userA.username });
  socketB.emit('join_room', { roomId: room.id, username: userB.username });
  await Promise.all([stateA, stateB]);
  Y.applyUpdate(docA, new Uint8Array(await syncA), 'remote');
  Y.applyUpdate(docB, new Uint8Array(await syncB), 'remote');

  const marker = '  console.log("Hello, World!");';
  const posA = textA.toString().indexOf(marker);
  const posB = textB.toString().indexOf(marker);
  if (posA < 0 || posB < 0) {
    throw new Error('Starter template did not sync into both Yjs documents');
  }

  const cursorFromB = waitFor(socketA, 'cursor_update');
  const cursorFromA = waitFor(socketB, 'cursor_update');
  socketA.emit('cursor', { position: posA, selection: { start: posA, end: posA + 10 } });
  socketB.emit('cursor', { position: posB + 20, selection: { start: posB + 20, end: posB + 30 } });
  const [seenB, seenA] = await Promise.all([cursorFromB, cursorFromA]);
  if (seenB.userId !== userB.userId || seenA.userId !== userA.userId) {
    throw new Error('Cursor presence did not fan out between users');
  }

  docA.transact(() => textA.insert(posA, '  const alpha = 2;\n'), 'local');
  docB.transact(() => textB.insert(posB, '  const beta = 3;\n'), 'local');
  await sleep(1500);

  const finalA = textA.toString();
  const finalB = textB.toString();
  if (finalA !== finalB) {
    throw new Error(`Yjs documents diverged\nA:\n${finalA}\nB:\n${finalB}`);
  }
  if (!finalA.includes('const alpha = 2;') || !finalA.includes('const beta = 3;')) {
    throw new Error(`Merged document is missing a concurrent edit:\n${finalA}`);
  }

  const runnable = finalA.replace('console.log("Hello, World!");', 'console.log(alpha + beta);');
  const execution = await post('/execute', { code: runnable, language: 'javascript', stdin: '' }, owner);
  if (execution.status !== 'Accepted' || (execution.stdout || '').trim() !== '5') {
    throw new Error(`Merged code execution failed: ${JSON.stringify(execution)}\n${runnable}`);
  }

  socketA.disconnect();
  socketB.disconnect();
  return 'Yjs collaboration, cursors, and execution';
}

async function testNotes(owner, reader) {
  const room = await createRoom(owner, { name: `Notes smoke ${suffix}` });
  const content = `Smoke notes ${suffix}\n- shared ideas`;
  await patch(`/rooms/${room.id}/notes`, { content }, owner);
  const notes = await get(`/rooms/${room.id}/notes`, reader);
  if (notes.content !== content) {
    throw new Error(`Notes did not persist for another user: ${JSON.stringify(notes)}`);
  }
  return 'room notes persistence';
}

async function testViewerPermissions(owner, viewer) {
  const room = await createRoom(owner, {
    name: `Viewer smoke ${suffix}`,
    defaultRole: 'viewer',
  });

  const socket = connect(viewer);
  await waitFor(socket, 'connect');
  const sync = waitFor(socket, 'room_state');
  socket.emit('join_room', { roomId: room.id, username: viewer.username });
  const state = await sync;
  if (state.role !== 'viewer') {
    throw new Error(`Expected viewer role, got ${JSON.stringify(state)}`);
  }

  const errorPromise = waitFor(socket, 'operation_error');
  socket.emit('yjs_update', [0, 0, 0]);
  const error = await errorPromise;
  if (!error.message?.includes('read-only')) {
    throw new Error(`Viewer edit was not blocked correctly: ${JSON.stringify(error)}`);
  }

  let notesBlocked = false;
  try {
    await patch(`/rooms/${room.id}/notes`, { content: 'viewer write' }, viewer);
  } catch (error) {
    notesBlocked = String(error.message).includes('403');
  }
  if (!notesBlocked) {
    throw new Error('Viewer was able to edit room notes');
  }

  socket.disconnect();
  return 'viewer read-only enforcement';
}

async function cleanup() {
  for (const socket of sockets) {
    if (socket.connected) socket.disconnect();
  }
  await sleep(2300);
  for (const room of createdRooms.reverse()) {
    await del(`/rooms/${room.id}`, room.owner).catch(() => {});
  }
}

async function main() {
  const passed = [];
  try {
    await assertServerReady();
    const ownerSession = new TestSession();
    const owner = Object.assign(ownerSession, await post('/auth/demo', {}, ownerSession));
    const userA = await makeUser('smoke_a');
    const userB = await makeUser('smoke_b');
    passed.push('server health and auth');
    passed.push(await testYjsCollaboration(owner, userA, userB));
    passed.push(await testNotes(owner, userA));
    passed.push(await testViewerPermissions(owner, userB));
    console.log(JSON.stringify({ status: 'PASS', passed }, null, 2));
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
