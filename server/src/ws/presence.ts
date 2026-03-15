import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});
redis.on('error', (err) => {
  // Log once, don't crash — Redis is optional for single-instance dev
  if ((redis as any)._lastLoggedError !== err.message) {
    console.warn('[Redis] connection error:', err.message);
    (redis as any)._lastLoggedError = err.message;
  }
});

export interface CursorState {
  userId: string;
  username: string;
  position: number;
  selection?: { start: number; end: number };
}

const CURSOR_TTL = 30; // seconds

export async function setCursor(roomId: string, state: CursorState): Promise<void> {
  const key = `cursor:${roomId}:${state.userId}`;
  await redis.setex(key, CURSOR_TTL, JSON.stringify(state));
}

export async function getCursors(roomId: string): Promise<CursorState[]> {
  const keys = await redis.keys(`cursor:${roomId}:*`);
  if (!keys.length) return [];
  const values = await redis.mget(...keys);
  return values
    .filter(Boolean)
    .map((v) => JSON.parse(v!) as CursorState);
}

export async function removeCursor(roomId: string, userId: string): Promise<void> {
  await redis.del(`cursor:${roomId}:${userId}`);
}

export { redis };
