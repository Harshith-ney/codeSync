import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, language = 'javascript' } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Room name is required' });
    return;
  }
  try {
    const id = uuidv4();
    const result = await db.query(
      'INSERT INTO rooms (id, name, owner_id, language) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, name, req.userId, language],
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await db.query(
      `SELECT r.*, u.username as owner_name
       FROM rooms r
       JOIN users u ON r.owner_id = u.id
       ORDER BY r.created_at DESC`,
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await db.query(
      `SELECT r.*, u.username as owner_name, d.content as document_content
       FROM rooms r
       JOIN users u ON r.owner_id = u.id
       LEFT JOIN documents d ON d.room_id = r.id
       WHERE r.id = $1`,
      [req.params.id],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await db.query(
      'DELETE FROM rooms WHERE id = $1 AND owner_id = $2 RETURNING id',
      [req.params.id, req.userId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Room not found or not authorized' });
      return;
    }
    res.json({ deleted: result.rows[0].id });
  } catch {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

export default router;
