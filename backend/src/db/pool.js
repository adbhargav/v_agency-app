import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of local-midnight Date objects.
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC stays a string to avoid float rounding on money.

// Opening a connection to a hosted database (TLS + auth) costs several network round trips, so idle
// connections are kept for 5 minutes instead of pg's default 10 seconds and TCP keep-alive stops
// proxies from silently dropping them.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 5 * 60_000,
  connectionTimeoutMillis: 20_000,
  keepAlive: true,
});
// A dropped idle connection must not crash the process; the pool replaces it on next use.
pool.on('error', (err) => console.error('[db] idle client error', err.message));

/** Opens a few connections up front so the first page load after a start does not pay for them. */
export async function warmPool(n = 3) {
  const clients = await Promise.all(Array.from({ length: Math.min(n, config.dbPoolMax) }, () => pool.connect()));
  clients.forEach((c) => c.release());
}

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
