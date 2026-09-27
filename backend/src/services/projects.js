import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';

// Progress = average completion of tasks, counting finished tasks as 100%.
// Employees get counts over their own tasks only (they never see the client-wide timeline).
export async function listProjects(viewer, { ids } = {}) {
  const params = [];
  const where = [];
  let taskScope = 'TRUE';
  if (viewer.role === 'employee') {
    params.push(viewer.id);
    taskScope = `t.assignee_id = $${params.length}`;
    where.push(`EXISTS (SELECT 1 FROM tasks x WHERE x.project_id = p.id AND x.assignee_id = $${params.length})`);
  } else if (viewer.role === 'client') {
    params.push(viewer.clientId);
    where.push(`p.client_id = $${params.length}`);
  }
  if (ids) {
    params.push(ids);
    where.push(`p.id = ANY($${params.length}::uuid[])`);
  }
  const { rows } = await query(
    `SELECT p.*, c.name AS client_name, s.task_count, s.done_count, s.progress
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS task_count,
                COUNT(*) FILTER (WHERE ms.is_done)::int AS done_count,
                COALESCE(ROUND(AVG(CASE WHEN ms.is_done THEN 100 ELSE t.percent_done END)), 0)::int AS progress
           FROM tasks t JOIN master_statuses ms ON ms.id = t.master_status_id
          WHERE t.project_id = p.id AND ${taskScope}
       ) s ON true
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY (p.status = 'active') DESC, p.created_at DESC`,
    params,
  );
  return rows.map((r) => serializeProject(r, viewer));
}

function serializeProject(p, viewer) {
  const out = {
    id: p.id,
    clientId: p.client_id,
    clientName: p.client_name,
    name: p.name,
    description: p.description,
    startDate: p.start_date,
    endDate: p.end_date,
    status: p.status,
    driveFolderId: p.drive_folder_id,
    progress: p.progress ?? 0,
    taskCount: p.task_count ?? 0,
    doneCount: p.done_count ?? 0,
    createdAt: p.created_at,
  };
  if (viewer.role !== 'admin') delete out.driveFolderId;
  if (viewer.role === 'employee') {
    out.startDate = null;
    out.endDate = null;
  }
  return out;
}

export async function getProject(viewer, id) {
  const [project] = await listProjects(viewer, { ids: [id] });
  if (!project) throw notFound('Project not found');
  return project;
}

/** Returns the raw project row if the viewer can access it, else 404. */
export async function assertProjectAccess(viewer, projectId) {
  await getProject(viewer, projectId);
  const { rows } = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
  return rows[0];
}
