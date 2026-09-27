import { query } from '../db/pool.js';
import { config } from '../config.js';
import { sendMail } from './mailer.js';

/**
 * Creates in-app notifications for each user and optionally emails them.
 * recipients: user ids (duplicates / nulls ignored).
 */
export async function notify(recipients, { type, title, body, taskId = null, projectId = null, priority = 'normal', email = false, ctaLabel }) {
  const ids = [...new Set(recipients.filter(Boolean))];
  if (!ids.length) return;
  const { rows: users } = await query(
    `INSERT INTO notifications (user_id, type, title, body, task_id, project_id, priority)
     SELECT u.id, $2, $3, $4, $5, $6, $7 FROM users u WHERE u.id = ANY($1::uuid[]) AND u.is_active
     RETURNING user_id`,
    [ids, type, title, body, taskId, projectId, priority],
  );
  if (!email || !users.length) return;
  const { rows } = await query('SELECT email FROM users WHERE id = ANY($1::uuid[])', [users.map((u) => u.user_id)]);
  const ctaUrl = taskId ? `${config.appUrl}/tasks/${taskId}` : config.appUrl;
  await Promise.all(
    rows.map((r) =>
      sendMail({ to: r.email, subject: title, heading: title, body, ctaUrl, ctaLabel, tone: priority === 'high' ? 'alert' : 'normal' }),
    ),
  );
}

export async function adminIds() {
  const { rows } = await query(`SELECT id FROM users WHERE role = 'admin' AND is_active`);
  return rows.map((r) => r.id);
}

export async function clientUserIds(clientId) {
  const { rows } = await query(`SELECT id FROM users WHERE role = 'client' AND client_id = $1 AND is_active`, [clientId]);
  return rows.map((r) => r.id);
}
