#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function readDatabaseUrlFromWranglerToml() {
  try {
    const wranglerPath = path.resolve(__dirname, '..', 'wrangler.toml');
    const content = fs.readFileSync(wranglerPath, 'utf8');
    const match = content.match(/DATABASE_URL\s*=\s*"([^"]+)"/);
    if (match && match[1]) return match[1];
  } catch (_) {}
  return null;
}

async function main() {
  const browserId = (process.env.BROWSER_ID || 'test_browser_id').trim();
  const retainHours = parseInt(process.env.RETAIN_HOURS || '0', 10);
  const now = new Date();
  const cutoff = retainHours > 0 ? new Date(now.getTime() - retainHours * 3600 * 1000) : null;

  let databaseUrl = process.env.DATABASE_URL || readDatabaseUrlFromWranglerToml();
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env or wrangler.toml');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const params = [browserId];
    let whereTime = '';
    if (cutoff) {
      params.push(cutoff.toISOString());
      whereTime = ' AND t.created_at < $2';
    }

    // Delete reports linked to the test tasks
    const deleteReportsSql = `
      DELETE FROM worker_report r
      USING tasks_ques t
      WHERE r.task_id = t.id AND t.browser_id = $1${whereTime}
    `;
    const resReports = await client.query(deleteReportsSql, params);

    // Delete the test tasks themselves
    const deleteTasksSql = `
      DELETE FROM tasks_ques t
      WHERE t.browser_id = $1${whereTime}
    `;
    const resTasks = await client.query(deleteTasksSql, params);

    await client.query('COMMIT');
    console.log('🧹 Purge completed:', {
      browserId,
      retainHours,
      deletedReports: resReports.rowCount,
      deletedTasks: resTasks.rowCount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Purge failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();


