// k6 load test — run with: k6 run load-tests/concurrent-users.js
import { check } from 'k6';
import ws from 'k6/ws';

export let options = {
  vus: 50,
  duration: '60s',
  thresholds: {
    ws_connecting: ['p(95)<200'],
  },
};

export default function () {
  const url = 'ws://your-ec2-ip/socket.io/?roomId=test-room&EIO=4&transport=websocket';

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // Join room
      socket.send('40/');

      // Send a test insert operation
      socket.send(
        JSON.stringify([
          'operation',
          {
            type: 'insert',
            position: 0,
            content: 'a',
            revision: 1,
            userId: `user-${__VU}`,
            roomId: 'test-room',
          },
        ]),
      );
    });

    socket.on('message', () => {});
    socket.on('error', (e) => console.error('WS error', e));
    socket.setTimeout(() => socket.close(), 5000);
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
