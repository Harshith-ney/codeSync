import { CookieOptions, Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';

const router = Router();

function signAccess(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '15m' });
}

function signRefresh(userId: string) {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
}

const isProduction = process.env.NODE_ENV === 'production';

const accessCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setAuthCookies(res: Response, userId: string) {
  res.cookie('accessToken', signAccess(userId), accessCookieOptions);
  res.cookie('refreshToken', signRefresh(userId), refreshCookieOptions);
}

function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken', accessCookieOptions);
  res.clearCookie('refreshToken', refreshCookieOptions);
}

router.post('/demo', async (_req: Request, res: Response): Promise<void> => {
  const email = 'demo@codesync.local';
  const username = 'Demo User';
  const password = 'codesync-demo';

  try {
    let result = await db.query('SELECT id, username FROM users WHERE email = $1', [email]);

    if (!result.rows[0]) {
      const hash = await bcrypt.hash(password, 10);
      const id = uuidv4();
      result = await db.query(
        `INSERT INTO users (id, username, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username`,
        [id, username, email, hash],
      );
    }

    const user = result.rows[0];
    setAuthCookies(res, user.id);
    res.json({
      userId: user.id,
      username: user.username,
    });
  } catch {
    res.status(500).json({ error: 'Demo login failed' });
  }
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await db.query(
      'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, username, email, hash],
    );
    setAuthCookies(res, id);
    res.status(201).json({ userId: id, username });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Email or username already taken' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Missing email or password' });
    return;
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    setAuthCookies(res, user.id);
    res.json({
      userId: user.id,
      username: user.username,
    });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    res.status(400).json({ error: 'No refresh token' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { userId: string };
    res.cookie('accessToken', signAccess(payload.userId), accessCookieOptions);
    res.json({ ok: true });
  } catch {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', (_req: Request, res: Response): void => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

export default router;
