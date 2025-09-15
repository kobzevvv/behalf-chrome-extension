-- D1 Schema for Cloudflare-native Behalf Extension
-- Normalized design with no dynamic tables

-- Jobs lifecycle table
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  browser_id TEXT NOT NULL,
  task_name TEXT NOT NULL,           -- e.g. "Get Page HTML"
  url TEXT NOT NULL,
  content_type TEXT,                 -- formerly tableName (e.g. "resumes")
  state TEXT NOT NULL,               -- queued|leased|fetched|parsed|delivered|failed
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  lease_id TEXT,
  lease_until INTEGER,               -- epoch ms
  callback_url TEXT,                 -- optional
  callback_secret_id TEXT,           -- optional; resolves to HMAC key
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  error_message TEXT
);

-- Artifact pointers (R2 + checksums + sizes)
CREATE TABLE artifacts (
  job_id TEXT PRIMARY KEY,
  raw_r2_key TEXT,                   -- e.g. raw/j_abcd.html
  raw_sha256 TEXT,
  raw_bytes INTEGER,
  raw_content_type TEXT,             -- MIME type
  parsed_r2_key TEXT,                -- if/when a parser writes back
  parsed_sha256 TEXT,
  parsed_bytes INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

-- Webhook delivery tracking (idempotency & audit)
CREATE TABLE callbacks (
  delivery_id TEXT PRIMARY KEY,      -- UUID
  job_id TEXT NOT NULL,
  phase TEXT NOT NULL,               -- ingested|parsed
  url TEXT NOT NULL,
  status_code INTEGER,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  delivered_at INTEGER,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

-- Job retry tracking
CREATE TABLE job_retries (
  retry_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  retry_attempt INTEGER NOT NULL,
  error_type TEXT NOT NULL,          -- lease_expired, fetch_failed, webhook_failed
  error_details TEXT,
  retry_at INTEGER NOT NULL,         -- when to retry
  created_at INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

-- Performance metrics
CREATE TABLE job_metrics (
  metric_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,         -- fetch_duration, upload_duration, parse_duration
  metric_value REAL NOT NULL,
  recorded_at INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);

-- System configuration
CREATE TABLE system_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  config_type TEXT NOT NULL,         -- string, number, boolean, json
  description TEXT,
  updated_at INTEGER NOT NULL
);

-- API tokens for authentication
CREATE TABLE api_tokens (
  token_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,          -- bcrypt hash
  owner TEXT NOT NULL,               -- service/user identifier
  permissions TEXT NOT NULL,         -- JSON array of allowed operations
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  last_used INTEGER
);

-- Browser authentication
CREATE TABLE browser_auth (
  browser_id TEXT PRIMARY KEY,
  auth_token_hash TEXT NOT NULL,
  tenant_id TEXT,                    -- multi-tenant support
  permissions TEXT,                  -- JSON permissions
  last_seen INTEGER,
  created_at INTEGER NOT NULL
);

-- System health tracking
CREATE TABLE system_health (
  check_id TEXT PRIMARY KEY,
  component TEXT NOT NULL,           -- durable_object, r2, webhook_delivery
  status TEXT NOT NULL,              -- healthy, degraded, down
  last_check INTEGER NOT NULL,
  error_details TEXT
);

-- Retention policies
CREATE TABLE retention_policies (
  policy_id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  raw_retention_days INTEGER NOT NULL,
  parsed_retention_days INTEGER,
  archive_to_cold_storage BOOLEAN DEFAULT false,
  created_at INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX jobs_state_idx ON jobs(state, priority, created_at);
CREATE INDEX jobs_browser_idx ON jobs(browser_id, state, created_at);
CREATE INDEX jobs_lease_idx ON jobs(lease_until) WHERE state = 'leased';
CREATE INDEX jobs_url_idx ON jobs(url, content_type);

CREATE INDEX artifacts_sha256_idx ON artifacts(raw_sha256);
CREATE INDEX artifacts_content_type_idx ON artifacts(raw_content_type);

CREATE INDEX callbacks_job_phase_idx ON callbacks(job_id, phase);
CREATE INDEX callbacks_delivery_status_idx ON callbacks(status_code, attempts);

CREATE INDEX job_retries_schedule_idx ON job_retries(retry_at, error_type);

CREATE INDEX job_metrics_name_time_idx ON job_metrics(metric_name, recorded_at);

CREATE INDEX api_tokens_owner_idx ON api_tokens(owner);
CREATE INDEX browser_auth_tenant_idx ON browser_auth(tenant_id) WHERE tenant_id IS NOT NULL;

-- Insert default configuration
INSERT INTO system_config (config_key, config_value, config_type, description, updated_at) VALUES
('lease_duration_ms', '1800000', 'number', 'Task lease duration (30 min)', strftime('%s', 'now') * 1000),
('max_retries', '3', 'number', 'Max retry attempts per job', strftime('%s', 'now') * 1000),
('webhook_timeout_ms', '30000', 'number', 'Webhook request timeout', strftime('%s', 'now') * 1000),
('max_content_size_bytes', '10485760', 'number', 'Max content size (10MB)', strftime('%s', 'now') * 1000),
('heartbeat_interval_ms', '300000', 'number', 'Heartbeat interval (5 min)', strftime('%s', 'now') * 1000);

-- Insert default retention policies
INSERT INTO retention_policies (policy_id, content_type, raw_retention_days, parsed_retention_days, archive_to_cold_storage, created_at) VALUES
('default', '*', 90, 365, false, strftime('%s', 'now') * 1000),
('test-content', 'test-content', 1, 7, false, strftime('%s', 'now') * 1000),
('resumes', 'resumes', 180, 730, true, strftime('%s', 'now') * 1000);
