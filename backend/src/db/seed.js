import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';
import { migrate } from './migrate.js';

const MASTER = [
  { name: 'To-Do', color: '#64748b', isDone: false },
  { name: 'In Progress', color: '#6366f1', isDone: false },
  { name: 'Review', color: '#f59e0b', isDone: false },
  { name: 'Done', color: '#10b981', isDone: true },
];

/** Idempotent: master statuses + first admin. Pass --demo for sample clients, staff, projects and tasks. */
export async function seed({ demo = false } = {}) {
  await migrate();
  const { rows: existing } = await query('SELECT COUNT(*)::int AS n FROM master_statuses');
  if (!existing[0].n) {
    for (const [i, s] of MASTER.entries()) {
      await query('INSERT INTO master_statuses (name, color, is_done, position) VALUES ($1, $2, $3, $4)', [s.name, s.color, s.isDone, i]);
    }
  }
  const email = process.env.ADMIN_EMAIL || 'admin@vagency.com';
  const password = process.env.ADMIN_PASSWORD || 'admin12345';
  await query(
    `INSERT INTO users (name, email, password_hash, role) SELECT 'Agency Admin', $1, $2, 'admin'
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower($1))`,
    [email, await bcrypt.hash(password, 10)],
  );
  if (demo) await seedDemo();
}

async function seedDemo() {
  const { rowCount } = await query(`SELECT 1 FROM clients WHERE name = 'Skyline Realty'`);
  if (rowCount) return;
  const hash = await bcrypt.hash('password123', 10);
  const status = Object.fromEntries((await query('SELECT id, name FROM master_statuses')).rows.map((r) => [r.name, r.id]));
  const client = (await query(`INSERT INTO clients (name, company, email) VALUES ('Skyline Realty', 'Skyline Realty LLC', 'hello@skyline.test') RETURNING id`)).rows[0].id;
  const user = async (name, email, role, extra = {}) =>
    (
      await query(
        `INSERT INTO users (name, email, password_hash, role, employment_type, client_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [name, email, hash, role, extra.employmentType ?? null, extra.clientId ?? null],
      )
    ).rows[0].id;
  const editor = await user('Aarav Editor', 'editor@vagency.com', 'employee', { employmentType: 'project_based' });
  const designer = await user('Diya Designer', 'designer@vagency.com', 'employee', { employmentType: 'salary_based' });
  await user('Sam Client', 'client@skyline.test', 'client', { clientId: client });
  const project = (
    await query(
      `INSERT INTO projects (client_id, name, description, start_date, end_date)
       VALUES ($1, 'Real Estate August Campaign', 'Property tour videos and Meta ad creatives', current_date - 7, current_date + 21) RETURNING id`,
      [client],
    )
  ).rows[0].id;
  const task = (title, assignee, st, priority, dueSql, pct = 0, approval = 'none') =>
    query(
      `INSERT INTO tasks (project_id, title, assignee_id, master_status_id, priority, due_date, percent_done, approval_state)
       VALUES ($1, $2, $3, $4, $5, ${dueSql}, $6, $7)`,
      [project, title, assignee, status[st], priority, pct, approval],
    );
  await task('Edit Property Tour Video', editor, 'In Progress', 'very_urgent', `now() + interval '4 hours'`, 60);
  await task('Design Meta Ad Carousels', designer, 'Review', 'high', `now() + interval '2 days'`, 90, 'internal_review');
  await task('Shoot Day 1 — Raw Footage', editor, 'To-Do', 'medium', `now() - interval '1 day'`, 0);
  await task('Brand Color Grading LUT', editor, 'Done', 'low', `now() - interval '3 days'`, 100, 'approved');
  await query(`INSERT INTO wallet_transactions (employee_id, amount, description, created_by)
               SELECT $1, 250, 'Property tour edit — milestone 1', id FROM users WHERE role = 'admin' LIMIT 1`, [editor]);
  await query(`INSERT INTO salary_records (employee_id, period_month, amount, status) VALUES ($1, date_trunc('month', current_date), 1200, 'sent')`, [designer]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed({ demo: process.argv.includes('--demo') })
    .then(() => {
      console.log('Seed complete');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
