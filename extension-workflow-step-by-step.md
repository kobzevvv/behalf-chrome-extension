## Extension workflow (step-by-step)

### Preconditions
- The extension is already installed and enabled in the browser.
- A `browserId` is configured in the extension popup and shared with the developer/service that queues tasks.
- The Cloudflare Worker is deployed and reachable at your configured `{WORKER_URL}`.
- Neon Postgres database has the tables from `database-setup.sql` (`tasks_ques`, `worker_report`).
- The browser must be open for the extension to run and capture pages.

### What runs where
- Browser extension background script (`background.js`): polls for tasks, executes them, sends results.
- Cloudflare Worker (`src/worker.js`): exposes `/api/check-task` and `/api/report-task`, reads/writes to Neon.
- Neon Postgres: stores task queue (`tasks_ques`) and results (`worker_report`).

### Runtime flow
1) Initialization
   - When the browser starts or the extension is installed, the background script loads `browserId` and polling interval from storage.
   - Default polling interval is 300 seconds (configurable in the popup).

2) Poll for a task
   - On each interval (or when the user clicks “Run Tasks Now” in the popup), the extension calls:
     - `POST {WORKER_URL}/api/check-task` with body `{ "browserId": "<your_browser_id>" }`.

3) Worker reads queue
   - The worker queries Neon:
     - `SELECT * FROM tasks_ques WHERE browser_id = $1 LIMIT 1`.
   - If a row exists, it responds with `{ hasTask: true, task: { taskName, paramsJson } }`.
   - If no row exists, it responds `{ hasTask: false }`.

4) Execute task in the browser
   - If `taskName` is `Get Page HTML`, the extension:
     - Opens the URL from `paramsJson.URL` in a background tab (not focused).
     - Waits for the page to finish loading.
     - Captures `document.documentElement.outerHTML`.

5) Report results
   - The extension posts results to the worker:
     - `POST {WORKER_URL}/api/report-task` with body:
       - `{ datime: isoString, taskName: "Get Page HTML", version: "0.1", artifactsJson: { htmlContent: "<html>..." } }`.
   - The worker inserts a row into `worker_report` with the JSON payload in `artifacts_json`.

6) Consume results (your service)
   - Your service can read from `worker_report` and parse `artifacts_json.htmlContent` to get the full captured HTML.

### Operational notes
- Browser must be open: the extension runs in the browser context; it cannot capture pages if the browser is closed.
- Poll interval: use the popup UI to set how often the extension checks for tasks (30–3600 seconds).
- Task lifecycle: the current design does not delete or mark `tasks_ques` rows. Manage lifecycle on your side (e.g., delete rows after processing or include a correlation id in `artifactsJson`).
- Permissions: the extension manifest allows all HTTP/HTTPS host permissions by default; ensure target URLs are reachable.
- Manual trigger: the popup has a “Run Tasks Now” button to bypass waiting for the next interval (still uses the same API flow).
- Error handling: failures are logged in the extension background console and worker logs; worker returns standard JSON errors.

### How to trigger from another service
1) Insert a task into `tasks_ques` for the intended `browserId` with `Task = 'Get Page HTML'` and `Params_json = { "URL": "https://..." }`.
2) The extension will pick it up on the next poll and write the result to `worker_report`.
3) Read the latest `worker_report` entry and parse `artifacts_json.htmlContent`.

See `get-page-usage-guide.md` for ready-to-copy SQL and Node.js snippets.

### Monitoring and troubleshooting
- Extension side:
  - Go to `chrome://extensions`, open the extension’s background page console to view logs.
  - Use the popup “Test Connection” to verify the worker is reachable.
  - Use “Run Tasks Now” to execute immediately with the current `browserId`.
- Worker side:
  - Check Cloudflare Worker logs for `/api/check-task` and `/api/report-task` requests and database operations.
- Database side:
  - Verify tables exist and contain expected rows; confirm `DATABASE_URL` is correctly configured for the worker.


