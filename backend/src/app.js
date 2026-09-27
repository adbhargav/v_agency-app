import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
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

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  if (config.env !== 'test') app.use(morgan('dev'));

  const api = express.Router();
  api.get('/health', (_req, res) => res.json({ ok: true }));
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
