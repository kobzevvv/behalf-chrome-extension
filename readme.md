# Behalf Chrome Extension (Enhanced Multi-Table)

A powerful Chrome extension that manages browser tasks and communicates with a Cloudflare Worker to execute automated content extraction with multi-table database storage support.

## ✨ Enhanced Features

### Core Functionality
1. **Browser ID Management**: Set and store a unique browser identifier
2. **Auto Polling**: Starts immediately and continues reliably (uses chrome.alarms)
3. **Task Execution**: Execute tasks like "Get Page HTML" and report results
4. **Join-based Flow**: Pending tasks are selected via LEFT JOIN on `task_completions.task_id` (no deletes)
5. **Cloudflare Integration**: Communicate with Cloudflare Worker for task management

### 🚀 NEW: Multi-Table Content Extraction
6. **Dynamic Table Creation**: Automatically creates content tables based on extraction type
7. **Content Type Separation**: Store different content types in dedicated tables (resumes, search results, etc.)
8. **Content Deduplication**: SHA-256 hash-based duplicate prevention
9. **Enhanced Task Tracking**: Detailed completion tracking with performance metrics
10. **Statistics & Monitoring**: Real-time statistics for tasks and content tables

### Database Schema
- **Enhanced Schema**: `behalf_chrome_extension` schema with organized table structure
- **Dynamic Tables**: Pattern `page_html_{table_name}` for content storage
- **Task Queue**: Enhanced `tasks_queue` table with URL and table routing
- **Completion Tracking**: Detailed `task_completions` table with status and metrics

## Setup Instructions

### 1. Chrome Extension Setup

1. **Load the Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select this directory

2. **Configure Cloudflare Worker URL**:
   - Open `background.js`
   - Update `CLOUDFLARE_WORKER_URL` with your actual Cloudflare Worker URL (dev or prod)
   - Example (prod): `const CLOUDFLARE_WORKER_URL = 'https://behalf-task-manager-production.dev-a96.workers.dev';`
   - Example (dev):  `const CLOUDFLARE_WORKER_URL = 'https://behalf-task-manager-development.dev-a96.workers.dev';`

### 2. Enhanced Database Setup

#### Automated Setup (Recommended)
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

3. **Run enhanced database migration**:
   ```bash
   node run-database-migration.js
   ```

#### Enhanced Database Schema (`behalf_chrome_extension` schema)

##### Core Tables
- **`behalf_chrome_extension.tasks_queue`**: Enhanced task requests with URL and table routing
  - `id`, `browser_id`, `task_name`, `url_to_extract`, `table_name`, `params_json`, `created_datetime`, `updated_datetime`
  
- **`behalf_chrome_extension.task_completions`**: Detailed completion tracking
  - `id`, `task_id`, `completed_datetime`, `extraction_table`, `record_count`, `status`, `error_message`, `processing_duration_ms`

##### Dynamic Content Tables
- **Pattern**: `behalf_chrome_extension.page_html_{table_name}`
- **Examples**: 
  - `page_html_default` - Default content storage
  - `page_html_resumes` - Resume pages
  - `page_html_search_results` - Search result pages
  - `page_html_job_listings` - Job listing pages

##### Content Table Schema
Each content table contains:
- `id`, `task_id`, `url`, `html_content`, `title`, `meta_description`
- `extracted_datetime`, `content_hash` (for deduplication), `content_size_bytes`, `extraction_metadata`

##### Performance Features
- **Indexes**: Optimized for task lookups, content queries, and date ranges
- **Deduplication**: SHA-256 content hashing prevents duplicate storage
- **Metrics**: Processing time tracking and completion statistics

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
4. The extension will start polling for tasks automatically (no need to press Test)

### Configuring Task Interval
1. In the extension popup, set the desired interval (30-3600 seconds)
2. Click "Save Interval"
3. The extension will use the new interval for task checking

### Testing Connection (optional)
1. Click "Test Connection" to verify communication with Cloudflare Worker
2. Check the status message for success/error feedback

## Enhanced Task Types & Content Extraction

### Content Extraction with Table Routing
- **Get Page HTML**: Retrieves and stores HTML content in specified content tables
- **Multi-Type Support**: Route different content types to dedicated storage tables

### Common Use Cases
1. **Resume Extraction**: `tableName: "resumes"` → stored in `page_html_resumes`
2. **Search Results**: `tableName: "search_results"` → stored in `page_html_search_results`  
3. **Job Listings**: `tableName: "job_listings"` → stored in `page_html_job_listings`
4. **Company Profiles**: `tableName: "company_profiles"` → stored in `page_html_company_profiles`
5. **Default**: No table specified → stored in `page_html_default`

### Content Processing Features
- **Automatic Table Creation**: Tables are created dynamically as needed
- **Content Deduplication**: Duplicate content is automatically detected and skipped
- **Metadata Extraction**: Page titles and descriptions are extracted automatically
- **Performance Tracking**: Processing times and success rates are monitored

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

## 🚀 Enhanced API Endpoints

### Check Task (`POST /api/check-task`) ✨ Enhanced
**Request:**
```json
{
  "browserId": "test_browser_id"
}
```

**Enhanced Response:**
```json
{
  "hasTask": true,
  "task": {
    "taskId": 123,
    "taskName": "Get Page HTML",
    "urlToExtract": "https://example.com/resume",
    "tableName": "resumes",
    "paramsJson": {
      "includeImages": false,
      "extractLinks": true
    }
  }
}
```

### 🆕 Enhanced Enqueue with Table Routing (`GET /api/enqueue-get-page-html`)
Enqueue tasks with multi-table support via URL parameters.

**Enhanced Parameters:**
- `browserId` (required)
- `url` (required) - page to fetch
- `tableName` (optional) - target content table (defaults to "default")

**Examples:**
```bash
# Store in resumes table
GET /api/enqueue-get-page-html?browserId=browser_123&url=https%3A%2F%2Fexample.com%2Fresume&tableName=resumes

# Store in search results table  
GET /api/enqueue-get-page-html?browserId=browser_123&url=https%3A%2F%2Fexample.com%2Fsearch&tableName=search_results

# Default table (no tableName specified)
GET /api/enqueue-get-page-html?browserId=browser_123&url=https%3A%2F%2Fexample.com
```

**Enhanced Response:**
```json
{
  "success": true,
  "id": 123,
  "browserId": "browser_123",
  "url": "https://example.com/resume", 
  "tableName": "resumes",
  "message": "Task queued for table: page_html_resumes"
}
```

### 🆕 Advanced Task Queueing (`POST /api/enqueue-task`)
Full-featured task queueing with JSON payload.

**Request:**
```json
{
  "browserId": "browser_123",
  "taskName": "Get Page HTML", 
  "urlToExtract": "https://example.com/resume",
  "tableName": "resumes",
  "additionalParams": {
    "includeImages": false,
    "extractLinks": true,
    "extractStructuredData": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "taskId": 123,
  "browserId": "browser_123",
  "taskName": "Get Page HTML",
  "urlToExtract": "https://example.com/resume",
  "tableName": "resumes", 
  "createdDateTime": "2024-01-01T12:00:00Z",
  "message": "Task queued for extraction to table: page_html_resumes"
}
```

### Enhanced Report Task (`POST /api/report-task`) ✨ Enhanced
**Request:**
```json
{
  "taskId": 123,
  "datime": "2024-01-01T12:00:00Z",
  "taskName": "Get Page HTML",
  "version": "2.0",
  "artifactsJson": {
    "HTML content": "<html><head><title>Resume</title></head><body>...</body></html>",
    "title": "John Doe Resume",
    "extractedAt": "2024-01-01T12:00:00Z"
  },
  "tableName": "resumes"
}
```

**Enhanced Response:**
```json
{
  "success": true,
  "recordId": 456,
  "tableName": "resumes", 
  "recordCount": 1,
  "processingTime": 150,
  "contentHash": "abc123...",
  "message": "Content stored in table: resumes"
}
```

### 🆕 Statistics & Monitoring (`GET /api/stats`)
Real-time statistics for tasks and content tables.

**Parameters:**
- `tableName` (optional) - get stats for specific content table
- `since` (optional) - filter tasks since date (ISO format)

**Examples:**
```bash
# General statistics
GET /api/stats

# Table-specific statistics  
GET /api/stats?tableName=resumes

# Statistics since specific date
GET /api/stats?since=2024-01-01T00:00:00Z&tableName=resumes
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "tasks": {
      "total_tasks": "150",
      "completed_tasks": "142", 
      "failed_tasks": "3",
      "pending_tasks": "5",
      "avg_processing_time_ms": "85.5"
    },
    "content": {
      "tableName": "resumes",
      "total_records": "87",
      "unique_urls": "85", 
      "avg_content_size": "15420",
      "last_extraction": "2024-01-01T11:45:00Z",
      "first_extraction": "2023-12-01T10:00:00Z"
    }
  },
  "generatedAt": "2024-01-01T12:00:00Z"
}

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

## 🧪 Testing Enhanced Functionality

### Automated Test Suite
Run comprehensive tests for all enhanced features:
```bash
# Test all enhanced functionality
node test-enhanced-functionality.js

# Run database migration
node run-database-migration.js

# Fix database constraints (if needed)
node fix-unique-constraint.js
```

### Manual Testing Examples

#### 1. Test Multi-Table Content Extraction
```bash
# Queue resume extraction
curl "https://behalf-task-manager-production.dev-a96.workers.dev/api/enqueue-get-page-html?browserId=test_123&url=https%3A%2F%2Fexample.com%2Fresume&tableName=resumes"

# Queue search results extraction  
curl "https://behalf-task-manager-production.dev-a96.workers.dev/api/enqueue-get-page-html?browserId=test_123&url=https%3A%2F%2Fexample.com%2Fsearch&tableName=search_results"

# Check for pending tasks
curl -X POST "https://behalf-task-manager-production.dev-a96.workers.dev/api/check-task" \
  -H "Content-Type: application/json" \
  -d '{"browserId": "test_123"}'
```

#### 2. Test Statistics & Monitoring
```bash
# Get general statistics
curl "https://behalf-task-manager-production.dev-a96.workers.dev/api/stats"

# Get resume table statistics
curl "https://behalf-task-manager-production.dev-a96.workers.dev/api/stats?tableName=resumes"

# Get statistics since yesterday
curl "https://behalf-task-manager-production.dev-a96.workers.dev/api/stats?since=2024-01-01T00:00:00Z"
```

#### 3. Test Advanced Task Queueing
```bash
curl -X POST "https://behalf-task-manager-production.dev-a96.workers.dev/api/enqueue-task" \
  -H "Content-Type: application/json" \
  -d '{
    "browserId": "test_123",
    "taskName": "Get Page HTML",
    "urlToExtract": "https://example.com/job-listing",
    "tableName": "job_listings",
    "additionalParams": {
      "includeImages": false,
      "extractLinks": true,
      "extractStructuredData": true
    }
  }'
```

## Enhanced Data Management

### Content Tables by Use Case
```sql
-- Resume extraction data
SELECT * FROM behalf_chrome_extension.page_html_resumes 
ORDER BY extracted_datetime DESC LIMIT 10;

-- Search results data
SELECT url, title, extracted_datetime 
FROM behalf_chrome_extension.page_html_search_results
WHERE extracted_datetime >= NOW() - INTERVAL '24 hours';

-- Content deduplication check
SELECT content_hash, COUNT(*) as duplicate_count
FROM behalf_chrome_extension.page_html_default
GROUP BY content_hash 
HAVING COUNT(*) > 1;
```

### Performance Monitoring
```sql
-- Task completion statistics
SELECT 
  extraction_table,
  COUNT(*) as total_completions,
  AVG(processing_duration_ms) as avg_processing_time,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
FROM behalf_chrome_extension.task_completions
WHERE completed_datetime >= NOW() - INTERVAL '24 hours'
GROUP BY extraction_table;

-- Content growth by table
SELECT 
  'page_html_resumes' as table_name,
  COUNT(*) as record_count,
  AVG(content_size_bytes) as avg_size
FROM behalf_chrome_extension.page_html_resumes
UNION ALL
SELECT 
  'page_html_search_results' as table_name,
  COUNT(*) as record_count, 
  AVG(content_size_bytes) as avg_size
FROM behalf_chrome_extension.page_html_search_results;
```

### Cleaning Enhanced Data
```bash
# Clear test data from all tables
BROWSER_ID=test_browser_id node scripts/clear-test-data.js

# Clear specific content table
# (Note: This would need to be implemented as needed)
```

## 🛠️ Enhanced Development

### Adding New Content Types
1. **Define Content Table**: Choose a descriptive `tableName` (e.g., "product_pages", "news_articles")
2. **Queue Tasks**: Use the enhanced API with your new `tableName`
3. **Automatic Setup**: Tables and indexes are created automatically on first use
4. **Custom Processing**: Add specific extraction logic in the worker if needed

Example for product pages:
```javascript
// Queue product extraction
await fetch('/api/enqueue-task', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    browserId: 'scraper_001',
    taskName: 'Get Page HTML',
    urlToExtract: 'https://shop.example.com/product/123',
    tableName: 'product_pages',
    additionalParams: {
      extractPricing: true,
      extractReviews: true
    }
  })
});
```

### Content Processing Customization
Modify `ContentExtractionService` in `src/worker.js` to add:
- **Custom Metadata**: Extract specific data from different page types
- **Content Validation**: Add business rules for content acceptance
- **Processing Hooks**: Add custom logic before/after storage

### Enhanced Debugging
```bash
# Monitor worker logs
wrangler tail behalf-task-manager-production

# Test database connection
node -e "console.log('DB URL:', process.env.DATABASE_URL?.substring(0,50))"

# Validate schema
node run-database-migration.js

# Test specific functionality
node test-enhanced-functionality.js
```

### Performance Optimization
- **Content Size Monitoring**: Track `content_size_bytes` to identify large pages
- **Processing Time**: Monitor `processing_duration_ms` for optimization opportunities  
- **Deduplication Rate**: Check duplicate content prevention effectiveness
- **Table Growth**: Monitor table sizes and consider archiving strategies

### Advanced Configuration
```javascript
// Custom table naming strategy
const sanitizedName = utils.sanitizeTableName(tableName);
// Results in: page_html_{sanitized_name}

// Content hash generation
const contentHash = await utils.generateContentHash(htmlContent);
// SHA-256 hash for deduplication

// Metadata extraction
const metadata = utils.extractHtmlMetadata(htmlContent);
// Extracts title, meta description automatically
```

## 🔒 Enhanced Security & Best Practices

### Security Considerations
- **Host Permissions**: Extension requires broad permissions for multi-site extraction
- **Content Validation**: All URLs are validated before processing
- **SQL Injection Prevention**: All queries use parameterized statements
- **Table Name Sanitization**: Dynamic table names are sanitized to prevent injection
- **Content Size Limits**: Monitor content size to prevent memory issues
- **Deduplication**: Content hashing prevents storage bloat

### Production Recommendations
1. **Authentication**: Add API tokens for production endpoints
2. **Rate Limiting**: Implement request limits per browser ID
3. **Content Monitoring**: Set alerts for unusual content patterns
4. **Table Management**: Regular cleanup of old content tables
5. **Performance Monitoring**: Track processing times and failure rates

### Database Security
```sql
-- Recommended: Create read-only user for statistics
CREATE USER analytics_readonly WITH PASSWORD 'secure_password';
GRANT USAGE ON SCHEMA behalf_chrome_extension TO analytics_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA behalf_chrome_extension TO analytics_readonly;

-- Monitor table sizes
SELECT 
  schemaname, 
  tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'behalf_chrome_extension'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Content Privacy
- **Data Retention**: Implement policies for content cleanup
- **Sensitive Content**: Be aware of PII in extracted content
- **Compliance**: Ensure extraction complies with site terms of service
- **Content Encryption**: Consider encrypting sensitive extracted data

## 📊 Monitoring & Analytics

### Key Metrics to Track
1. **Task Success Rate**: `completed_tasks / total_tasks`
2. **Processing Performance**: Average `processing_duration_ms`
3. **Content Deduplication**: Duplicate detection effectiveness
4. **Table Growth**: Storage usage by content type
5. **Error Patterns**: Common failure reasons

### Recommended Dashboards
```sql
-- Daily extraction summary
SELECT 
  DATE(completed_datetime) as date,
  extraction_table,
  COUNT(*) as extractions,
  AVG(processing_duration_ms) as avg_time,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failures
FROM behalf_chrome_extension.task_completions
WHERE completed_datetime >= NOW() - INTERVAL '30 days'
GROUP BY DATE(completed_datetime), extraction_table
ORDER BY date DESC, extraction_table;

-- Content type distribution
SELECT 
  REPLACE(table_name, 'page_html_', '') as content_type,
  COUNT(*) as records,
  pg_size_pretty(pg_total_relation_size('behalf_chrome_extension.' || table_name)) as size
FROM information_schema.tables
WHERE table_schema = 'behalf_chrome_extension' 
  AND table_name LIKE 'page_html_%'
GROUP BY table_name;
```

## License

This project is for internal use. Please ensure compliance with your organization's policies.