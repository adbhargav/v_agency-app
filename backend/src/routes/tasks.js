import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { csv, parse } from '../lib/validate.js';
import { serializeFile } from '../lib/serialize.js';
import { firstStatusId, getTask, listTasks, loadTaskRow, moveToMaster } from '../services/tasks.js';
import { adminIds, clientUserIds, notify } from '../services/notify.js';
import { syncTaskEvent } from '../services/calendar.js';

const router = Router();
const uuid = z.string().uuid();
const priority = z.enum(['very_urgent', 'high', 'medium', 'low']);
const PRIORITY_LABEL = { very_urgent: 'Very Urgent', high: 'High', medium: 'Medium', low: 'Low' };

router.param('id', (req, _res, next, id) => {
  if (!uuid.safeParse(id).success) throw notFound('Task not found');
  next();
});

// ---------------------------------------------------------------- listing

const listQuery = z.object({
  assigneeIds: z.array(uuid).optional(),
  clientIds: z.array(uuid).optional(),
  projectIds: z.array(uuid).optional(),
  masterStatusIds: z.array(uuid).optional(),
  serviceTypeIds: z.array(uuid).optional(),
  requirementIds: z.array(uuid).optional(),
  priorities: z.array(priority).optional(),
  approvalStates: z.array(z.enum(['none', 'internal_review', 'client_review', 'approved', 'revision_requested'])).optional(),
  due: z.enum(['overdue', 'today', 'week']).optional(),
  search: z.string().trim().min(1).optional(),
  includeDone: z.boolean().optional(),
});

router.get('/', async (req, res) => {
  const q = req.query;
  const filters = parse(listQuery, {
    assigneeIds: csv(q.assigneeIds),
    clientIds: csv(q.clientIds),
    projectIds: csv(q.projectIds),
    masterStatusIds: csv(q.masterStatusIds),
    serviceTypeIds: csv(q.serviceTypeIds),
    requirementIds: csv(q.requirementIds),
    priorities: csv(q.priorities),
    approvalStates: csv(q.approvalStates),
    due: q.due || undefined,
    search: q.search || undefined,
    includeDone: q.includeDone === undefined ? undefined : q.includeDone !== 'false',
  });
  // Master status ids are an internal concept; clients filter by project only.
  if (req.user.role === 'client') delete filters.masterStatusIds;
  res.json({ tasks: await listTasks(req.user, filters) });
});

router.get('/:id', async (req, res) => {
  res.json({ task: await getTask(req.user, req.params.id) });
});

// ---------------------------------------------------------------- helpers

async function assertAssignableEmployee(userId, db = { query }) {
  const { rows } = await db.query(`SELECT id FROM users WHERE id = $1 AND role = 'employee' AND is_active`, [userId]);
  if (!rows[0]) throw badRequest('Assignee must be an active employee');
}

async function customStatusFor(userId, customStatusId, db = { query }) {
  const { rows } = await db.query('SELECT * FROM custom_statuses WHERE id = $1 AND user_id = $2', [customStatusId, userId]);
  if (!rows[0]) throw badRequest('customStatusId does not belong to you');
  return rows[0];
}

async function assertMasterStatus(id, db = { query }) {
  const { rowCount } = await db.query('SELECT 1 FROM master_statuses WHERE id = $1', [id]);
  if (!rowCount) throw badRequest('masterStatusId does not exist');
}

async function assertServiceType(id) {
  const { rowCount } = await query('SELECT 1 FROM service_types WHERE id = $1', [id]);
  if (!rowCount) throw badRequest('serviceTypeId does not exist');
}

async function statusByName(db, name) {
  const { rows } = await db.query('SELECT id FROM master_statuses WHERE lower(name) = lower($1) LIMIT 1', [name]);
  return rows[0]?.id ?? null;
}

async function statusDone(db) {
  const { rows } = await db.query('SELECT id FROM master_statuses WHERE is_done ORDER BY position LIMIT 1');
  return rows[0]?.id ?? null;
}

/** Links already-uploaded files (owned by the requester, same project) to a comment. */
async function attachFiles(db, { fileIds, task, commentId, userId }) {
  if (!fileIds?.length) return;
  const { rowCount } = await db.query(
    `UPDATE files SET comment_id = $1, task_id = $2
      WHERE id = ANY($3::uuid[]) AND project_id = $4 AND uploaded_by = $5 AND comment_id IS NULL`,
    [commentId, task.id, fileIds, task.project_id, userId],
  );
  if (rowCount !== new Set(fileIds).size) throw badRequest('One or more files cannot be attached');
}

async function addComment(db, { task, user, kind, body, isInternal, fileIds }) {
  const { rows } = await db.query(
    `INSERT INTO task_comments (task_id, author_id, kind, body, is_internal) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [task.id, user.id, kind, body, isInternal],
  );
  await attachFiles(db, { fileIds, task, commentId: rows[0].id, userId: user.id });
  return rows[0].id;
}

// ---------------------------------------------------------------- create / update / delete

const createSchema = z.object({
  projectId: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().nullish(),
  dueDate: z.string().datetime({ offset: true }).nullish(),
  priority,
  assigneeId: uuid.nullish(),
  masterStatusId: uuid.optional(),
  customStatusId: uuid.optional(),
  serviceTypeId: uuid.nullish(),
});

router.post('/', requireRole('admin', 'employee'), async (req, res) => {
  const b = parse(createSchema, req.body);
  const me = req.user;
  let assigneeId = b.assigneeId ?? null;
  if (me.role === 'employee') {
    // Employees add tasks only inside projects they already work on, and only for themselves.
    const { rowCount } = await query('SELECT 1 FROM tasks WHERE project_id = $1 AND assignee_id = $2 LIMIT 1', [b.projectId, me.id]);
    if (!rowCount) throw forbidden('You can only create tasks in projects you are assigned to');
    assigneeId = me.id;
  } else {
    const { rowCount } = await query('SELECT 1 FROM projects WHERE id = $1', [b.projectId]);
    if (!rowCount) throw badRequest('Project not found');
    if (assigneeId) await assertAssignableEmployee(assigneeId);
  }

  let masterStatusId = b.masterStatusId;
  let customStatusId = null;
  if (b.customStatusId) {
    if (assigneeId !== me.id) throw badRequest('customStatusId can only be set by the assignee');
    const cs = await customStatusFor(me.id, b.customStatusId);
    customStatusId = cs.id;
    masterStatusId = cs.master_status_id;
  }
  if (masterStatusId) await assertMasterStatus(masterStatusId);
  masterStatusId ??= await firstStatusId();
  if (b.serviceTypeId) await assertServiceType(b.serviceTypeId);

  const { rows } = await query(
    `INSERT INTO tasks (project_id, title, description, due_date, priority, master_status_id, custom_status_id, assignee_id, created_by, service_type_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [b.projectId, b.title, b.description ?? null, b.dueDate ?? null, b.priority, masterStatusId, customStatusId, assigneeId, me.id, b.serviceTypeId ?? null],
  );
  const id = rows[0].id;
  if (customStatusId === null && assigneeId) await moveToMaster({ query }, { id }, masterStatusId);
  const task = await getTask(me, id);
  if (assigneeId && assigneeId !== me.id) {
    await notify([assigneeId], {
      type: 'task_assigned',
      title: `New task: ${task.title}`,
      body: `You were assigned "${task.title}" in ${task.projectName} (priority: ${PRIORITY_LABEL[task.priority]}).`,
      taskId: id,
      projectId: task.projectId,
      priority: task.priority === 'very_urgent' ? 'high' : 'normal',
    });
  }
  syncTaskEvent(id);
  res.status(201).json({ task });
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().nullish(),
  dueDate: z.string().datetime({ offset: true }).nullish(),
  priority: priority.optional(),
  assigneeId: uuid.nullish(),
  percentDone: z.number().int().min(0).max(100).optional(),
  masterStatusId: uuid.optional(),
  customStatusId: uuid.optional(),
  serviceTypeId: uuid.nullish(),
});

router.patch('/:id', requireRole('admin', 'employee'), async (req, res) => {
  const b = parse(updateSchema, req.body);
  const me = req.user;
  const current = await loadTaskRow(me, req.params.id);
  if ('assigneeId' in b && me.role !== 'admin') throw forbidden('Only managers can reassign tasks');
  if (b.assigneeId) await assertAssignableEmployee(b.assigneeId);

  const reassigned = 'assigneeId' in b && (b.assigneeId ?? null) !== current.assignee_id;
  const sets = [];
  const params = [current.id];
  const set = (col, value) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };
  if (b.title !== undefined) set('title', b.title);
  if ('description' in b) set('description', b.description ?? null);
  if ('dueDate' in b) {
    set('due_date', b.dueDate ?? null);
    // A new future deadline re-arms the missed-deadline alert.
    if (!b.dueDate || new Date(b.dueDate) > new Date()) sets.push('deadline_alert_sent_at = NULL');
  }
  if (b.priority) set('priority', b.priority);
  if (b.percentDone !== undefined) set('percent_done', b.percentDone);
  if ('serviceTypeId' in b) {
    if (me.role !== 'admin') throw forbidden('Only managers can change the service type');
    if (b.serviceTypeId) await assertServiceType(b.serviceTypeId);
    set('service_type_id', b.serviceTypeId ?? null);
  }
  if (reassigned) {
    set('assignee_id', b.assigneeId ?? null);
    sets.push('custom_status_id = NULL');
  }

  let targetMaster = null;
  if (b.customStatusId) {
    if (current.assignee_id !== me.id || reassigned) throw badRequest('customStatusId can only be set by the assignee');
    const cs = await customStatusFor(me.id, b.customStatusId);
    set('custom_status_id', cs.id);
    set('master_status_id', cs.master_status_id);
  } else if (b.masterStatusId) {
    await assertMasterStatus(b.masterStatusId);
    targetMaster = b.masterStatusId;
  }

  await withTransaction(async (db) => {
    if (sets.length) await db.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1`, params);
    if (targetMaster) await moveToMaster(db, current, targetMaster);
    else if (reassigned) await moveToMaster(db, current, current.master_status_id);
  });

  const task = await getTask(me, current.id);
  if (reassigned && b.assigneeId) {
    await notify([b.assigneeId], {
      type: 'task_assigned',
      title: `New task: ${task.title}`,
      body: `You were assigned "${task.title}" in ${task.projectName}.`,
      taskId: task.id,
      projectId: task.projectId,
    });
  }
  syncTaskEvent(task.id);
  res.json({ task });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const current = await loadTaskRow(req.user, req.params.id);
  // Clear the due date first so the calendar sync removes the assignee's event.
  await query('UPDATE tasks SET due_date = NULL WHERE id = $1', [current.id]);
  await syncTaskEvent(current.id);
  await query('DELETE FROM tasks WHERE id = $1', [current.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- approval pipeline

const optionalComment = z.object({ comment: z.string().trim().max(5000).optional() });

router.post('/:id/submit', requireRole('employee', 'admin'), async (req, res) => {
  const { comment } = parse(optionalComment, req.body ?? {});
  const task = await loadTaskRow(req.user, req.params.id);
  if (task.assignee_id !== req.user.id) throw forbidden('Only the assignee can submit this task');
  if (!['none', 'revision_requested'].includes(task.approval_state)) throw conflict(`Task is already ${task.approval_state}`);
  await withTransaction(async (db) => {
    await db.query(`UPDATE tasks SET approval_state = 'internal_review' WHERE id = $1`, [task.id]);
    await moveToMaster(db, task, await statusByName(db, 'Review'));
    await addComment(db, { task, user: req.user, kind: 'submission', body: comment || 'Submitted for internal review.', isInternal: true });
  });
  await notify(await adminIds(), {
    type: 'review_requested',
    title: `Ready for review: ${task.title}`,
    body: `${req.user.name} submitted "${task.title}" (${task.project_name}) for internal review.`,
    taskId: task.id,
    projectId: task.project_id,
  });
  res.json({ task: await getTask(req.user, task.id) });
});

router.post('/:id/approve', requireRole('admin', 'client'), async (req, res) => {
  const { comment } = parse(optionalComment, req.body ?? {});
  const me = req.user;
  const task = await loadTaskRow(me, req.params.id);

  if (me.role === 'admin') {
    // Manager approval: internal review passes and the work goes to the client panel.
    if (task.approval_state !== 'internal_review') throw conflict('Only tasks in internal review can be sent to the client');
    await withTransaction(async (db) => {
      await db.query(`UPDATE tasks SET approval_state = 'client_review' WHERE id = $1`, [task.id]);
      await addComment(db, { task, user: me, kind: 'sent_to_client', body: comment || 'This is ready for your review and approval.', isInternal: false });
    });
    await notify(await clientUserIds(task.client_id), {
      type: 'client_approval_requested',
      title: `Approval needed: ${task.title}`,
      body: `"${task.title}" in your project ${task.project_name} is ready for your review. Please approve it or request a revision.`,
      taskId: task.id,
      projectId: task.project_id,
      email: true,
      ctaLabel: 'Review now',
    });
    await notify([task.assignee_id], {
      type: 'sent_to_client',
      title: `Approved internally: ${task.title}`,
      body: 'Your manager approved the task and sent it to the client.',
      taskId: task.id,
      projectId: task.project_id,
    });
  } else {
    // Client final approval: the task is done.
    if (task.approval_state !== 'client_review') throw conflict('This task is not awaiting your approval');
    await withTransaction(async (db) => {
      await db.query(`UPDATE tasks SET approval_state = 'approved', percent_done = 100 WHERE id = $1`, [task.id]);
      await moveToMaster(db, task, await statusDone(db));
      await addComment(db, { task, user: me, kind: 'approval', body: comment || 'Approved.', isInternal: false });
    });
    await notify([task.assignee_id, ...(await adminIds())], {
      type: 'client_approved',
      title: `Client approved: ${task.title}`,
      body: `The client approved "${task.title}" (${task.project_name}).`,
      taskId: task.id,
      projectId: task.project_id,
    });
  }
  res.json({ task: await getTask(me, task.id) });
});

router.post('/:id/request-revision', requireRole('admin', 'client'), async (req, res) => {
  const b = parse(
    z.object({ comment: z.string().trim().min(1, 'A comment explaining the revision is required').max(5000), fileIds: z.array(uuid).max(20).optional() }),
    req.body ?? {},
  );
  const me = req.user;
  const task = await loadTaskRow(me, req.params.id);
  const allowed = me.role === 'client' ? ['client_review'] : ['internal_review', 'client_review', 'approved'];
  if (!allowed.includes(task.approval_state)) throw conflict('A revision cannot be requested for this task right now');

  await withTransaction(async (db) => {
    await db.query(`UPDATE tasks SET approval_state = 'revision_requested' WHERE id = $1`, [task.id]);
    if (task.master_is_done || task.approval_state === 'internal_review' || task.approval_state === 'client_review') {
      await moveToMaster(db, task, (await statusByName(db, 'In Progress')) ?? (await firstStatusId(db)));
    }
    await addComment(db, {
      task,
      user: me,
      kind: 'revision_request',
      body: b.comment,
      // Client feedback is part of the client thread; manager feedback stays internal.
      isInternal: me.role !== 'client',
      fileIds: b.fileIds,
    });
  });

  const who = me.role === 'client' ? 'The client' : me.name;
  const recipients = me.role === 'client' ? [task.assignee_id, ...(await adminIds())] : [task.assignee_id];
  await notify(recipients, {
    type: 'revision_requested',
    title: `Revision requested: ${task.title}`,
    body: `${who} requested a revision: "${b.comment}"`,
    taskId: task.id,
    projectId: task.project_id,
    priority: 'high',
    email: true,
    ctaLabel: 'Open task',
  });
  res.json({ task: await getTask(me, task.id) });
});

// ---------------------------------------------------------------- comments

router.get('/:id/comments', async (req, res) => {
  const me = req.user;
  const task = await loadTaskRow(me, req.params.id);
  const isClient = me.role === 'client';
  const { rows: comments } = await query(
    `SELECT tc.*, u.name AS author_name, u.role AS author_role
       FROM task_comments tc LEFT JOIN users u ON u.id = tc.author_id
      WHERE tc.task_id = $1 ${isClient ? 'AND NOT tc.is_internal' : ''}
      ORDER BY tc.created_at`,
    [task.id],
  );
  const { rows: files } = await query(
    `SELECT f.*, u.name AS uploaded_by_name, u.role AS uploader_role
       FROM files f LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.comment_id = ANY($1::uuid[])`,
    [comments.map((c) => c.id)],
  );
  const filesBy = new Map();
  for (const f of files) {
    // Clients never see drafts: only final deliverables or files they uploaded themselves.
    if (isClient && !f.is_final && f.uploader_role !== 'client') continue;
    if (!filesBy.has(f.comment_id)) filesBy.set(f.comment_id, []);
    filesBy.get(f.comment_id).push(serializeFile(f, me));
  }
  res.json({
    comments: comments.map((c) => {
      const hideAuthor = isClient && c.author_role !== 'client';
      return {
        id: c.id,
        taskId: c.task_id,
        kind: c.kind,
        body: c.body,
        isInternal: c.is_internal,
        author: hideAuthor
          ? { id: null, name: 'V Agency', role: 'agency' }
          : { id: c.author_id, name: c.author_name ?? 'Deleted user', role: c.author_role ?? null },
        files: filesBy.get(c.id) ?? [],
        createdAt: c.created_at,
      };
    }),
  });
});

router.post('/:id/comments', async (req, res) => {
  const b = parse(z.object({ body: z.string().trim().min(1).max(5000), fileIds: z.array(uuid).max(20).optional() }), req.body ?? {});
  const me = req.user;
  const task = await loadTaskRow(me, req.params.id);
  const isInternal = me.role !== 'client';
  const commentId = await withTransaction((db) =>
    addComment(db, { task, user: me, kind: 'comment', body: b.body, isInternal, fileIds: b.fileIds }),
  );
  let recipients;
  if (me.role === 'admin') recipients = [task.assignee_id];
  else if (me.role === 'employee') recipients = await adminIds();
  else recipients = [task.assignee_id, ...(await adminIds())];
  await notify(recipients.filter((id) => id !== me.id), {
    type: 'comment',
    title: `New comment on ${task.title}`,
    body: `${me.role === 'client' ? 'Client' : me.name}: ${b.body.slice(0, 200)}`,
    taskId: task.id,
    projectId: task.project_id,
  });
  res.status(201).json({ comment: { id: commentId } });
});

// ---------------------------------------------------------------- time tracking (never exposed to clients)

router.post('/:id/timer/start', requireRole('admin', 'employee'), async (req, res) => {
  const me = req.user;
  const task = await loadTaskRow(me, req.params.id);
  if (me.role === 'employee' && task.assignee_id !== me.id) throw forbidden();
  const { rows: running } = await query(
    `SELECT e.task_id, t.title FROM time_entries e JOIN tasks t ON t.id = e.task_id WHERE e.user_id = $1 AND e.ended_at IS NULL`,
    [me.id],
  );
  if (running[0]) {
    const same = running[0].task_id === task.id;
    throw conflict(same ? 'Timer is already running on this task' : `Pause the timer on "${running[0].title}" first`, {
      taskId: running[0].task_id,
    });
  }
  try {
    await query('INSERT INTO time_entries (task_id, user_id) VALUES ($1, $2)', [task.id, me.id]);
  } catch (err) {
    if (err.code === '23505') throw conflict('Another timer is already running');
    throw err;
  }
  res.json({ task: await getTask(me, task.id) });
});

router.post('/:id/timer/pause', requireRole('admin', 'employee'), async (req, res) => {
  const me = req.user;
  const task = await loadTaskRow(me, req.params.id);
  const { rowCount } = await query(
    'UPDATE time_entries SET ended_at = now() WHERE task_id = $1 AND user_id = $2 AND ended_at IS NULL',
    [task.id, me.id],
  );
  if (!rowCount) throw conflict('No running timer on this task');
  res.json({ task: await getTask(me, task.id) });
});

router.get('/:id/time-entries', requireRole('admin', 'employee'), async (req, res) => {
  const me = req.user;
  const task = await loadTaskRow(me, req.params.id);
  const { rows } = await query(
    `SELECT e.id, e.started_at, e.ended_at, u.id AS user_id, u.name AS user_name,
            EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at))::bigint AS seconds
       FROM time_entries e JOIN users u ON u.id = e.user_id
      WHERE e.task_id = $1 ${me.role === 'employee' ? 'AND e.user_id = $2' : ''}
      ORDER BY e.started_at DESC`,
    me.role === 'employee' ? [task.id, me.id] : [task.id],
  );
  const entries = rows.map((r) => ({
    id: r.id,
    user: { id: r.user_id, name: r.user_name },
    startedAt: r.started_at,
    endedAt: r.ended_at,
    seconds: Number(r.seconds),
  }));
  res.json({ entries, totalSeconds: entries.reduce((s, e) => s + e.seconds, 0) });
});

export default router;
