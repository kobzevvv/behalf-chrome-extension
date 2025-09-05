#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

function readDatabaseUrlFromWranglerToml() {
  try {
    const wranglerPath = path.resolve(__dirname, '..', 'wrangler.toml');
    const content = fs.readFileSync(wranglerPath, 'utf8');
    const match = content.match(/DATABASE_URL\s*=\s*"([^"]+)"/);
    if (match && match[1]) return match[1];
  } catch (_) { /* ignore */ }
  return null;
}

async function main() {
  const browserId = process.env.BROWSER_ID || process.argv[2];
  const targetUrl = process.env.TARGET_URL || process.argv[3];

  if (!browserId || !targetUrl) {
    console.error('Usage: BROWSER_ID=... TARGET_URL=... node scripts/enqueue-task.js');
    console.error('   or: node scripts/enqueue-task.js <browserId> <url>');
    process.exit(1);
  }

  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    databaseUrl = readDatabaseUrlFromWranglerToml();
  }

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env or wrangler.toml');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const insertSql = `
    INSERT INTO tasks_ques (browser_id, task, params_json)
    VALUES ($1, $2, $3)
    RETURNING id, created_at
  `;

  try {
    const client = await pool.connect();
    const paramsJson = JSON.stringify({ URL: targetUrl });
    const result = await client.query(insertSql, [browserId, 'Get Page HTML', paramsJson]);
    const row = result.rows[0];
    console.log('✅ Enqueued task:', { id: row.id, browserId, url: targetUrl, created_at: row.created_at });

    const checkSql = 'SELECT id, task, params_json, created_at FROM tasks_ques WHERE id = $1';
    const check = await client.query(checkSql, [row.id]);
    console.log('🔎 Inserted row:', check.rows[0]);
    client.release();
  } catch (err) {
    console.error('❌ Failed to enqueue task:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();


