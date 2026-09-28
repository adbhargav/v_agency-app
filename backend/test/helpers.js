import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/v_agency_test';
process.env.ENABLE_JOBS = 'false';
// Tests use fixed demo credentials, regardless of what a local .env sets.
process.env.ADMIN_EMAIL = 'admin@vagency.com';
process.env.ADMIN_PASSWORD = 'admin12345';
delete process.env.ADMIN_RESET;
for (const k of ['SMTP_HOST', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_SHARED_DRIVE_ID', 'GOOGLE_OAUTH_CLIENT_ID']) delete process.env[k];

const { pool } = await import('../src/db/pool.js');
const { seed } = await import('../src/db/seed.js');
const { createApp } = await import('../src/app.js');

export { pool };
export const app = createApp();

export async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await seed({ demo: true });
}

export async function login(email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  const auth = { Authorization: `Bearer ${res.body.token}` };
  const wrap = (method) => (url, body) => {
    const r = request(app)[method](`/api${url}`).set(auth);
    return body === undefined ? r : r.send(body);
  };
  return { user: res.body.user, get: wrap('get'), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), del: wrap('delete') };
}

export const loginAll = async () => ({
  admin: await login('admin@vagency.com', 'admin12345'),
  editor: await login('editor@vagency.com'),
  designer: await login('designer@vagency.com'),
  client: await login('client@skyline.test'),
});
