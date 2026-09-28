import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { csv, parse } from '../lib/validate.js';
import { serializeFile } from '../lib/serialize.js';
import { firstStatusId, getTask, listTasks, moveToMaster } from '../services/tasks.js';
import { adminIds, clientUserIds, notify } from '../services/notify.js';
import { syncTaskEvent } from '../services/calendar.js';
import { loadServiceTypes } from './serviceTypes.js';

const router = Router();
const uuid = z.string().uuid();
const priority = z.enum(['very_urgent', 'high', 'medium', 'low']);

router.param('id', (_req, _res, next, id) => {
  if (!uuid.safeParse(id).success) throw notFound('Requirement not found');
  next();
});

// ---------------------------------------------------------------- answers

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Validates answers against the service's form and returns them normalised, keyed by field id.
 * File fields hold arrays of already-uploaded file ids; they are linked to the requirement afterwards.
 */
export function validateAnswers(fields, answers) {
  const out = {};
  const errors = [];
  for (const f of fields) {
    const v = answers?.[f.id];
    if (isEmpty(v) || (f.type === 'checkbox' && v === false && f.required)) {
      if (f.required) errors.push(`${f.label} is required`);
      continue;
    }
    const fail = (msg) => errors.push(`${f.label}: ${msg}`);
    switch (f.type) {
      case 'text':
      case 'textarea':
        if (typeof v !== 'string' || v.length > 10000) fail('must be text');
        else out[f.id] = v.trim();
        break;
      case 'number': {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) fail('must be a number');
        else out[f.id] = n;
        break;
      }
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('must be a date (YYYY-MM-DD)');
        else out[f.id] = v;
        break;
      case 'select':
        if (!f.options.includes(v)) fail('choose one of the options');
        else out[f.id] = v;
        break;
      case 'multiselect':
        if (!Array.isArray(v) || !v.every((x) => f.options.includes(x))) fail('choose from the options');
        else out[f.id] = [...new Set(v)];
        break;
      case 'checkbox':
        if (typeof v !== 'boolean') fail('must be yes or no');
        else out[f.id] = v;
        break;
      case 'url':
        if (typeof v !== 'string' || !z.string().url().safeParse(v).success || !/^https?:\/\//i.test(v)) fail('must be a valid link');
        else out[f.id] = v;
        break;
      case 'file':
        if (!Array.isArray(v) || !v.every((x) => uuid.safeParse(x).success) || v.length > 20) fail('invalid files');
        else out[f.id] = [...new Set(v)];
        break;
      default:
        fail('unsupported field');
    }
  }
  if (errors.length) throw badRequest(errors.join('; '), errors);
  return out;
}

// ---------------------------------------------------------------- reads

function visibility(viewer, params) {
  if (viewer.role === 'admin') return 'TRUE';
  params.push(viewer.role === 'client' ? viewer.clientId : viewer.id);
  const p = `$${params.length}`;
  return viewer.role === 'client'
    ? `r.client_id = ${p}`
    : // Employees see a brief only through a task on it that is assigned to them.
      `EXISTS (SELECT 1 FROM tasks x WHERE x.requirement_id = r.id AND x.assignee_id = ${p})`;
}

const SELECT = `
  SELECT r.*, c.name AS client_name, p.name AS project_name,
         st.name AS service_type_name, st.color AS service_type_color,
         u.name AS submitted_by_name,
         s.task_count, s.done_count, s.progress
    FROM requirements r
    JOIN clients c ON c.id = r.client_id
    JOIN projects p ON p.id = r.project_id
    JOIN service_types st ON st.id = r.service_type_id
    LEFT JOIN users u ON u.id = r.submitted_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS task_count,
             COUNT(*) FILTER (WHERE ms.is_done)::int AS done_count,
             COALESCE(ROUND(AVG(CASE WHEN ms.is_done THEN 100 ELSE t.percent_done END)), 0)::int AS progress
        FROM tasks t JOIN master_statuses ms ON ms.id = t.master_status_id
       WHERE t.requirement_id = r.id
    ) s ON true`;

function displayStatus(r) {
  if (r.status === 'declined') return 'declined';
  if (r.status === 'new') return 'new';
  return r.task_count > 0 && r.done_count === r.task_count ? 'completed' : 'in_progress';
}

function serializeRequirement(r, viewer, filesById = new Map()) {
  const answers = (r.field_snapshot ?? []).map((f) => {
    const value = r.answers?.[f.id] ?? null;
    const entry = { fieldId: f.id, label: f.label, type: f.type, value };
    if (f.type === 'file') entry.files = (Array.isArray(value) ? value : []).map((id) => filesById.get(id)).filter(Boolean);
    return entry;
  });
  return {
    id: r.id,
    title: r.title,
    clientId: r.client_id,
    clientName: r.client_name,
    projectId: r.project_id,
    projectName: r.project_name,
    serviceType: { id: r.service_type_id, name: r.service_type_name, color: r.service_type_color },
    priority: r.priority,
    desiredDate: r.desired_date,
    status: r.status,
    displayStatus: displayStatus(r),
    declineReason: r.decline_reason,
    answers,
    files: [...filesById.values()],
    taskCount: r.task_count ?? 0,
    doneCount: r.done_count ?? 0,
    progress: r.progress ?? 0,
    submittedBy: viewer.role === 'client' ? undefined : r.submitted_by ? { id: r.submitted_by, name: r.submitted_by_name } : null,
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  };
}

async function filesFor(requirementIds, viewer) {
  if (!requirementIds.length) return new Map();
  const { rows } = await query(
    `SELECT f.*, u.name AS uploaded_by_name FROM files f LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.requirement_id = ANY($1::uuid[]) ORDER BY f.created_at`,
    [requirementIds],
  );
  const byReq = new Map();
  for (const f of rows) {
    if (!byReq.has(f.requirement_id)) byReq.set(f.requirement_id, new Map());
    byReq.get(f.requirement_id).set(f.id, serializeFile(f, viewer));
  }
  return byReq;
}

async function loadRequirement(viewer, id) {
  const params = [id];
  const { rows } = await query(`${SELECT} WHERE r.id = $1 AND ${visibility(viewer, params)}`, params);
  if (!rows[0]) throw notFound('Requirement not found');
  return rows[0];
}

router.get('/', async (req, res) => {
  const me = req.user;
  const f = parse(
    z.object({
      statuses: z.array(z.enum(['new', 'accepted', 'declined'])).optional(),
      serviceTypeIds: z.array(uuid).optional(),
      clientIds: z.array(uuid).optional(),
      projectIds: z.array(uuid).optional(),
    }),
    {
      statuses: csv(req.query.statuses),
      serviceTypeIds: csv(req.query.serviceTypeIds),
      clientIds: csv(req.query.clientIds),
      projectIds: csv(req.query.projectIds),
    },
  );
  const params = [];
  const where = [visibility(me, params)];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.statuses) add('r.status::text = ANY(?::text[])', f.statuses);
  if (f.serviceTypeIds) add('r.service_type_id = ANY(?::uuid[])', f.serviceTypeIds);
  if (f.clientIds) add('r.client_id = ANY(?::uuid[])', f.clientIds);
  if (f.projectIds) add('r.project_id = ANY(?::uuid[])', f.projectIds);
  const { rows } = await query(
    `${SELECT} WHERE ${where.join(' AND ')}
      ORDER BY (r.status = 'new') DESC, r.created_at DESC LIMIT 500`,
    params,
  );
  const files = await filesFor(rows.map((r) => r.id), me);
  res.json({ requirements: rows.map((r) => serializeRequirement(r, me, files.get(r.id))) });
});

router.get('/:id', async (req, res) => {
  const me = req.user;
  const r = await loadRequirement(me, req.params.id);
  const files = await filesFor([r.id], me);
  // Linked tasks through the normal task visibility rules: employees only see their own,
  // clients get the client-safe shape without assignees or time.
  const tasks = await listTasks(me, { requirementIds: [r.id] });
  res.json({ requirement: { ...serializeRequirement(r, me, files.get(r.id)), tasks } });
});

// ---------------------------------------------------------------- client submission

router.post('/', requireRole('client', 'admin'), async (req, res) => {
  const me = req.user;
  const b = parse(
    z.object({
      clientId: uuid.optional(),
      projectId: uuid,
      serviceTypeId: uuid,
      title: z.string().trim().min(1).max(200),
      priority: priority.default('medium'),
      desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      answers: z.record(z.string(), z.unknown()).default({}),
    }),
    req.body,
  );
  const clientId = me.role === 'client' ? me.clientId : b.clientId;
  if (!clientId) throw badRequest('clientId is required');

  const { rows: proj } = await query('SELECT id, name FROM projects WHERE id = $1 AND client_id = $2', [b.projectId, clientId]);
  if (!proj[0]) throw badRequest('Project not found for this client');
  const [serviceType] = await loadServiceTypes({ ids: [b.serviceTypeId], clientId });
  if (!serviceType) throw badRequest('This service is not available');

  const answers = validateAnswers(serviceType.fields, b.answers);
  const snapshot = serviceType.fields.map((f) => ({ id: f.id, label: f.label, type: f.type }));

  const id = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO requirements (client_id, project_id, service_type_id, title, answers, field_snapshot, priority, desired_date, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [clientId, b.projectId, b.serviceTypeId, b.title, JSON.stringify(answers), JSON.stringify(snapshot), b.priority, b.desiredDate ?? null, me.id],
    );
    const reqId = rows[0].id;
    // Link the reference files (images, videos, docs) the client uploaded for each file field.
    for (const f of serviceType.fields.filter((x) => x.type === 'file')) {
      const ids = answers[f.id];
      if (!ids?.length) continue;
      const { rowCount } = await db.query(
        `UPDATE files SET requirement_id = $1, requirement_field_id = $2
          WHERE id = ANY($3::uuid[]) AND project_id = $4 AND uploaded_by = $5
            AND requirement_id IS NULL AND comment_id IS NULL`,
        [reqId, f.id, ids, b.projectId, me.id],
      );
      if (rowCount !== ids.length) throw badRequest(`${f.label}: one or more files cannot be attached`);
    }
    return reqId;
  });

  await notify(await adminIds(), {
    type: 'requirement_submitted',
    title: `New ${serviceType.name} requirement: ${b.title}`,
    body: `${proj[0].name} — a new requirement was submitted and is waiting for review.`,
    projectId: b.projectId,
    email: true,
    ctaLabel: 'Review requirement',
  });
  const r = await loadRequirement(me, id);
  const files = await filesFor([id], me);
  res.status(201).json({ requirement: serializeRequirement(r, me, files.get(id)) });
});

// ---------------------------------------------------------------- admin review

router.post('/:id/tasks', requireRole('admin'), async (req, res) => {
  const me = req.user;
  const b = parse(
    z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().nullish(),
      assigneeId: uuid.nullish(),
      dueDate: z.string().datetime({ offset: true }).nullish(),
      priority: priority.optional(),
    }),
    req.body,
  );
  const r = await loadRequirement(me, req.params.id);
  if (r.status === 'declined') throw conflict('This requirement was declined');
  if (b.assigneeId) {
    const { rowCount } = await query(`SELECT 1 FROM users WHERE id = $1 AND role = 'employee' AND is_active`, [b.assigneeId]);
    if (!rowCount) throw badRequest('Assignee must be an active employee');
  }
  const firstAcceptance = r.status === 'new';
  const taskId = await withTransaction(async (db) => {
    const masterStatusId = await firstStatusId(db);
    const { rows } = await db.query(
      `INSERT INTO tasks (project_id, title, description, due_date, priority, master_status_id, assignee_id, created_by, service_type_id, requirement_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [r.project_id, b.title, b.description ?? null, b.dueDate ?? null, b.priority ?? r.priority, masterStatusId, b.assigneeId ?? null, me.id, r.service_type_id, r.id],
    );
    if (b.assigneeId) await moveToMaster(db, { id: rows[0].id }, masterStatusId);
    await db.query(
      `UPDATE requirements SET status = 'accepted', reviewed_by = COALESCE(reviewed_by, $2), reviewed_at = COALESCE(reviewed_at, now()) WHERE id = $1`,
      [r.id, me.id],
    );
    return rows[0].id;
  });

  const task = await getTask(me, taskId);
  if (b.assigneeId) {
    await notify([b.assigneeId], {
      type: 'task_assigned',
      title: `New task: ${task.title}`,
      body: `You were assigned "${task.title}" from the client requirement "${r.title}". Open the task to see the full brief and reference files.`,
      taskId,
      projectId: r.project_id,
      priority: task.priority === 'very_urgent' ? 'high' : 'normal',
    });
  }
  if (firstAcceptance) {
    await notify(await clientUserIds(r.client_id), {
      type: 'requirement_accepted',
      title: `Requirement accepted: ${r.title}`,
      body: 'Our team has accepted your requirement and started working on it.',
      projectId: r.project_id,
      email: true,
    });
  }
  syncTaskEvent(taskId);
  res.status(201).json({ task });
});

router.post('/:id/decline', requireRole('admin'), async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(1, 'A reason is required').max(2000) }), req.body ?? {});
  const r = await loadRequirement(req.user, req.params.id);
  if (r.status !== 'new') throw conflict('Only new requirements can be declined');
  await query(
    `UPDATE requirements SET status = 'declined', decline_reason = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1`,
    [r.id, reason, req.user.id],
  );
  await notify(await clientUserIds(r.client_id), {
    type: 'requirement_declined',
    title: `Requirement needs changes: ${r.title}`,
    body: reason,
    projectId: r.project_id,
    email: true,
  });
  const updated = await loadRequirement(req.user, r.id);
  const files = await filesFor([r.id], req.user);
  res.json({ requirement: serializeRequirement(updated, req.user, files.get(r.id)) });
});

export default router;
