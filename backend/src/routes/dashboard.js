import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { listTasks } from '../services/tasks.js';
import { listProjects } from '../services/projects.js';
import { financeSummary, walletBalance } from '../services/finance.js';
import { serializeFile } from '../lib/serialize.js';

const router = Router();

router.get('/admin', requireRole('admin'), async (req, res) => {
  const me = req.user;
  const [pendingApprovals, awaitingClient, overdueTasks, todaysTasks, finance, counts] = await Promise.all([
    listTasks(me, { approvalStates: ['internal_review'] }),
    listTasks(me, { approvalStates: ['client_review'] }),
    listTasks(me, { due: 'overdue' }),
    listTasks(me, { due: 'today' }),
    financeSummary(),
    query(`SELECT
      (SELECT COUNT(*) FROM projects WHERE status = 'active')::int AS active_projects,
      (SELECT COUNT(*) FROM tasks t JOIN master_statuses ms ON ms.id = t.master_status_id WHERE NOT ms.is_done)::int AS open_tasks,
      (SELECT COUNT(*) FROM users WHERE role = 'employee' AND is_active)::int AS employees,
      (SELECT COUNT(*) FROM clients)::int AS clients`),
  ]);
  const c = counts.rows[0];
  res.json({
    pendingApprovals,
    awaitingClient,
    overdueTasks,
    todaysTasks,
    counts: {
      pendingApprovals: pendingApprovals.length,
      awaitingClient: awaitingClient.length,
      overdue: overdueTasks.length,
      today: todaysTasks.length,
      activeProjects: c.active_projects,
      openTasks: c.open_tasks,
      employees: c.employees,
      clients: c.clients,
    },
    finance,
  });
});

router.get('/employee', requireRole('employee'), async (req, res) => {
  const me = req.user;
  const [overdueTasks, todaysTasks, revisionRequests, active] = await Promise.all([
    listTasks(me, { due: 'overdue' }),
    listTasks(me, { due: 'today' }),
    listTasks(me, { approvalStates: ['revision_requested'] }),
    query(
      `SELECT e.task_id, e.started_at, t.title FROM time_entries e JOIN tasks t ON t.id = e.task_id
        WHERE e.user_id = $1 AND e.ended_at IS NULL`,
      [me.id],
    ),
  ]);
  const timer = active.rows[0];
  res.json({
    overdueTasks,
    todaysTasks,
    revisionRequests,
    activeTimer: timer ? { taskId: timer.task_id, taskTitle: timer.title, startedAt: timer.started_at } : null,
    wallet: me.employmentType === 'project_based' ? await walletBalance(me.id) : null,
  });
});

router.get('/client', requireRole('client'), async (req, res) => {
  const me = req.user;
  const [projects, actionRequired, activeTasks, assets] = await Promise.all([
    listProjects(me),
    listTasks(me, { approvalStates: ['client_review'] }),
    listTasks(me, { includeDone: false }),
    approvedAssets(me),
  ]);
  res.json({ projects, actionRequired, activeTasks, approvedAssets: assets });
});

export async function approvedAssets(viewer) {
  const { rows } = await query(
    `SELECT f.* FROM files f JOIN projects p ON p.id = f.project_id
      WHERE f.is_final AND p.client_id = $1 ORDER BY f.created_at DESC`,
    [viewer.clientId],
  );
  return rows.map((f) => serializeFile(f, viewer));
}

export default router;
