import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { serializeClient } from '../lib/serialize.js';

const router = Router();
router.use(requireRole('admin'));

const LIST = `SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count,
  COALESCE((SELECT array_agg(service_type_id::text) FROM client_service_types s WHERE s.client_id = c.id), '{}') AS service_type_ids
  FROM clients c`;

async function setServiceTypes(clientId, ids) {
  if (!ids) return;
  const { rows } = await query('SELECT id FROM service_types WHERE id = ANY($1::uuid[])', [ids]);
  if (rows.length !== new Set(ids).size) throw badRequest('Unknown service type');
  await query('DELETE FROM client_service_types WHERE client_id = $1', [clientId]);
  if (ids.length) {
    await query('INSERT INTO client_service_types (client_id, service_type_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [clientId, ids]);
  }
}

router.get('/', async (_req, res) => {
  const { rows } = await query(`${LIST} ORDER BY c.name`);
  res.json({ clients: rows.map(serializeClient) });
});

const schema = z.object({
  name: z.string().trim().min(1),
  company: z.string().trim().nullish(),
  email: z.string().trim().email().nullish().or(z.literal('')),
  phone: z.string().trim().nullish(),
  serviceTypeIds: z.array(z.string().uuid()).optional(),
});

router.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  const { rows: created } = await query('INSERT INTO clients (name, company, email, phone) VALUES ($1, $2, $3, $4) RETURNING id', [
    b.name,
    b.company || null,
    b.email || null,
    b.phone || null,
  ]);
  await setServiceTypes(created[0].id, b.serviceTypeIds);
  const { rows } = await query(`${LIST} WHERE c.id = $1`, [created[0].id]);
  res.status(201).json({ client: serializeClient(rows[0]) });
});

router.patch('/:id', async (req, res) => {
  const b = parse(schema.partial(), req.body);
  const { rowCount } = await query(
    `UPDATE clients SET name = COALESCE($2, name),
            company = CASE WHEN $6 THEN $3 ELSE company END,
            email = CASE WHEN $7 THEN $4 ELSE email END,
            phone = CASE WHEN $8 THEN $5 ELSE phone END
      WHERE id = $1`,
    [req.params.id, b.name ?? null, b.company || null, b.email || null, b.phone || null, 'company' in b, 'email' in b, 'phone' in b],
  );
  if (!rowCount) throw notFound('Client not found');
  await setServiceTypes(req.params.id, b.serviceTypeIds);
  const { rows } = await query(`${LIST} WHERE c.id = $1`, [req.params.id]);
  res.json({ client: serializeClient(rows[0]) });
});

export default router;
