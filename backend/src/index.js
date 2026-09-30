import { config } from './config.js';
import { createApp } from './app.js';
import { seed } from './db/seed.js';
import { warmPool } from './db/pool.js';
import { startJobs } from './services/jobs.js';

// Migrations, default statuses/services and the first admin are applied on every start, so the
// deploy works whatever start command the host uses. Admin problems are logged, not fatal.
await seed({ strict: false });
await warmPool().catch((err) => console.error('[db] warm-up failed', err.message));
createApp().listen(config.port, () => {
  console.log(`V Agency API listening on http://localhost:${config.port}/api`);
});
if (config.enableJobs) startJobs();
