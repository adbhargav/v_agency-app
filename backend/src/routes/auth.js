import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { serializeUser } from '../lib/serialize.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw unauthorized('Invalid email or password');
  if (!user.is_active) throw unauthorized('Account is inactive');
  res.json({ token: signToken(user), user: serializeUser(user) });
});

router.get('/me', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT u.*, COALESCE((SELECT array_agg(service_type_id::text) FROM user_service_types s WHERE s.user_id = u.id), '{}') AS service_type_ids
       FROM users u WHERE u.id = $1`,
    [req.user.id],
  );
  res.json({ user: serializeUser(rows[0]) });
});

router.post('/change-password', authenticate, async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }), req.body);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(body.currentPassword, rows[0].password_hash))) throw badRequest('Current password is incorrect');
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await bcrypt.hash(body.newPassword, 10)]);
  res.json({ ok: true });
});

export default router;
