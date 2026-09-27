import { Router } from 'express';
import { config } from '../config.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { connectUrl, disconnect, handleCallback } from '../services/calendar.js';

const router = Router();

// Google redirects the browser here, so this route authenticates via the signed `state` instead of a bearer token.
router.get('/oauth/callback', async (req, res) => {
  try {
    await handleCallback(String(req.query.code || ''), String(req.query.state || ''));
    res.redirect(`${config.appUrl}/settings?calendar=connected`);
  } catch (err) {
    console.error('[calendar] oauth callback failed', err.message);
    res.redirect(`${config.appUrl}/settings?calendar=error`);
  }
});

router.use(authenticate, requireRole('employee', 'admin'));

router.get('/connect-url', (req, res) => {
  res.json({ url: connectUrl(req.user.id) });
});

router.post('/disconnect', async (req, res) => {
  await disconnect(req.user.id);
  res.json({ ok: true });
});

export default router;
