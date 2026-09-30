import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { forbidden, unauthorized } from '../lib/errors.js';

/** Short-lived token that only lets this user open one file's content URL. */
export function signFileToken(userId, fileId) {
  return jwt.sign({ sub: userId, purpose: 'file', fid: fileId }, config.jwtSecret, { expiresIn: '12h' });
}

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Every API call needs the current user. Caching it briefly saves a database round trip per request;
// changes made through the users API clear the entry, so deactivation and role changes still apply at once.
const USER_TTL_MS = 30_000;
const userCache = new Map();

export function forgetAuthUser(userId) {
  if (userId) userCache.delete(userId);
  else userCache.clear();
}

async function loadAuthUser(id) {
  const hit = userCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.user;
  const { rows } = await query(
    'SELECT id, name, email, role, employment_type, client_id, is_active FROM users WHERE id = $1',
    [id],
  );
  if (userCache.size > 5000) userCache.clear();
  userCache.set(id, { user: rows[0], expires: Date.now() + USER_TTL_MS });
  return rows[0];
}

export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let fileScope = null;
  // <img>/<video> tags cannot send headers, so file content URLs carry a short-lived token scoped to that one file.
  const fileMatch = /^\/api\/files\/([^/]+)\/content$/.exec(req.originalUrl.split('?')[0]);
  if (!token && req.method === 'GET' && fileMatch && typeof req.query.t === 'string') {
    token = req.query.t;
    fileScope = fileMatch[1];
  }
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  if (fileScope ? payload.purpose !== 'file' || payload.fid !== fileScope : payload.purpose) {
    throw unauthorized('Invalid token');
  }
  const user = await loadAuthUser(payload.sub);
  if (!user || !user.is_active) throw unauthorized('Account is inactive');
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role, employmentType: user.employment_type, clientId: user.client_id };
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden();
  next();
};
