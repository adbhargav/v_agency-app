import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';

const router = Router();
const uuid = z.string().uuid();
export const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url', 'file'];

export const serializeField = (f) => ({
  id: f.id,
  label: f.label,
  type: f.type,
  required: f.required,
  options: f.options ?? [],
  helpText: f.help_text ?? null,
  position: f.position,
});

/** Loads service types with their active fields (in form order). */
export async function loadServiceTypes({ ids, activeOnly = true, clientId } = {}) {
  const params = [];
  const where = [];
  if (activeOnly) where.push('st.is_active');
  if (ids) {
    params.push(ids);
    where.push(`st.id = ANY($${params.length}::uuid[])`);
  }
  // A client sees the services linked to them; with none linked, every active service is offered.
  if (clientId) {
    params.push(clientId);
    const p = `$${params.length}`;
    where.push(`(NOT EXISTS (SELECT 1 FROM client_service_types WHERE client_id = ${p})
                 OR st.id IN (SELECT service_type_id FROM client_service_types WHERE client_id = ${p}))`);
  }
  const { rows } = await query(
    `SELECT st.*,
            COALESCE((SELECT json_agg(f ORDER BY f.position) FROM service_fields f
                       WHERE f.service_type_id = st.id AND f.is_active), '[]') AS fields,
            (SELECT COUNT(*) FROM user_service_types u JOIN users x ON x.id = u.user_id
              WHERE u.service_type_id = st.id AND x.is_active)::int AS member_count,
            (SELECT COUNT(*) FROM requirements r WHERE r.service_type_id = st.id)::int AS requirement_count
       FROM service_types st
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY st.position, st.name`,
    params,
  );
  return rows.map((st) => ({
    id: st.id,
    name: st.name,
    description: st.description,
    color: st.color,
    isActive: st.is_active,
    position: st.position,
    fields: st.fields.map(serializeField),
    memberCount: st.member_count,
    requirementCount: st.requirement_count,
    createdAt: st.created_at,
  }));
}

async function getOne(id, activeOnly = false) {
  const [st] = await loadServiceTypes({ ids: [id], activeOnly });
  if (!st) throw notFound('Service type not found');
  return st;
}

router.get('/', async (req, res) => {
  const me = req.user;
  const includeInactive = me.role === 'admin' && req.query.includeInactive === 'true';
  const serviceTypes = await loadServiceTypes({
    activeOnly: !includeInactive,
    clientId: me.role === 'client' ? me.clientId : undefined,
  });
  // Clients and employees only need the form; team sizes and usage are admin information.
  if (me.role !== 'admin') {
    for (const st of serviceTypes) {
      delete st.memberCount;
      delete st.requirementCount;
    }
  }
  res.json({ serviceTypes });
});

router.get('/:id', async (req, res) => {
  parse(uuid, req.params.id);
  res.json({ serviceType: await getOne(req.params.id, req.user.role !== 'admin') });
});

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const fieldSchema = z
  .object({
    id: uuid.optional(),
    label: z.string().trim().min(1).max(120),
    type: z.enum(FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
    helpText: z.string().trim().max(300).nullish(),
  })
  .superRefine((f, ctx) => {
    if ((f.type === 'select' || f.type === 'multiselect') && f.options.length < 1) {
      ctx.addIssue({ code: 'custom', message: `"${f.label}" needs at least one option`, path: ['options'] });
    }
  });
const fieldsSchema = z.array(fieldSchema).max(40);

/** Replaces the form: listed fields are upserted in order, omitted ones are deactivated (kept for history). */
async function saveFields(db, serviceTypeId, fields) {
  const keep = [];
  for (const [position, f] of fields.entries()) {
    const options = f.type === 'select' || f.type === 'multiselect' ? f.options : [];
    if (f.id) {
      const { rowCount } = await db.query(
        `UPDATE service_fields SET label = $3, type = $4, required = $5, options = $6, help_text = $7, position = $8, is_active = true
          WHERE id = $1 AND service_type_id = $2`,
        [f.id, serviceTypeId, f.label, f.type, f.required, JSON.stringify(options), f.helpText ?? null, position],
      );
      if (!rowCount) throw badRequest(`Field ${f.id} does not belong to this service`);
      keep.push(f.id);
    } else {
      const { rows } = await db.query(
        `INSERT INTO service_fields (service_type_id, label, type, required, options, help_text, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [serviceTypeId, f.label, f.type, f.required, JSON.stringify(options), f.helpText ?? null, position],
      );
      keep.push(rows[0].id);
    }
  }
  await db.query('UPDATE service_fields SET is_active = false WHERE service_type_id = $1 AND NOT (id = ANY($2::uuid[]))', [
    serviceTypeId,
    keep,
  ]);
}

router.post('/', requireRole('admin'), async (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1).max(80),
      description: z.string().trim().max(500).nullish(),
      color: color.optional(),
      fields: fieldsSchema.default([]),
    }),
    req.body,
  );
  const id = await withTransaction(async (db) => {
    let rows;
    try {
      ({ rows } = await db.query(
        `INSERT INTO service_types (name, description, color, position)
         VALUES ($1, $2, COALESCE($3, '#df2f25'), (SELECT COALESCE(MAX(position), -1) + 1 FROM service_types)) RETURNING id`,
        [b.name, b.description ?? null, b.color ?? null],
      ));
    } catch (err) {
      if (err.code === '23505') throw conflict('A service with this name already exists');
      throw err;
    }
    await saveFields(db, rows[0].id, b.fields);
    return rows[0].id;
  });
  res.status(201).json({ serviceType: await getOne(id) });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      description: z.string().trim().max(500).nullish(),
      color: color.optional(),
      isActive: z.boolean().optional(),
      position: z.number().int().min(0).optional(),
    }),
    req.body,
  );
  try {
    const { rowCount } = await query(
      `UPDATE service_types SET name = COALESCE($2, name),
              description = CASE WHEN $3 THEN $4 ELSE description END,
              color = COALESCE($5, color), is_active = COALESCE($6, is_active), position = COALESCE($7, position)
        WHERE id = $1`,
      [id, b.name ?? null, 'description' in b, b.description ?? null, b.color ?? null, b.isActive ?? null, b.position ?? null],
    );
    if (!rowCount) throw notFound('Service type not found');
  } catch (err) {
    if (err.code === '23505') throw conflict('A service with this name already exists');
    throw err;
  }
  res.json({ serviceType: await getOne(id) });
});

router.put('/:id/fields', requireRole('admin'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { fields } = parse(z.object({ fields: fieldsSchema }), req.body);
  await getOne(id);
  await withTransaction((db) => saveFields(db, id, fields));
  res.json({ serviceType: await getOne(id) });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const st = await getOne(id);
  if (st.requirementCount) throw conflict('This service has requirements; deactivate it instead');
  await query('DELETE FROM service_types WHERE id = $1', [id]);
  res.json({ ok: true });
});

export default router;
