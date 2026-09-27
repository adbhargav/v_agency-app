import { query } from '../db/pool.js';
import { money } from '../lib/serialize.js';

/**
 * Team earnings = wallet credits + salary records.
 * Pending = wallet credits not settled + salary not yet settled.
 */
export async function financeSummary() {
  const { rows } = await query(`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions) + (SELECT COALESCE(SUM(amount), 0) FROM salary_records) AS total,
      (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE status = 'pending')
        + (SELECT COALESCE(SUM(amount), 0) FROM salary_records WHERE status <> 'settled') AS pending,
      (SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions WHERE status = 'settled')
        + (SELECT COALESCE(SUM(amount), 0) FROM salary_records WHERE status = 'settled') AS settled`);
  return { totalEarnings: money(rows[0].total), pendingSettlement: money(rows[0].pending), totalSettled: money(rows[0].settled) };
}

export async function walletBalance(userId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending,
            COALESCE(SUM(amount) FILTER (WHERE status = 'settled'), 0) AS settled
       FROM wallet_transactions WHERE employee_id = $1`,
    [userId],
  );
  return { pending: money(rows[0].pending), settled: money(rows[0].settled) };
}
