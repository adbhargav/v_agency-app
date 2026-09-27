import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { financeSummary, walletBalance } from '../services/finance.js';
import { money } from '../lib/serialize.js';
import { notify } from '../services/notify.js';

// Clients never reach this module. Employees can only read their own wallet / salary.
const router = Router();
router.use(requireRole('admin', 'employee'));
const uuid = z.string().uuid();
const amount = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive().max(1e9));

const selfOrAdmin = (req) => {
  const userId = parse(uuid, req.params.userId);
  if (req.user.role !== 'admin' && req.user.id !== userId) throw forbidden();
  return userId;
};

async function loadEmployee(id, type) {
  const { rows } = await query(`SELECT * FROM users WHERE id = $1 AND role = 'employee'`, [id]);
  if (!rows[0]) throw notFound('Employee not found');
  if (type && rows[0].employment_type !== type) {
    throw badRequest(type === 'project_based' ? 'Wallet credits are only for project-based employees' : 'Salary records are only for salary-based employees');
  }
  return rows[0];
}

const serializeTx = (t) => ({
  id: t.id,
  employeeId: t.employee_id,
  taskId: t.task_id,
  taskTitle: t.task_title ?? null,
  amount: money(t.amount),
  description: t.description,
  status: t.status,
  settledAt: t.settled_at,
  createdAt: t.created_at,
});

const serializeSalary = (s) => ({
  id: s.id,
  employeeId: s.employee_id,
  periodMonth: s.period_month.slice(0, 7),
  amount: money(s.amount),
  status: s.status,
  sentAt: s.sent_at,
  settledAt: s.settled_at,
  createdAt: s.created_at,
});

router.get('/summary', requireRole('admin'), async (_req, res) => {
  res.json(await financeSummary());
});

router.get('/employees', requireRole('admin'), async (_req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.name, u.email, u.employment_type, u.is_active,
           COALESCE(w.pending, 0) AS pending, COALESCE(w.settled, 0) AS settled,
           ls.period_month AS last_month, ls.amount AS last_amount, ls.status AS last_status
      FROM users u
      LEFT JOIN LATERAL (
        SELECT SUM(amount) FILTER (WHERE status = 'pending') AS pending, SUM(amount) FILTER (WHERE status = 'settled') AS settled
          FROM wallet_transactions WHERE employee_id = u.id) w ON true
      LEFT JOIN LATERAL (
        SELECT * FROM salary_records WHERE employee_id = u.id ORDER BY period_month DESC LIMIT 1) ls ON true
     WHERE u.role = 'employee'
     ORDER BY u.is_active DESC, u.name`);
  res.json({
    employees: rows.map((r) => ({
      user: { id: r.id, name: r.name, email: r.email, employmentType: r.employment_type, isActive: r.is_active },
      pending: money(r.pending),
      settled: money(r.settled),
      lastSalary: r.last_month ? { periodMonth: r.last_month.slice(0, 7), amount: money(r.last_amount), status: r.last_status } : null,
    })),
  });
});

router.get('/wallet/:userId', async (req, res) => {
  const userId = selfOrAdmin(req);
  await loadEmployee(userId);
  const [balance, { rows }] = await Promise.all([
    walletBalance(userId),
    query(
      `SELECT w.*, t.title AS task_title FROM wallet_transactions w LEFT JOIN tasks t ON t.id = w.task_id
        WHERE w.employee_id = $1 ORDER BY w.created_at DESC`,
      [userId],
    ),
  ]);
  res.json({ balance, transactions: rows.map(serializeTx) });
});

router.post('/wallet/:userId/credit', requireRole('admin'), async (req, res) => {
  const userId = parse(uuid, req.params.userId);
  const b = parse(z.object({ amount, description: z.string().trim().min(1).max(500), taskId: uuid.nullish() }), req.body);
  await loadEmployee(userId, 'project_based');
  if (b.taskId) {
    const { rowCount } = await query('SELECT 1 FROM tasks WHERE id = $1 AND assignee_id = $2', [b.taskId, userId]);
    if (!rowCount) throw badRequest('Task is not assigned to this employee');
  }
  const { rows } = await query(
    `INSERT INTO wallet_transactions (employee_id, task_id, amount, description, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, b.taskId ?? null, b.amount, b.description, req.user.id],
  );
  await notify([userId], { type: 'wallet_credit', title: 'Wallet credited', body: `${money(b.amount)} was credited to your wallet: ${b.description}` });
  res.status(201).json({ transaction: serializeTx(rows[0]) });
});

router.post('/wallet/transactions/:id/settle', requireRole('admin'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { rows } = await query(
    `UPDATE wallet_transactions SET status = 'settled', settled_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id],
  );
  if (!rows[0]) {
    const exists = await query('SELECT 1 FROM wallet_transactions WHERE id = $1', [id]);
    if (!exists.rowCount) throw notFound('Transaction not found');
    throw conflict('Transaction is already settled');
  }
  res.json({ transaction: serializeTx(rows[0]) });
});

router.get('/salary/:userId', async (req, res) => {
  const userId = selfOrAdmin(req);
  await loadEmployee(userId);
  const { rows } = await query('SELECT * FROM salary_records WHERE employee_id = $1 ORDER BY period_month DESC', [userId]);
  res.json({ records: rows.map(serializeSalary) });
});

router.post('/salary/:userId', requireRole('admin'), async (req, res) => {
  const userId = parse(uuid, req.params.userId);
  const b = parse(z.object({ periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM'), amount }), req.body);
  await loadEmployee(userId, 'salary_based');
  try {
    const { rows } = await query(
      `INSERT INTO salary_records (employee_id, period_month, amount) VALUES ($1, $2, $3) RETURNING *`,
      [userId, `${b.periodMonth}-01`, b.amount],
    );
    res.status(201).json({ record: serializeSalary(rows[0]) });
  } catch (err) {
    if (err.code === '23505') throw conflict('A salary record for this month already exists');
    throw err;
  }
});

router.post('/salary/records/:id/status', requireRole('admin'), async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { status } = parse(z.object({ status: z.enum(['sent', 'settled']) }), req.body);
  const { rows } = await query(
    `UPDATE salary_records SET status = $2::salary_status,
            sent_at = COALESCE(sent_at, now()),
            settled_at = CASE WHEN $2::text = 'settled' THEN COALESCE(settled_at, now()) ELSE NULL END
      WHERE id = $1 RETURNING *`,
    [id, status],
  );
  if (!rows[0]) throw notFound('Salary record not found');
  if (status === 'sent') {
    await notify([rows[0].employee_id], { type: 'salary_sent', title: 'Salary sent', body: `Your salary for ${rows[0].period_month.slice(0, 7)} has been sent.` });
  }
  res.json({ record: serializeSalary(rows[0]) });
});

export default router;
