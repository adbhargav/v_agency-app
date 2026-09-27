import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../lib/validate.js';
import { listTasks } from '../services/tasks.js';

const router = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const today = () => new Date().toISOString().slice(0, 10);

const serializeReport = (r) => (r ? { blockers: r.blockers, tomorrowPriority: r.tomorrow_priority, updatedAt: r.updated_at } : null);

router.get('/', requireRole('employee'), async (req, res) => {
  const date = parse(dateSchema.optional(), req.query.date) ?? today();
  const [completedToday, report] = await Promise.all([
    listTasks(req.user, { completedOn: date }),
    query('SELECT * FROM eod_reports WHERE user_id = $1 AND report_date = $2', [req.user.id, date]),
  ]);
  res.json({ date, completedToday, report: serializeReport(report.rows[0]) });
});

router.put('/', requireRole('employee'), async (req, res) => {
  const b = parse(
    z.object({ date: dateSchema.optional(), blockers: z.string().max(5000), tomorrowPriority: z.string().max(5000) }),
    req.body,
  );
  const { rows } = await query(
    `INSERT INTO eod_reports (user_id, report_date, blockers, tomorrow_priority) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, report_date) DO UPDATE SET blockers = EXCLUDED.blockers,
       tomorrow_priority = EXCLUDED.tomorrow_priority, updated_at = now()
     RETURNING *`,
    [req.user.id, b.date ?? today(), b.blockers, b.tomorrowPriority],
  );
  res.json({ report: serializeReport(rows[0]) });
});

router.get('/team', requireRole('admin'), async (req, res) => {
  const date = parse(dateSchema.optional(), req.query.date) ?? today();
  const [{ rows: employees }, { rows: reports }, completed] = await Promise.all([
    query(`SELECT id, name FROM users WHERE role = 'employee' AND is_active ORDER BY name`),
    query('SELECT * FROM eod_reports WHERE report_date = $1', [date]),
    listTasks(req.user, { completedOn: date }),
  ]);
  const byUser = new Map(reports.map((r) => [r.user_id, r]));
  res.json({
    date,
    reports: employees.map((u) => ({
      user: u,
      completedToday: completed.filter((t) => t.assignee?.id === u.id),
      report: serializeReport(byUser.get(u.id)),
    })),
  });
});

export default router;
