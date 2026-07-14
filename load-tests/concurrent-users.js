// k6 load test
// Run against a deployed app:
//   BASE_URL=https://codesync.example.com k6 run load-tests/concurrent-users.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import ws from 'k6/ws';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const WS_URL = BASE_URL.replace(/^http/, 'ws');

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '60s',
  thresholds: {
    checks: ['rate>0.95'],
    ws_connecting: ['p(95)<200'],
  },
};

function cookieHeaderFrom(res) {
  const raw = res.headers['Set-Cookie'] || res.headers['set-cookie'] || '';
  return raw
    .split(/,(?=\s*[^;,]+=)/g)
    .map((cookie) => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

export function setup() {
  const auth = http.post(
    `${BASE_URL}/api/auth/demo`,
    JSON.stringify({}),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(auth, { 'demo auth ok': (res) => res.status === 200 });

  const cookie = cookieHeaderFrom(auth);
  const room = http.post(
    `${BASE_URL}/api/rooms`,
    JSON.stringify({
      name: `k6 room ${Date.now()}`,
      language: 'javascript',
      accessMode: 'public',
      defaultRole: 'editor',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
    },
  );
  const roomCreated = check(room, { 'room created': (res) => res.status === 201 || res.status === 200 });
  if (!roomCreated) {
    console.error(`room create failed: status=${room.status} body=${room.body}`);
  }

  return {
    cookie,
    roomId: room.json('id'),
  };
}

export default function (data) {
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, { headers: { Cookie: data.cookie } }, (socket) => {
    socket.on('open', () => {
      socket.send('40');
    });

    socket.on('message', (message) => {
      if (message.startsWith('40')) {
        socket.send(`42["join_room",{"roomId":"${data.roomId}","username":"k6-${__VU}"}]`);
      }
      if (message.startsWith('42["room_state"')) {
        socket.setInterval(() => {
          socket.send(`42["cursor",{"position":${__ITER % 80},"selection":{"start":0,"end":${__ITER % 20}}}]`);
        }, 1000);
      }
    });

    socket.on('error', (error) => {
      console.error(`socket error: ${error.error()}`);
    });

    socket.setTimeout(() => socket.close(), 10000);
  });

  check(res, { 'websocket upgraded': (r) => r && r.status === 101 });
  sleep(1);
}
