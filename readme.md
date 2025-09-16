# 🚀 Behalf Chrome Extension - Cloudflare-Native Task Management

A modern Chrome extension that manages browser tasks using a **Cloudflare-native architecture** with D1 database, R2 storage, Durable Objects, and advanced lease management.

## ✨ **Phase 3 Architecture - Complete**

### **🎯 Core Features**
- **🔒 Advanced Lease Management**: Durable Objects with atomic operations and heartbeats
- **📁 R2 Content Storage**: Efficient blob storage for HTML content with flexible submission methods
- **🗄️ D1 Database**: SQLite-compatible serverless database for job metadata and state
- **⚡ Real-time Task Coordination**: Automatic task distribution with priority-based selection
- **🔄 Robust Error Handling**: Comprehensive error recovery and retry mechanisms
- **📊 Statistics & Monitoring**: Real-time analytics and performance tracking

### **🏗️ Architecture Overview**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  Chrome         │    │  Cloudflare      │    │  Storage Layer      │
│  Extension      │    │  Worker          │    │                     │
│                 │    │                  │    │                     │
│ • Auto Polling  │◄──►│ • v2 API         │◄──►│ • D1 Database       │
│ • Task Execution│    │ • Lease Mgmt     │    │ • R2 Blob Storage   │
│ • Content Capture    │ • State Tracking │    │ • Durable Objects   │
│ • Heartbeats    │    │ • Error Handling │    │ • KV (optional)     │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## 🚀 **Quick Start**

### **1. Chrome Extension Setup**

1. **Load the Extension**:
   ```bash
   # Open Chrome and go to chrome://extensions/
   # Enable "Developer mode"
   # Click "Load unpacked" and select this directory
   ```

2. **Configure Worker URL**:
   - Open the extension popup
   - Set your Cloudflare Worker URL
   - Configure Browser ID (unique identifier)

### **2. Cloudflare Worker Deployment**

#### **Prerequisites**
- Cloudflare account (free tier works)
- Wrangler CLI installed globally: `npm install -g wrangler`
- Authenticated with Cloudflare: `wrangler login`

#### **🔄 Automatic Development Deployment (Cloudflare)**
**Cloudflare Workers automatically builds and deploys to development:**
- ✅ **Push to any branch** → Cloudflare builds and deploys to `behalf-task-manager-dev`
- ✅ **Stable and reliable** → Native Cloudflare integration
- ✅ **No GitHub Actions complexity** → Simple and fast
- ✅ **No production impact** → Safe to experiment

#### **📦 Manual Production Deployment**
```bash
# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Deploy to PRODUCTION (manual only)
npm run deploy:prod

# 4. (Optional) Setup D1 database for persistence
npm run setup-d1
```

#### **🧪 Development Commands**
```bash
# Deploy to development manually (same as Cloudflare auto-deploy)
npm run deploy:dev

# Local development server
npm run dev

# Test the deployment
npm test
```

#### **Alternative Deployment Methods**

**Method 1: Using deployment scripts**
```bash
# Simple deployment
./deploy-worker-simple.sh

# Development deployment with environment variables
./deploy-dev.sh

# Full production deployment
./deploy-worker.sh
```

**Method 2: Manual Wrangler commands**
```bash
# Build first
npm run build

# Deploy with specific configuration
wrangler deploy --config wrangler.toml --name behalf-task-manager

# Or deploy with different configs
wrangler deploy --config wrangler-simple.toml  # Simpler version
wrangler deploy --config wrangler-full.toml    # Full features
```

#### **Local Development**
```bash
# Start local development server
npm run dev          # Full version (port 8788)
npm run dev:simple   # Simple version (port 8787)

# Run tests
npm test             # All tests
npm run test:e2e     # End-to-end tests
```

#### **After Deployment**
1. **Get your Worker URL** from the deployment output
2. **Update Chrome extension** with the Worker URL in the popup
3. **Test the connection** using the extension

#### **Environment Configuration**
- Copy `env.example` to `.env` for local development
- Set `DATABASE_URL` for database persistence (optional)
- Configure secrets via: `wrangler secret put DATABASE_URL`

#### **Troubleshooting**
- **Authentication errors**: Run `wrangler login` to authenticate
- **Build errors**: Ensure TypeScript compiles with `npm run build`
- **Deployment fails**: Check your Cloudflare account limits and permissions
- **Durable Objects error**: For first deployment with Durable Objects, use `wrangler deploy` (not `wrangler versions upload`)
- **Worker not responding**: Verify the URL in the extension popup matches your deployed worker
- **Need help?**: Check existing deployment scripts (`deploy-dev.sh`, `deploy-worker-simple.sh`) for examples

---

### **🎯 TL;DR - Deploy in 30 seconds**
```bash
npm install && npm run build && npm run deploy
```
Then update your Chrome extension with the deployed Worker URL. Done! 🚀

## 📋 **API Reference - v2**

### **Core Endpoints**

#### **Create Task**
```http
POST /tasks
Content-Type: application/json

{
  "browserId": "browser_123",
  "taskName": "Get Page HTML",
  "url": "https://example.com",
  "contentType": "resumes",
  "priority": 1
}
```

#### **Lease Tasks**
```http
POST /lease
Content-Type: application/json

{
  "browserId": "browser_123",
  "max": 2
}
```

#### **Heartbeat (Extend Lease)**
```http
POST /heartbeat
Content-Type: application/json

{
  "jobId": "j_abc123",
  "leaseId": "L_xyz789"
}
```

#### **Submit Content**
```http
POST /submit
Content-Type: application/json

# Option A: Inline (small files)
{
  "jobId": "j_abc123",
  "leaseId": "L_xyz789",
  "htmlBase64": "...",
  "contentType": "text/html; charset=utf-8"
}

# Option B: R2 Direct (large files)
{
  "jobId": "j_abc123",
  "leaseId": "L_xyz789",
  "r2Key": "raw/j_abc123.html",
  "size": 1048576,
  "sha256": "..."
}
```

#### **Get Upload URL (for large files)**
```http
GET /upload-url?jobId=j_abc123
```

#### **Check Status**
```http
GET /status/j_abc123
```

#### **Get Artifacts**
```http
GET /artifacts/j_abc123
```

#### **Statistics**
```http
GET /stats
GET /stats?contentType=resumes
```

## 🗄️ **Database Schema (D1)**

### **Jobs Table**
```sql
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  browser_id TEXT NOT NULL,
  task_name TEXT NOT NULL,
  url TEXT NOT NULL,
  content_type TEXT,
  state TEXT NOT NULL, -- queued|leased|fetched|parsed|delivered|failed
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  lease_id TEXT,
  lease_until INTEGER,
  callback_url TEXT,
  callback_secret_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  err TEXT
);
```

### **Artifacts Table**
```sql
CREATE TABLE artifacts (
  job_id TEXT PRIMARY KEY REFERENCES jobs(job_id),
  raw_r2_key TEXT,
  raw_sha256 TEXT,
  raw_bytes INTEGER,
  parsed_r2_key TEXT,
  parsed_sha256 TEXT,
  parsed_bytes INTEGER
);
```

## 🔄 **Task Lifecycle**

```
┌─────────┐    ┌────────┐    ┌─────────┐    ┌─────────┐    ┌───────────┐
│ queued  │───►│ leased │───►│ fetched │───►│ parsed  │───►│ delivered │
└─────────┘    └────────┘    └─────────┘    └─────────┘    └───────────┘
     │              │             │             │              │
     │              │             │             │              │
     ▼              ▼             ▼             ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            failed                                   │
└─────────────────────────────────────────────────────────────────────┘
```

1. **queued**: Task created, waiting for lease
2. **leased**: Browser has leased task, working on it
3. **fetched**: Content submitted to R2, ready for processing
4. **parsed**: External parser has processed content (optional)
5. **delivered**: Webhooks sent successfully (optional)
6. **failed**: Error occurred at any stage

## 🧪 **Testing**

### **Run All Tests**
```bash
npm test
```

### **Individual Test Suites**
```bash
# Phase 1: Basic functionality
node test/test-simple-worker.js

# Phase 2: D1 integration
node test/test-phase2-complete.js

# Phase 3: Advanced features
node test/test-phase3-lease.js
node test/test-r2-working.js
```

### **Test Results**
- ✅ **Phase 1**: 5/5 tests passed - Basic API functionality
- ✅ **Phase 2**: 7/7 tests passed - D1 integration and persistence  
- ✅ **Phase 3A**: 5/6 tests passed - Advanced lease management
- ✅ **Phase 3B**: 3/3 tests passed - R2 storage integration

## 🛠️ **Development**

### **Local Development**
```bash
# Start development servers
npm run dev        # Cloudflare Worker (port 8788)
npm run test:webhook  # Test webhook service (port 3001)

# Run tests
npm run test:e2e   # End-to-end tests
```

### **Project Structure**
```
behalf-chrome-extension/
├── worker/                 # Cloudflare Worker code
│   ├── index-full.ts      # Main worker (Phase 3)
│   ├── do-task-queue-simple.ts  # Durable Object
│   ├── mock-d1.ts         # D1 mock for local dev
│   ├── mock-r2.ts         # R2 mock for local dev
│   └── d1-schema.sql      # Database schema
├── test/                  # Comprehensive test suite
│   ├── test-framework.js  # Test runner
│   ├── webhook-service.js # Mock webhook server
│   └── test-*.js         # Various test suites
├── extension/             # Chrome extension files
│   ├── manifest.json     # Extension manifest
│   ├── popup.html        # Extension popup UI
│   ├── background.js     # Background script
│   └── content.js        # Content script
└── wrangler-*.toml       # Cloudflare configurations
```

## 🔧 **Configuration**

### **Environment Variables**
```toml
# wrangler.toml
[vars]
NODE_ENV = "development"

[[d1_databases]]
binding = "DB"
database_name = "behalf"

[[r2_buckets]]
binding = "R2"
bucket_name = "behalf-ingestion"

[durable_objects]
bindings = [{ name = "TaskQueue", class_name = "TaskQueue" }]
```

## 📊 **Monitoring & Statistics**

### **Key Metrics**
- **Task States**: queued, leased, fetched, parsed, delivered, failed
- **Lease Duration**: Average time tasks are leased
- **Content Size**: Bytes stored per content type
- **Success Rate**: Completion rate by content type
- **Error Tracking**: Failure reasons and retry counts

### **Statistics Endpoint**
```http
GET /stats
{
  "totalJobs": 1250,
  "queuedJobs": 45,
  "leasedJobs": 12,
  "fetchedJobs": 1180,
  "failedJobs": 13,
  "totalArtifacts": 1180,
  "totalBytesStored": 52428800,
  "avgContentSize": 44434
}
```

## 🚀 **Production Deployment**

### **Cloudflare Setup**
1. Create Cloudflare Worker
2. Setup D1 Database
3. Create R2 Bucket
4. Configure Durable Objects
5. Deploy with `wrangler deploy`

### **Chrome Extension Distribution**
1. Package extension for Chrome Web Store
2. Configure production worker URLs
3. Submit for review

## 🔒 **Security**

- **Simple & Practical**: No over-engineered security layers
- **R2 Signed URLs**: Efficient uploads without exposing credentials
- **Optional HMAC**: Webhook signing when needed
- **Rate Limiting**: Built-in Cloudflare protection
- **Input Validation**: Comprehensive request validation

## 📝 **Migration from v1/v2**

If upgrading from older versions:

1. **Database**: Migrate from Postgres to D1
2. **Storage**: Move HTML content to R2
3. **API**: Update to v2 endpoints
4. **Extension**: Update worker URLs

See `CLOUDFLARE_DEPLOYMENT.md` for detailed migration guide.

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch
3. Add comprehensive tests
4. Ensure all tests pass
5. Submit pull request

## 📄 **License**

MIT License - see LICENSE file for details.

---

**Built with ❤️ using Cloudflare's edge computing platform**

*Last updated: Phase 3 Complete - September 2025*