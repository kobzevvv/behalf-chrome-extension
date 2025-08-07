# Behalf Chrome Extension

A Chrome extension that manages browser tasks and communicates with a Cloudflare Worker to execute automated tasks.

## Features

1. **Browser ID Management**: Set and store a unique browser identifier
2. **Task Polling**: Automatically check for tasks at configurable intervals (default: 5 minutes)
3. **Task Execution**: Execute tasks like "Get Page HTML" and report results
4. **Cloudflare Integration**: Communicate with Cloudflare Worker for task management

## Setup Instructions

### 1. Chrome Extension Setup

1. **Load the Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select this directory

2. **Configure Cloudflare Worker URL**:
   - Open `background.js`
   - Update `CLOUDFLARE_WORKER_URL` with your actual Cloudflare Worker URL
   - Example: `const CLOUDFLARE_WORKER_URL = 'https://your-worker.your-subdomain.workers.dev';`

### 2. Database Setup

#### Option A: Automated Setup (Recommended)
1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   - Copy `env.example` to `.env`
   - Add your Neon database connection string to `.env`:
     ```
     DATABASE_URL=postgresql://your-username:your-password@your-host.neon.tech/your-database?sslmode=require
     ```

3. **Run database setup**:
   ```bash
   npm run setup-db
   ```

#### Option B: Manual Setup
Run the SQL commands in `database-setup.sql` in your Neon database console.

#### Table Schema
- **`tasks_ques`**: Stores task requests for browsers
- **`worker_report`**: Stores task execution results
- **Indexes**: Added for better performance
- **Test Data**: Automatically inserted with browser_id "test_browser_id"

### 4. Cloudflare Worker Setup

#### Automated Deployment (Recommended)
1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Deploy Worker** (this will create the Worker and automatically configure everything):
   ```bash
   npm run deploy-worker
   ```

The deployment script will:
- Create the Worker with environment variables (no database binding needed)
- Deploy to Cloudflare
- Automatically detect your Worker URL
- Update the Chrome extension with your Worker URL



#### Manual Setup (Alternative)
See `CLOUDFLARE_DEPLOYMENT.md` for detailed manual setup instructions.

## Usage

### Setting Browser ID
1. Click the extension icon in Chrome toolbar
2. Enter a browser ID (e.g., "test_browser_id")
3. Click "Set Browser ID"
4. The extension will start polling for tasks

### Configuring Task Interval
1. In the extension popup, set the desired interval (30-3600 seconds)
2. Click "Save Interval"
3. The extension will use the new interval for task checking

### Testing Connection
1. Click "Test Connection" to verify communication with Cloudflare Worker
2. Check the status message for success/error feedback

## Task Types

Currently supported:
- **Get Page HTML**: Retrieves the HTML content of a specified URL

## File Structure

```
behalf-chrome-extension/
├── manifest.json              # Extension manifest
├── popup.html                 # Extension popup UI
├── popup.js                   # Popup functionality
├── background.js              # Background service worker
├── content.js                 # Content script
├── cloudflare-worker-example.js # Sample Cloudflare Worker code
└── README.md                 # This file
```

## API Endpoints

### Check Task (`POST /api/check-task`)
**Request:**
```json
{
  "browserId": "test_browser_id"
}
```

**Response:**
```json
{
  "hasTask": true,
  "task": {
    "taskName": "Get Page HTML",
    "paramsJson": {
      "URL": "https://example.com"
    }
  }
}
```

### Report Task (`POST /api/report-task`)
**Request:**
```json
{
  "datime": "2024-01-01T12:00:00Z",
  "taskName": "Get Page HTML",
  "version": "0.1",
  "artifactsJson": {
    "htmlContent": "<html>...</html>"
  }
}
```

**Response:**
```json
{
  "success": true
}
```

## Troubleshooting

### Extension Issues
- Check Chrome's developer console for error messages
- Verify the Cloudflare Worker URL is correct in `background.js`
- Ensure all permissions are granted

### Database Issues
- Verify your Neon database connection string
- Check that tables are created with correct schema
- Ensure Cloudflare Worker has proper database binding

### Task Execution Issues
- Check that the target URL is accessible
- Verify the active tab has proper permissions
- Monitor the extension's background script console

## Development

### Adding New Task Types
1. Add new case in `background.js` `executeTask()` function
2. Implement the task execution logic
3. Update the Cloudflare Worker to handle new task types

### Debugging
- Use Chrome's extension developer tools
- Check background script console in `chrome://extensions/`
- Monitor network requests in browser dev tools

## Security Notes

- The extension requires broad host permissions for task execution
- Consider implementing authentication for production use
- Validate all URLs before navigation
- Sanitize HTML content before processing

## License

This project is for internal use. Please ensure compliance with your organization's policies.