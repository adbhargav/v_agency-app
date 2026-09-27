import { Router } from 'express';
import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';

const router = Router();

router.get('/', async (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const [{ rows }, count] = await Promise.all([
    query(
      `SELECT * FROM notifications WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
        ORDER BY created_at DESC LIMIT 100`,
      [req.user.id],
    ),
    query('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]),
  ]);
  res.json({
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      taskId: n.task_id,
      projectId: n.project_id,
      priority: n.priority,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
    unreadCount: count.rows[0].n,
  });
});

router.post('/read-all', async (req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  const { rowCount } = await query(
    'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id::text = $1 AND user_id = $2',
    [req.params.id, req.user.id],
  );
  if (!rowCount) throw notFound('Notification not found');
  res.json({ ok: true });
});

export default router;
