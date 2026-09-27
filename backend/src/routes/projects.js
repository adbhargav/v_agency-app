import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { getProject, listProjects } from '../services/projects.js';
import { driveConfigured } from '../services/google.js';
import { createFolder } from '../services/drive.js';

const router = Router();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

router.get('/', async (req, res) => {
  res.json({ projects: await listProjects(req.user) });
});

router.get('/:id', async (req, res) => {
  parse(z.string().uuid(), req.params.id);
  res.json({ project: await getProject(req.user, req.params.id) });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const b = parse(
    z.object({
      clientId: z.string().uuid(),
      name: z.string().trim().min(1),
      description: z.string().nullish(),
      startDate: date.nullish(),
      endDate: date.nullish(),
    }),
    req.body,
  );
  const client = await query('SELECT name FROM clients WHERE id = $1', [b.clientId]);
  if (!client.rowCount) throw badRequest('Client not found');
  // The project owns the master Drive folder that every subfolder / upload lives under.
  const driveFolderId = driveConfigured() ? await createFolder(`${client.rows[0].name} — ${b.name}`) : null;
  const { rows } = await query(
    `INSERT INTO projects (client_id, name, description, start_date, end_date, drive_folder_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [b.clientId, b.name, b.description ?? null, b.startDate ?? null, b.endDate ?? null, driveFolderId, req.user.id],
  );
  res.status(201).json({ project: await getProject(req.user, rows[0].id) });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1).optional(),
      description: z.string().nullish(),
      startDate: date.nullish(),
      endDate: date.nullish(),
      status: z.enum(['active', 'completed', 'archived']).optional(),
    }),
    req.body,
  );
  const { rowCount } = await query(
    `UPDATE projects SET name = COALESCE($2, name),
            description = CASE WHEN $6 THEN $3 ELSE description END,
            start_date = CASE WHEN $7 THEN $4::date ELSE start_date END,
            end_date = CASE WHEN $8 THEN $5::date ELSE end_date END,
            status = COALESCE($9, status)
      WHERE id = $1`,
    [
      req.params.id,
      b.name ?? null,
      b.description ?? null,
      b.startDate ?? null,
      b.endDate ?? null,
      'description' in b,
      'startDate' in b,
      'endDate' in b,
      b.status ?? null,
    ],
  );
  if (!rowCount) throw notFound('Project not found');
  res.json({ project: await getProject(req.user, req.params.id) });
});

export default router;
