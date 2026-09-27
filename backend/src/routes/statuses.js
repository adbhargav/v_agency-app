import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { serializeCustomStatus, serializeMasterStatus } from '../lib/serialize.js';

const router = Router();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// ---- Master statuses: the rigid agency-wide columns of the Master Kanban ----

router.get('/master', async (_req, res) => {
  const { rows } = await query('SELECT * FROM master_statuses ORDER BY position');
  res.json({ statuses: rows.map(serializeMasterStatus) });
});

router.post('/master', requireRole('admin'), async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1), color: color.optional(), isDone: z.boolean().optional() }), req.body);
  const { rows } = await query(
    `INSERT INTO master_statuses (name, color, is_done, position)
     VALUES ($1, COALESCE($2, '#6366f1'), COALESCE($3, false), (SELECT COALESCE(MAX(position), -1) + 1 FROM master_statuses))
     RETURNING *`,
    [b.name, b.color ?? null, b.isDone ?? null],
  );
  res.status(201).json({ status: serializeMasterStatus(rows[0]) });
});

router.patch('/master/:id', requireRole('admin'), async (req, res) => {
  const b = parse(
    z.object({ name: z.string().trim().min(1).optional(), color: color.optional(), isDone: z.boolean().optional(), position: z.number().int().min(0).optional() }),
    req.body,
  );
  const { rows } = await query(
    `UPDATE master_statuses SET name = COALESCE($2, name), color = COALESCE($3, color),
            is_done = COALESCE($4, is_done), position = COALESCE($5, position)
      WHERE id = $1 RETURNING *`,
    [req.params.id, b.name ?? null, b.color ?? null, b.isDone ?? null, b.position ?? null],
  );
  if (!rows[0]) throw notFound('Status not found');
  res.json({ status: serializeMasterStatus(rows[0]) });
});

router.delete('/master/:id', requireRole('admin'), async (req, res) => {
  const { rows } = await query(
    `SELECT (SELECT COUNT(*) FROM tasks WHERE master_status_id = $1)::int AS tasks,
            (SELECT COUNT(*) FROM custom_statuses WHERE master_status_id = $1)::int AS mappings,
            (SELECT COUNT(*) FROM master_statuses)::int AS total`,
    [req.params.id],
  );
  const usage = rows[0];
  if (usage.tasks || usage.mappings) throw conflict('Status is in use by tasks or employee columns', usage);
  if (usage.total <= 1) throw conflict('At least one master status is required');
  const { rowCount } = await query('DELETE FROM master_statuses WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Status not found');
  res.json({ ok: true });
});

// ---- Custom statuses: an employee's own column names, each mapped to a master status ----

const custom = Router();
custom.use(requireRole('employee'));

async function ensureDefaults(userId) {
  await query(
    `INSERT INTO custom_statuses (user_id, name, master_status_id, position)
     SELECT $1, ms.name, ms.id, ms.position FROM master_statuses ms
      WHERE NOT EXISTS (SELECT 1 FROM custom_statuses WHERE user_id = $1)`,
    [userId],
  );
}

async function assertMaster(id) {
  const { rowCount } = await query('SELECT 1 FROM master_statuses WHERE id = $1', [id]);
  if (!rowCount) throw badRequest('masterStatusId does not exist');
}

custom.get('/', async (req, res) => {
  await ensureDefaults(req.user.id);
  const { rows } = await query('SELECT * FROM custom_statuses WHERE user_id = $1 ORDER BY position, created_at', [req.user.id]);
  res.json({ statuses: rows.map(serializeCustomStatus) });
});

custom.post('/', async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(40), masterStatusId: z.string().uuid() }), req.body);
  await assertMaster(b.masterStatusId);
  const { rows } = await query(
    `INSERT INTO custom_statuses (user_id, name, master_status_id, position)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), -1) + 1 FROM custom_statuses WHERE user_id = $1)) RETURNING *`,
    [req.user.id, b.name, b.masterStatusId],
  );
  res.status(201).json({ status: serializeCustomStatus(rows[0]) });
});

custom.patch('/:id', async (req, res) => {
  const b = parse(
    z.object({ name: z.string().trim().min(1).max(40).optional(), masterStatusId: z.string().uuid().optional(), position: z.number().int().min(0).optional() }),
    req.body,
  );
  if (b.masterStatusId) await assertMaster(b.masterStatusId);
  const status = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE custom_statuses SET name = COALESCE($3, name), master_status_id = COALESCE($4, master_status_id),
              position = COALESCE($5, position)
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, b.name ?? null, b.masterStatusId ?? null, b.position ?? null],
    );
    if (!rows[0]) throw notFound('Status not found');
    // Re-mapping a column moves its tasks on the Master Kanban too.
    if (b.masterStatusId) {
      await db.query(
        `UPDATE tasks SET master_status_id = $2 WHERE custom_status_id = $1 AND assignee_id = $3`,
        [rows[0].id, b.masterStatusId, req.user.id],
      );
    }
    return rows[0];
  });
  res.json({ status: serializeCustomStatus(status) });
});

custom.delete('/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM custom_statuses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) throw notFound('Status not found');
  res.json({ ok: true });
});

router.use('/custom', custom);

export default router;
