import { config } from './config.js';
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { startJobs } from './services/jobs.js';

await migrate();
createApp().listen(config.port, () => {
  console.log(`V Agency API listening on http://localhost:${config.port}/api`);
});
if (config.enableJobs) startJobs();
