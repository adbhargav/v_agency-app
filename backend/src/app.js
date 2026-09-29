import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { query } from './db/pool.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { HttpError } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import clientRoutes from './routes/clients.js';
import statusRoutes from './routes/statuses.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';
import eodRoutes from './routes/eod.js';
import notificationRoutes from './routes/notifications.js';
import financeRoutes from './routes/finance.js';
import fileRoutes from './routes/files.js';
import calendarRoutes from './routes/calendar.js';
import serviceTypeRoutes from './routes/serviceTypes.js';
import requirementRoutes from './routes/requirements.js';

// Hashed assets are immutable; everything else (logo, favicon) should revalidate.
function noCacheHtml(res, filePath) {
  if (!filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'no-cache');
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Uploads go straight from the browser to Google Drive's resumable upload URL.
          'connect-src': ["'self'", 'https://www.googleapis.com'],
          'img-src': ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );
  app.use(cors({ origin: config.corsOrigin }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan('dev'));

  const api = express.Router();
  // Public setup check: is the database reachable and has the first admin been created?
  api.get('/health', async (_req, res) => {
    try {
      const { rows } = await query(`SELECT EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND is_active) AS admin`);
      res.json({ ok: true, database: true, adminReady: rows[0].admin });
    } catch {
      res.status(503).json({ ok: false, database: false, adminReady: false });
    }
  });
  api.use('/auth', authRoutes);
  api.use('/calendar', calendarRoutes);

  api.use(authenticate);
  api.use('/users', userRoutes);
  api.use('/clients', clientRoutes);
  api.use('/statuses', statusRoutes);
  api.use('/projects', projectRoutes);
  api.use('/tasks', taskRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/eod', eodRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/finance', financeRoutes);
  api.use('/service-types', serviceTypeRoutes);
  api.use('/requirements', requirementRoutes);
  api.get('/timer/active', requireRole('admin', 'employee'), async (req, res) => {
    const { rows } = await query(
      `SELECT e.task_id, e.started_at, t.title FROM time_entries e JOIN tasks t ON t.id = e.task_id
        WHERE e.user_id = $1 AND e.ended_at IS NULL`,
      [req.user.id],
    );
    const r = rows[0];
    res.json({ timer: r ? { taskId: r.task_id, taskTitle: r.title, startedAt: r.started_at } : null });
  });
  api.use(fileRoutes);

  app.use('/api', api);

  // In production the built React app is served by this same process (one URL, no CORS).
  const webDist = config.webDist ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1y', immutable: true, setHeaders: noCacheHtml }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Route not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { message: 'Malformed JSON body', code: 'VALIDATION' } });
    }
    // Google API errors surface as upstream failures rather than leaking internals.
    if (err.response?.config?.url?.includes('googleapis.com')) {
      console.error('[google]', err.message);
      return res.status(502).json({ error: { message: 'Google API request failed', code: 'UPSTREAM' } });
    }
    console.error(err);
    res.status(500).json({ error: { message: 'Something went wrong', code: 'INTERNAL' } });
  });

  return app;
}
