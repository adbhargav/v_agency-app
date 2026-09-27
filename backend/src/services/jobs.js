import cron from 'node-cron';
import { query } from '../db/pool.js';
import { adminIds, notify } from './notify.js';
import { pullCalendarChanges } from './calendar.js';

/**
 * Finds tasks whose deadline just passed and alerts the assignee and every manager,
 * in-app (high priority) and by email. Each task is alerted once per deadline.
 */
export async function runDeadlineAlerts() {
  const { rows } = await query(
    `UPDATE tasks t SET deadline_alert_sent_at = now()
       FROM projects p, master_statuses ms
      WHERE p.id = t.project_id AND ms.id = t.master_status_id
        AND t.due_date < now() AND NOT ms.is_done AND t.deadline_alert_sent_at IS NULL
      RETURNING t.id, t.title, t.assignee_id, t.project_id, t.due_date, p.name AS project_name`,
  );
  if (!rows.length) return 0;
  const admins = await adminIds();
  for (const task of rows) {
    await notify([task.assignee_id, ...admins], {
      type: 'deadline_missed',
      title: `Deadline missed: ${task.title}`,
      body: `The task "${task.title}" in project "${task.project_name}" passed its deadline (${new Date(task.due_date).toUTCString()}) and is not complete.`,
      taskId: task.id,
      projectId: task.project_id,
      priority: 'high',
      email: true,
      ctaLabel: 'Open task',
    });
  }
  return rows.length;
}

export function startJobs() {
  const guard = (name, fn) => async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[job:${name}]`, err);
    }
  };
  cron.schedule('* * * * *', guard('deadlines', runDeadlineAlerts));
  cron.schedule('*/5 * * * *', guard('calendar-pull', pullCalendarChanges));
}
