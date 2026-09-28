import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { serializeUser } from '../lib/serialize.js';

const WITH_SERVICES = `SELECT u.*, COALESCE((SELECT array_agg(service_type_id::text) FROM user_service_types s WHERE s.user_id = u.id), '{}') AS service_type_ids FROM users u`;

async function loadUser(id) {
  const { rows } = await query(`${WITH_SERVICES} WHERE u.id = $1`, [id]);
  return rows[0];
}

async function setServiceTypes(userId, ids) {
  if (!ids) return;
  const { rows } = await query('SELECT id FROM service_types WHERE id = ANY($1::uuid[])', [ids]);
  if (rows.length !== new Set(ids).size) throw badRequest('Unknown service type');
  await query('DELETE FROM user_service_types WHERE user_id = $1', [userId]);
  if (ids.length) {
    await query('INSERT INTO user_service_types (user_id, service_type_id) SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING', [userId, ids]);
  }
}

const router = Router();
router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  const role = parse(z.enum(['admin', 'employee', 'client']).optional(), req.query.role);
  const serviceTypeId = parse(z.string().uuid().optional(), req.query.serviceTypeId || undefined);
  const { rows } = await query(
    `${WITH_SERVICES} WHERE ($1::user_role IS NULL OR u.role = $1)
       AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM user_service_types s WHERE s.user_id = u.id AND s.service_type_id = $2))
     ORDER BY u.is_active DESC, u.name`,
    [role ?? null, serviceTypeId ?? null],
  );
  res.json({ users: rows.map(serializeUser) });
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'employee', 'client']),
  employmentType: z.enum(['project_based', 'salary_based']).optional(),
  clientId: z.string().uuid().optional(),
  serviceTypeIds: z.array(z.string().uuid()).optional(),
});

router.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  if (body.role === 'employee' && !body.employmentType) throw badRequest('employmentType is required for employees');
  if (body.role === 'client' && !body.clientId) throw badRequest('clientId is required for client users');
  if (body.role === 'client') {
    const { rowCount } = await query('SELECT 1 FROM clients WHERE id = $1', [body.clientId]);
    if (!rowCount) throw badRequest('Client not found');
  }
  const exists = await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [body.email]);
  if (exists.rowCount) throw conflict('A user with this email already exists');
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, employment_type, client_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      body.name,
      body.email,
      await bcrypt.hash(body.password, 10),
      body.role,
      body.role === 'employee' ? body.employmentType : null,
      body.role === 'client' ? body.clientId : null,
    ],
  );
  if (body.role === 'employee') await setServiceTypes(rows[0].id, body.serviceTypeIds);
  res.status(201).json({ user: serializeUser(await loadUser(rows[0].id)) });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  employmentType: z.enum(['project_based', 'salary_based']).optional(),
  isActive: z.boolean().optional(),
  clientId: z.string().uuid().optional(),
  password: z.string().min(8).optional(),
  serviceTypeIds: z.array(z.string().uuid()).optional(),
});

router.patch('/:id', async (req, res) => {
  const body = parse(updateSchema, req.body);
  const { rows: found } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  const user = found[0];
  if (!user) throw notFound('User not found');
  if (body.employmentType && user.role !== 'employee') throw badRequest('Only employees have an employment type');
  if (body.clientId && user.role !== 'client') throw badRequest('Only client users belong to a client');
  if (body.isActive === false && user.id === req.user.id) throw badRequest('You cannot deactivate yourself');
  if (body.serviceTypeIds && user.role !== 'employee') throw badRequest('Only employees belong to service teams');
  const { rows } = await query(
    `UPDATE users SET name = COALESCE($2, name), employment_type = COALESCE($3, employment_type),
            is_active = COALESCE($4, is_active), client_id = COALESCE($5, client_id),
            password_hash = COALESCE($6, password_hash)
      WHERE id = $1 RETURNING *`,
    [
      user.id,
      body.name ?? null,
      body.employmentType ?? null,
      body.isActive ?? null,
      body.clientId ?? null,
      body.password ? await bcrypt.hash(body.password, 10) : null,
    ],
  );
  await setServiceTypes(rows[0].id, body.serviceTypeIds);
  res.json({ user: serializeUser(await loadUser(rows[0].id)) });
});

export default router;
