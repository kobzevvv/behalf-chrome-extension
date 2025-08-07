# Cloudflare Worker Deployment Guide

This guide will walk you through deploying the Cloudflare Worker for the Behalf Chrome Extension.

## Prerequisites

- Cloudflare account
- Neon database already set up (from previous steps)
- Chrome extension files ready

## Method 1: Cloudflare Dashboard (Recommended)

### Step 1: Create Worker

1. **Access Cloudflare Dashboard**
   - Go to [https://dash.cloudflare.com/](https://dash.cloudflare.com/)
   - Sign in to your account

2. **Navigate to Workers**
   - Click on **Workers & Pages** in the left sidebar
   - Click **Create application**

3. **Create New Worker**
   - Choose **Create Worker**
   - Enter a name: `behalf-task-manager`
   - Click **Deploy**

### Step 2: Configure Database Binding

1. **Access Worker Settings**
   - In your Worker dashboard, click on your Worker name
   - Go to **Settings** tab
   - Click on **Variables** in the left sidebar

2. **Add Database Binding**
   - Scroll down to **D1 databases**
   - Click **Add binding**
   - Set **Variable name** to: `DB`
   - Choose your Neon database from the dropdown
   - Click **Save**

### Step 3: Deploy Worker Code

1. **Access Worker Code**
   - Go to **Settings** → **Triggers**
   - Click **Edit** next to your Worker

2. **Replace Default Code**
   - Delete the default code
   - Copy the entire content from `cloudflare-worker-example.js`
   - Paste it into the editor
   - Click **Save and deploy**

### Step 4: Get Worker URL

1. **Copy Worker URL**
   - After deployment, note your Worker URL
   - Format: `https://behalf-task-manager.your-subdomain.workers.dev`

2. **Update Chrome Extension**
   - Open `background.js`
   - Update line 2 with your Worker URL:
   ```javascript
   const CLOUDFLARE_WORKER_URL = 'https://your-worker.your-subdomain.workers.dev';
   ```

## Method 2: Wrangler CLI

### Step 1: Install Wrangler

```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

### Step 3: Create Worker Project

```bash
# Create a new directory for your worker
mkdir behalf-worker
cd behalf-worker

# Initialize wrangler project
wrangler init behalf-task-manager
cd behalf-task-manager
```

### Step 4: Configure wrangler.toml

Edit `wrangler.toml`:

```toml
name = "behalf-task-manager"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "your-neon-database"
database_id = "your-database-id"
```

### Step 5: Add Worker Code

Create `src/index.js` with the content from `cloudflare-worker-example.js`

### Step 6: Deploy

```bash
wrangler deploy
```

## Testing Your Worker

### Test API Endpoints

1. **Test Check Task Endpoint**:
   ```bash
   curl -X POST https://your-worker.your-subdomain.workers.dev/api/check-task \
     -H "Content-Type: application/json" \
     -d '{"browserId": "test_browser_id"}'
   ```

2. **Test Report Task Endpoint**:
   ```bash
   curl -X POST https://your-worker.your-subdomain.workers.dev/api/report-task \
     -H "Content-Type: application/json" \
     -d '{
       "datime": "2024-01-01T12:00:00Z",
       "taskName": "Get Page HTML",
       "version": "0.1",
       "artifactsJson": {"htmlContent": "<html>test</html>"}
     }'
   ```

## Troubleshooting

### Common Issues

1. **Database Binding Not Working**
   - Ensure the binding name is exactly `DB`
   - Check that your Neon database is properly connected
   - Verify the database has the required tables

2. **CORS Errors**
   - The Worker code includes CORS headers
   - If you still get CORS errors, check your browser's network tab

3. **404 Errors**
   - Ensure the Worker URL is correct in `background.js`
   - Check that the Worker is deployed and running

4. **Database Connection Errors**
   - Verify your Neon database is active
   - Check the database binding configuration
   - Ensure the database has the required permissions

### Debugging

1. **Check Worker Logs**
   - Go to your Worker dashboard
   - Click on **Logs** to see real-time logs

2. **Test Database Connection**
   ```bash
   # Use the test script we created
   npm run test-connection
   ```

3. **Verify Database Tables**
   ```bash
   # Use the verification script
   node verify-test-data.js
   ```

## Security Considerations

- The Worker code includes basic CORS headers
- Consider adding authentication for production use
- Validate all input data in the Worker
- Use environment variables for sensitive configuration

## Next Steps

After deploying your Worker:

1. **Update Chrome Extension**: Set the Worker URL in `background.js`
2. **Load Extension**: Go to `chrome://extensions/` and load the extension
3. **Test**: Set browser_id to "test_browser_id" and test the connection
4. **Monitor**: Check Worker logs for any issues

Your Cloudflare Worker should now be ready to handle requests from the Chrome extension!
