import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';

// One query shape for every task read so dashboards, kanban and detail views stay consistent
// and each screen is served by a single round trip.
// $1 is always the viewer's user id (used to surface only *their* running timer).
const TASK_SELECT = `
  SELECT t.*,
         p.name AS project_name, p.client_id, c.name AS client_name,
         ms.name AS master_status_name, ms.is_done AS master_is_done,
         a.name AS assignee_name, cb.name AS created_by_name,
         COALESCE(te.seconds, 0)::bigint AS time_spent_seconds,
         my.started_at AS my_timer_started_at
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN clients c ON c.id = p.client_id
    JOIN master_statuses ms ON ms.id = t.master_status_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by
    LEFT JOIN LATERAL (
      SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now()) - e.started_at)))::bigint AS seconds
        FROM time_entries e
       -- The viewer's own running segment is excluded: it is returned as activeTimer and ticked live by the UI.
       WHERE e.task_id = t.id AND NOT (e.ended_at IS NULL AND e.user_id = $1)
    ) te ON true
    LEFT JOIN time_entries my ON my.task_id = t.id AND my.user_id = $1 AND my.ended_at IS NULL
`;

export function visibilityClause(viewer, params) {
  if (viewer.role === 'admin') return 'TRUE';
  if (viewer.role === 'employee') {
    params.push(viewer.id);
    return `t.assignee_id = $${params.length}`;
  }
  params.push(viewer.clientId);
  return `p.client_id = $${params.length}`;
}

export function serializeTask(row, viewer) {
  const isOverdue = !!row.due_date && !row.master_is_done && new Date(row.due_date) < new Date();
  const base = {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    priority: row.priority,
    masterStatusName: row.master_status_name,
    percentDone: row.percent_done,
    approvalState: row.approval_state,
    isOverdue,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  // Client-safe shape: no people, no time tracking, no internal workflow ids.
  if (viewer.role === 'client') return base;
  return {
    ...base,
    clientId: row.client_id,
    clientName: row.client_name,
    masterStatusId: row.master_status_id,
    customStatusId: row.assignee_id === viewer.id ? row.custom_status_id : null,
    assignee: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name } : null,
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name } : null,
    timeSpentSeconds: Number(row.time_spent_seconds),
    activeTimer: row.my_timer_started_at ? { startedAt: row.my_timer_started_at } : null,
  };
}

/**
 * filters: { ids, assigneeIds, clientIds, projectIds, masterStatusIds, priorities, approvalStates,
 *            due: 'overdue'|'today'|'week', search, includeDone, completedOn: 'YYYY-MM-DD', limit }
 */
export async function listTasks(viewer, filters = {}, db = { query }) {
  const params = [viewer.id];
  const where = [visibilityClause(viewer, params)];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  if (filters.ids) add('t.id = ANY(?::uuid[])', filters.ids);
  if (filters.assigneeIds && viewer.role === 'admin') add('t.assignee_id = ANY(?::uuid[])', filters.assigneeIds);
  if (filters.clientIds) add('p.client_id = ANY(?::uuid[])', filters.clientIds);
  if (filters.projectIds) add('t.project_id = ANY(?::uuid[])', filters.projectIds);
  if (filters.masterStatusIds) add('t.master_status_id = ANY(?::uuid[])', filters.masterStatusIds);
  if (filters.priorities) add('t.priority::text = ANY(?::text[])', filters.priorities);
  if (filters.approvalStates) add('t.approval_state::text = ANY(?::text[])', filters.approvalStates);
  if (filters.search) add('(t.title ILIKE ? OR t.description ILIKE ?)', `%${filters.search}%`);
  if (filters.completedOn) add('t.completed_at::date = ?::date', filters.completedOn);
  if (filters.includeDone === false) where.push('NOT ms.is_done');
  if (filters.due === 'overdue') where.push('t.due_date < now() AND NOT ms.is_done');
  if (filters.due === 'today') {
    where.push(`NOT ms.is_done AND (t.due_date::date = current_date
      OR EXISTS (SELECT 1 FROM time_entries r WHERE r.task_id = t.id AND r.ended_at IS NULL))`);
  }
  if (filters.due === 'week') where.push(`NOT ms.is_done AND t.due_date < now() + interval '7 days'`);

  const order = `ORDER BY
    CASE t.priority WHEN 'very_urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    t.due_date ASC NULLS LAST, t.created_at DESC`;
  const limit = filters.limit ? `LIMIT ${Number(filters.limit)}` : '';
  const { rows } = await db.query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ${order} ${limit}`, params);
  return rows.map((r) => serializeTask(r, viewer));
}

/** Loads a raw task row the viewer is allowed to see, or throws 404 (never leaks existence). */
export async function loadTaskRow(viewer, taskId, db = { query }) {
  const params = [viewer.id, taskId];
  const vis = visibilityClause(viewer, params);
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $2 AND ${vis}`, params);
  if (!rows[0]) throw notFound('Task not found');
  return rows[0];
}

export async function getTask(viewer, taskId, db) {
  return serializeTask(await loadTaskRow(viewer, taskId, db), viewer);
}

export async function doneStatusId(db = { query }) {
  const { rows } = await db.query('SELECT id FROM master_statuses WHERE is_done ORDER BY position LIMIT 1');
  return rows[0]?.id ?? null;
}

export async function firstStatusId(db = { query }) {
  const { rows } = await db.query('SELECT id FROM master_statuses ORDER BY position LIMIT 1');
  return rows[0]?.id ?? null;
}
