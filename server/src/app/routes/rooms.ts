import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

const VALID_ROLES = new Set(['editor', 'viewer']);
const VALID_ACCESS_MODES = new Set(['public', 'invite']);
const LANGUAGE_TEMPLATES: Record<string, string> = {
  javascript: `// JavaScript
function main() {
  console.log("Hello, World!");
}

main();
`,
  typescript: `// TypeScript
function main(): void {
  console.log("Hello, World!");
}

main();
`,
  python: `# Python
def main():
    print("Hello, World!")

if __name__ == "__main__":
    main()
`,
  java: `// Java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
`,
  cpp: `// C++
#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
`,
  c: `// C
#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}
`,
  go: `// Go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
`,
  rust: `// Rust
fn main() {
    println!("Hello, World!");
}
`,
};

async function getRoomAccess(roomId: string, userId: string) {
  const result = await db.query(
    `SELECT r.*,
            CASE
              WHEN r.owner_id = $2 THEN 'owner'
              WHEN rm.role IS NOT NULL THEN rm.role
              WHEN r.access_mode = 'public' THEN r.default_role
              ELSE NULL
            END as current_user_role
     FROM rooms r
     LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $2
     WHERE r.id = $1`,
    [roomId, userId],
  );

  return result.rows[0];
}

function canView(room: any) {
  return room?.current_user_role === 'owner' || room?.current_user_role === 'editor' || room?.current_user_role === 'viewer';
}

function canEdit(room: any) {
  return room?.current_user_role === 'owner' || room?.current_user_role === 'editor';
}

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    name,
    language = 'javascript',
    accessMode = 'public',
    defaultRole = 'editor',
  } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Room name is required' });
    return;
  }
  if (!VALID_ACCESS_MODES.has(accessMode) || !VALID_ROLES.has(defaultRole)) {
    res.status(400).json({ error: 'Invalid room sharing settings' });
    return;
  }
  try {
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO rooms (id, name, owner_id, language, access_mode, default_role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *, 'owner' as current_user_role`,
      [id, name, req.userId, language, accessMode, defaultRole],
    );
    await db.query(
      'INSERT INTO documents (room_id, content, revision) VALUES ($1, $2, 0)',
      [id, LANGUAGE_TEMPLATES[language] || ''],
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await db.query(
      `SELECT r.*, u.username as owner_name,
              CASE
                WHEN r.owner_id = $1 THEN 'owner'
                WHEN rm.role IS NOT NULL THEN rm.role
                ELSE r.default_role
              END as current_user_role
       FROM rooms r
       JOIN users u ON r.owner_id = u.id
       LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
       WHERE r.access_mode = 'public'
          OR r.owner_id = $1
          OR rm.user_id IS NOT NULL
       ORDER BY r.created_at DESC`,
      [req.userId],
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await db.query(
      `SELECT r.*, u.username as owner_name, d.content as document_content,
              CASE
                WHEN r.owner_id = $2 THEN 'owner'
                WHEN rm.role IS NOT NULL THEN rm.role
                WHEN r.access_mode = 'public' THEN r.default_role
                ELSE NULL
              END as current_user_role
       FROM rooms r
       JOIN users u ON r.owner_id = u.id
       LEFT JOIN documents d ON d.room_id = r.id
       LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $2
       WHERE r.id = $1`,
      [req.params.id, req.userId],
    );
    const room = result.rows[0];
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (!canView(room)) {
      res.status(403).json({ error: 'This room is invite-only. Use a valid invite link to join.' });
      return;
    }
    res.json(room);
  } catch {
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

router.post('/:id/join', async (req: AuthRequest, res: Response): Promise<void> => {
  const { inviteToken } = req.body;
  if (!inviteToken) {
    res.status(400).json({ error: 'Invite token is required' });
    return;
  }

  try {
    const room = await db.query('SELECT * FROM rooms WHERE id = $1 AND invite_token = $2', [req.params.id, inviteToken]);
    if (!room.rows[0]) {
      res.status(404).json({ error: 'Invalid invite link' });
      return;
    }

    if (room.rows[0].owner_id === req.userId) {
      res.json({ role: 'owner' });
      return;
    }

    await db.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [req.params.id, req.userId, room.rows[0].default_role],
    );
    res.json({ role: room.rows[0].default_role });
  } catch {
    res.status(500).json({ error: 'Failed to join room' });
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, language, accessMode, defaultRole, rotateInvite } = req.body;
  if (accessMode && !VALID_ACCESS_MODES.has(accessMode)) {
    res.status(400).json({ error: 'Invalid access mode' });
    return;
  }
  if (defaultRole && !VALID_ROLES.has(defaultRole)) {
    res.status(400).json({ error: 'Invalid default role' });
    return;
  }

  try {
    const room = await getRoomAccess(req.params.id, req.userId!);
    if (!room || room.current_user_role !== 'owner') {
      res.status(404).json({ error: 'Room not found or not authorized' });
      return;
    }

    const result = await db.query(
      `UPDATE rooms
       SET name = COALESCE($3, name),
           language = COALESCE($4, language),
           access_mode = COALESCE($5, access_mode),
           default_role = COALESCE($6, default_role),
           invite_token = CASE WHEN $7 THEN uuid_generate_v4() ELSE invite_token END,
           updated_at = NOW()
       WHERE id = $1 AND owner_id = $2
       RETURNING *, 'owner' as current_user_role`,
      [req.params.id, req.userId, name || null, language || null, accessMode || null, defaultRole || null, !!rotateInvite],
    );

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update room' });
  }
});

router.get('/:id/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await getRoomAccess(req.params.id, req.userId!);
    if (!canView(room)) {
      res.status(404).json({ error: 'Room not found or not authorized' });
      return;
    }

    const result = await db.query(
      `SELECT o.id, o.type, o.position, o.content, o.length, o.revision, o.created_at, u.username
       FROM document_operations o
       JOIN users u ON u.id = o.user_id
       WHERE o.room_id = $1
       ORDER BY o.revision ASC`,
      [req.params.id],
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch document history' });
  }
});

router.get('/:id/notes', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const room = await getRoomAccess(req.params.id, req.userId!);
    if (!canView(room)) {
      res.status(404).json({ error: 'Room not found or not authorized' });
      return;
    }

    const result = await db.query(
      `SELECT content, updated_at
       FROM room_notes
       WHERE room_id = $1`,
      [req.params.id],
    );

    res.json(result.rows[0] || { content: '', updated_at: null });
  } catch {
    res.status(500).json({ error: 'Failed to fetch room notes' });
  }
});

router.patch('/:id/notes', async (req: AuthRequest, res: Response): Promise<void> => {
  const { content = '' } = req.body;

  try {
    const room = await getRoomAccess(req.params.id, req.userId!);
    if (!canEdit(room)) {
      res.status(403).json({ error: 'You do not have permission to edit room notes' });
      return;
    }

    const result = await db.query(
      `INSERT INTO room_notes (room_id, content)
       VALUES ($1, $2)
       ON CONFLICT (room_id) DO UPDATE SET content = $2, updated_at = NOW()
       RETURNING content, updated_at`,
      [req.params.id, content],
    );

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to save room notes' });
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
