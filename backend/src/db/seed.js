import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';
import { migrate } from './migrate.js';

const MASTER = [
  { name: 'To-Do', color: '#64748b', isDone: false },
  { name: 'In Progress', color: '#6366f1', isDone: false },
  { name: 'Review', color: '#f59e0b', isDone: false },
  { name: 'Done', color: '#10b981', isDone: true },
];

// Starter services and requirement forms; the admin can edit, extend or deactivate them in the app.
const SERVICES = [
  {
    name: 'Video Editing', color: '#df2f25', description: 'Reels, ads, property tours and long-form edits',
    fields: [
      { label: 'Video type', type: 'select', required: true, options: ['Reel / Short', 'Ad', 'Property tour', 'YouTube long-form', 'Other'] },
      { label: 'Target length', type: 'select', required: false, options: ['Under 30s', '30–60s', '1–3 min', '3–10 min', '10 min+'] },
      { label: 'Platforms', type: 'multiselect', required: false, options: ['Instagram', 'YouTube', 'Facebook', 'TikTok', 'LinkedIn', 'Website'] },
      { label: 'Brief', type: 'textarea', required: true, helpText: 'Story, style, music, captions, calls to action…' },
      { label: 'Raw footage', type: 'file', required: false, helpText: 'Upload the clips to edit' },
      { label: 'Reference link', type: 'url', required: false },
    ],
  },
  {
    name: 'Graphic Design', color: '#f59e0b', description: 'Social creatives, ad carousels, brand assets',
    fields: [
      { label: 'Deliverable', type: 'select', required: true, options: ['Social post', 'Ad carousel', 'Story', 'Logo / branding', 'Print', 'Other'] },
      { label: 'Sizes needed', type: 'multiselect', required: false, options: ['1:1', '4:5', '9:16', '16:9', 'A4'] },
      { label: 'Copy / text to include', type: 'textarea', required: false },
      { label: 'Brief', type: 'textarea', required: true },
      { label: 'Reference images', type: 'file', required: false },
    ],
  },
  {
    name: 'Development', color: '#6366f1', description: 'Websites, landing pages and app changes',
    fields: [
      { label: 'Request type', type: 'select', required: true, options: ['New feature', 'Bug fix', 'New page', 'Content update', 'Other'] },
      { label: 'Page or app URL', type: 'url', required: false },
      { label: 'What should be built or changed?', type: 'textarea', required: true },
      { label: 'Steps to reproduce (for bugs)', type: 'textarea', required: false },
      { label: 'Screenshots / recordings', type: 'file', required: false },
    ],
  },
  {
    name: 'Marketing', color: '#10b981', description: 'Campaigns, ads management and social media',
    fields: [
      { label: 'Campaign goal', type: 'select', required: true, options: ['Leads', 'Sales', 'Awareness', 'Engagement', 'Traffic'] },
      { label: 'Channels', type: 'multiselect', required: true, options: ['Meta Ads', 'Google Ads', 'Instagram organic', 'Email', 'LinkedIn'] },
      { label: 'Monthly budget', type: 'number', required: false },
      { label: 'Launch date', type: 'date', required: false },
      { label: 'Target audience', type: 'textarea', required: true },
      { label: 'Brand assets', type: 'file', required: false },
    ],
  },
];

async function seedServices() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM service_types');
  if (rows[0].n) return;
  for (const [i, st] of SERVICES.entries()) {
    const { rows: created } = await query(
      'INSERT INTO service_types (name, description, color, position) VALUES ($1, $2, $3, $4) RETURNING id',
      [st.name, st.description, st.color, i],
    );
    for (const [pos, f] of st.fields.entries()) {
      await query(
        'INSERT INTO service_fields (service_type_id, label, type, required, options, help_text, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [created[0].id, f.label, f.type, f.required, JSON.stringify(f.options ?? []), f.helpText ?? null, pos],
      );
    }
  }
}

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
  const password = process.env.ADMIN_PASSWORD;
  const { rows: admins } = await query(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
  if (process.env.ADMIN_RESET === 'true') {
    // One-off recovery: make ADMIN_EMAIL an active admin with ADMIN_PASSWORD (creates it if missing).
    // Remove ADMIN_RESET afterwards so later restarts leave the password alone.
    if (!password || password.length < 8) throw new Error('ADMIN_RESET needs ADMIN_PASSWORD (8+ characters)');
    const hash = await bcrypt.hash(password, 10);
    const { rowCount } = await query(
      `UPDATE users SET password_hash = $2, role = 'admin', is_active = true, employment_type = NULL, client_id = NULL
        WHERE lower(email) = lower($1)`,
      [email, hash],
    );
    if (!rowCount) {
      await query(`INSERT INTO users (name, email, password_hash, role) VALUES ('Agency Admin', $1, $2, 'admin')`, [email, hash]);
    }
    console.log(`Admin access reset for ${email}. Remove ADMIN_RESET now.`);
  } else if (!admins.length) {
    // Never create a live admin with the well-known development password.
    if (process.env.NODE_ENV === 'production' && (!password || password.length < 8)) {
      throw new Error('Set ADMIN_PASSWORD (8+ characters) to create the first admin account');
    }
    await query(`INSERT INTO users (name, email, password_hash, role) VALUES ('Agency Admin', $1, $2, 'admin')`, [
      email,
      await bcrypt.hash(password || 'admin12345', 10),
    ]);
  }
  await seedServices();
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
  const service = Object.fromEntries((await query('SELECT id, name FROM service_types')).rows.map((r) => [r.name, r.id]));
  await query('INSERT INTO user_service_types (user_id, service_type_id) VALUES ($1, $2), ($3, $4)', [
    editor, service['Video Editing'], designer, service['Graphic Design'],
  ]);
  await query('INSERT INTO client_service_types (client_id, service_type_id) VALUES ($1, $2), ($1, $3), ($1, $4)', [
    client, service['Video Editing'], service['Graphic Design'], service.Marketing,
  ]);
  await query(`UPDATE tasks SET service_type_id = $1 WHERE assignee_id = $2`, [service['Video Editing'], editor]);
  await query(`UPDATE tasks SET service_type_id = $1 WHERE assignee_id = $2`, [service['Graphic Design'], designer]);
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
