## Get Page HTML usage guide

### Overview
This guide explains how another service can trigger the Chrome extension to open a URL, capture the page HTML, and store the result. The extension polls a Cloudflare Worker, which reads a Neon Postgres table for queued tasks.

### Components and flow
- Extension polls `POST {WORKER_URL}/api/check-task` with a `browserId`.
- Worker queries Neon table `tasks_ques` for a row with that `browser_id`.
- If a task exists and `Task = "Get Page HTML"`, with `Params_json = { "URL": "..." }`, the extension:
  - Opens the URL in a background tab
  - Captures `document.documentElement.outerHTML`
  - Reports result to `POST {WORKER_URL}/api/report-task`
- Worker writes the result into `worker_report.artifacts_json`.

Relevant code in this repo:
- `background.js` (extension logic: polling, executing Get Page HTML, reporting)
- `src/worker.js` (Cloudflare Worker: check-task/report-task using Neon HTTP SQL)
- `database-setup.sql` (schema for `tasks_ques`, `worker_report`)

### Prerequisites
- Cloudflare Worker deployed and reachable at your `{WORKER_URL}`.
- Neon Postgres database with tables created from `database-setup.sql`.
- Extension installed via `chrome://extensions` and configured with a known `browserId` in the popup. Ensure `background.js` constant `CLOUDFLARE_WORKER_URL` points to your worker URL.

### Quick setup (once)
1) Database
- Run `database-setup.sql` against your Neon database.

2) Worker
- Deploy `src/worker.js` with `wrangler` and set `DATABASE_URL` as an env var (see `wrangler.toml`).

3) Extension
- Load unpacked extension and set a `browserId` in the popup.
- Optional: Adjust polling interval (default 300 seconds).

### Queue a "Get Page HTML" task
Insert into `tasks_ques` for the intended `browserId`. The extension will pick it up on its next poll.

SQL
```sql
INSERT INTO tasks_ques (browser_id, Task, Params_json)
VALUES (
  'your_browser_id_here',
  'Get Page HTML',
  '{"URL":"https://example.com"}'
);
```

Node.js (pg)
```javascript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function queueGetPageHtmlTask(browserId, url) {
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO tasks_ques (browser_id, Task, Params_json) VALUES ($1, $2, $3)',
      [browserId, 'Get Page HTML', JSON.stringify({ URL: url })]
    );
  } finally {
    client.release();
  }
}
```

Tip: This design does not remove rows from `tasks_ques`. If you need one-time processing, consider deleting or marking tasks as processed after you observe a corresponding report (see below).

### Read the result
The extension reports to the worker, which inserts into `worker_report`. The HTML is stored as JSON under `artifacts_json.htmlContent`.

SQL
```sql
SELECT datime, task_name, artifacts_json
FROM worker_report
WHERE task_name = 'Get Page HTML'
ORDER BY datime DESC
LIMIT 1;
```

Node.js (pg)
```javascript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function getLatestHtmlResult() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT datime, task_name, artifacts_json
       FROM worker_report
       WHERE task_name = 'Get Page HTML'
       ORDER BY datime DESC
       LIMIT 1`
    );
    if (!rows.length) return null;
    const artifact = JSON.parse(rows[0].artifacts_json);
    return { datime: rows[0].datime, htmlContent: artifact.htmlContent };
  } finally {
    client.release();
  }
}
```

### API schemas (for reference only)
Check task (extension → worker):
```http
POST {WORKER_URL}/api/check-task
Content-Type: application/json

{ "browserId": "your_browser_id_here" }
```

Worker response when a task exists:
```json
{
  "hasTask": true,
  "task": {
    "taskName": "Get Page HTML",
    "paramsJson": { "URL": "https://example.com" }
  }
}
```

Report task (extension → worker):
```http
POST {WORKER_URL}/api/report-task
Content-Type: application/json

{
  "datime": "2024-01-01T12:00:00Z",
  "taskName": "Get Page HTML",
  "version": "0.1",
  "artifactsJson": { "htmlContent": "<html>...</html>" }
}
```

### Notes and limits
- Poll interval defaults to 300s; you may reduce in the extension popup for faster pickup (minimum 30s in UI).
- The report table does not currently include `browser_id` or a task id. If you need correlation, add columns or conventions in your service (for example, embed a correlation id inside `artifactsJson`).
- The extension requires broad host permissions (allowed by default manifest). Ensure target URLs are reachable without login prompts.
- If the same row remains in `tasks_ques`, the worker may continue to offer it on subsequent polls. Manage task lifecycle on your side.

### Troubleshooting
- Verify `CLOUDFLARE_WORKER_URL` in `background.js` matches your deployed worker URL.
- Ensure `DATABASE_URL` is present in the worker environment (see `wrangler.toml`).
- Use the extension popup "Test Connection" to confirm worker reachability.
- Check worker logs in Cloudflare and extension background console in `chrome://extensions`.


