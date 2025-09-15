-- Enhanced Database Migration for Behalf Chrome Extension
-- This creates the new schema-based architecture with multi-table support
-- SAFE: Uses IF NOT EXISTS and preserves existing data

-- Create dedicated schema for the extension
CREATE SCHEMA IF NOT EXISTS behalf_chrome_extension;

-- Grant necessary permissions on schema
-- Note: You may need to adjust the user/role name based on your setup
-- GRANT USAGE ON SCHEMA behalf_chrome_extension TO your_user;
-- GRANT CREATE ON SCHEMA behalf_chrome_extension TO your_user;

-- ==============================================
-- ENHANCED TASK QUEUE TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS behalf_chrome_extension.tasks_queue (
    id SERIAL PRIMARY KEY,
    browser_id VARCHAR(255) NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    url_to_extract TEXT NOT NULL,
    table_name VARCHAR(100) DEFAULT 'default',
    params_json TEXT,
    created_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- TASK COMPLETIONS TRACKING TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS behalf_chrome_extension.task_completions (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES behalf_chrome_extension.tasks_queue(id),
    completed_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    extraction_table VARCHAR(100) NOT NULL,
    record_count INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'completed',
    error_message TEXT,
    processing_duration_ms INTEGER
);

-- ==============================================
-- DEFAULT CONTENT TABLE
-- ==============================================
CREATE TABLE IF NOT EXISTS behalf_chrome_extension.page_html_default (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES behalf_chrome_extension.tasks_queue(id),
    url TEXT NOT NULL,
    html_content TEXT NOT NULL,
    title VARCHAR(500),
    meta_description TEXT,
    extracted_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    content_hash VARCHAR(64) UNIQUE,
    content_size_bytes INTEGER,
    extraction_metadata JSONB
);

-- ==============================================
-- INDEXES FOR PERFORMANCE
-- ==============================================

-- Task queue indexes
CREATE INDEX IF NOT EXISTS idx_tasks_queue_browser_id ON behalf_chrome_extension.tasks_queue(browser_id);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_created_datetime ON behalf_chrome_extension.tasks_queue(created_datetime);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_table_name ON behalf_chrome_extension.tasks_queue(table_name);

-- Task completions indexes
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id ON behalf_chrome_extension.task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_completed_datetime ON behalf_chrome_extension.task_completions(completed_datetime);
CREATE INDEX IF NOT EXISTS idx_task_completions_status ON behalf_chrome_extension.task_completions(status);

-- Default content table indexes
CREATE INDEX IF NOT EXISTS idx_page_html_default_task_id ON behalf_chrome_extension.page_html_default(task_id);
CREATE INDEX IF NOT EXISTS idx_page_html_default_url ON behalf_chrome_extension.page_html_default(url);
CREATE INDEX IF NOT EXISTS idx_page_html_default_content_hash ON behalf_chrome_extension.page_html_default(content_hash);
CREATE INDEX IF NOT EXISTS idx_page_html_default_extracted_datetime ON behalf_chrome_extension.page_html_default(extracted_datetime);

-- ==============================================
-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES
-- ==============================================

-- Function to update updated_datetime
CREATE OR REPLACE FUNCTION behalf_chrome_extension.update_updated_datetime_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_datetime = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for tasks_queue
DROP TRIGGER IF EXISTS update_tasks_queue_updated_datetime ON behalf_chrome_extension.tasks_queue;
CREATE TRIGGER update_tasks_queue_updated_datetime 
    BEFORE UPDATE ON behalf_chrome_extension.tasks_queue 
    FOR EACH ROW 
    EXECUTE FUNCTION behalf_chrome_extension.update_updated_datetime_column();

-- ==============================================
-- MIGRATION FROM EXISTING TABLES (OPTIONAL)
-- ==============================================

-- Migrate existing tasks_ques data to new schema
-- This preserves existing data while moving to the new structure
INSERT INTO behalf_chrome_extension.tasks_queue (browser_id, task_name, url_to_extract, table_name, params_json, created_datetime)
SELECT 
    browser_id,
    task as task_name,
    COALESCE(
        (params_json::jsonb->>'URL')::text,
        (params_json::jsonb->>'url')::text,
        'https://example.com'
    ) as url_to_extract,
    'default' as table_name,
    params_json,
    created_at as created_datetime
FROM tasks_ques 
WHERE NOT EXISTS (
    SELECT 1 FROM behalf_chrome_extension.tasks_queue 
    WHERE behalf_chrome_extension.tasks_queue.browser_id = tasks_ques.browser_id 
    AND behalf_chrome_extension.tasks_queue.created_datetime = tasks_ques.created_at
)
ON CONFLICT DO NOTHING;

-- Migrate existing worker_report data to new schema
-- Extract HTML content from artifacts_json and store in page_html_default
INSERT INTO behalf_chrome_extension.page_html_default (task_id, url, html_content, title, extracted_datetime, extraction_metadata)
SELECT 
    wr.task_id,
    COALESCE(
        (tq.params_json::jsonb->>'URL')::text,
        (tq.params_json::jsonb->>'url')::text,
        'https://example.com'
    ) as url,
    COALESCE(
        (wr.artifacts_json::jsonb->>'HTML content')::text,
        (wr.artifacts_json::jsonb->>'html')::text,
        'No HTML content found'
    ) as html_content,
    COALESCE(
        (wr.artifacts_json::jsonb->>'title')::text,
        'No title'
    ) as title,
    wr.datime as extracted_datetime,
    wr.artifacts_json::jsonb as extraction_metadata
FROM worker_report wr
JOIN behalf_chrome_extension.tasks_queue tq ON tq.id = wr.task_id
WHERE NOT EXISTS (
    SELECT 1 FROM behalf_chrome_extension.page_html_default 
    WHERE behalf_chrome_extension.page_html_default.task_id = wr.task_id
)
ON CONFLICT DO NOTHING;

-- Create corresponding task_completions records
INSERT INTO behalf_chrome_extension.task_completions (task_id, extraction_table, record_count, status, completed_datetime)
SELECT 
    wr.task_id,
    'page_html_default' as extraction_table,
    1 as record_count,
    'completed' as status,
    wr.datime as completed_datetime
FROM worker_report wr
WHERE EXISTS (
    SELECT 1 FROM behalf_chrome_extension.tasks_queue 
    WHERE behalf_chrome_extension.tasks_queue.id = wr.task_id
)
AND NOT EXISTS (
    SELECT 1 FROM behalf_chrome_extension.task_completions 
    WHERE behalf_chrome_extension.task_completions.task_id = wr.task_id
)
ON CONFLICT DO NOTHING;

-- ==============================================
-- SAMPLE DATA FOR TESTING (OPTIONAL)
-- ==============================================

-- Insert test task for validation
INSERT INTO behalf_chrome_extension.tasks_queue (browser_id, task_name, url_to_extract, table_name, params_json) 
VALUES (
    'test_browser_enhanced',
    'Get Page HTML',
    'https://hh.ru/resume/22c04954000baf52a70097a6046b517a693869?hhtmFrom=chat&vacancyId=123286350&resumeId=196039335&t=4664068255',
    'default',
    '{"includeImages": false, "extractLinks": true}'
) ON CONFLICT DO NOTHING;

-- ==============================================
-- VERIFICATION QUERIES
-- ==============================================

-- Check migration results
-- SELECT COUNT(*) as migrated_tasks FROM behalf_chrome_extension.tasks_queue;
-- SELECT COUNT(*) as migrated_content FROM behalf_chrome_extension.page_html_default;
-- SELECT COUNT(*) as migrated_completions FROM behalf_chrome_extension.task_completions;

-- ==============================================
-- CLEANUP NOTES
-- ==============================================

-- After successful migration and testing, you may optionally:
-- 1. Keep old tables for backup: RENAME tasks_ques TO tasks_ques_backup;
-- 2. Or drop old tables: DROP TABLE IF EXISTS tasks_ques CASCADE;
-- 3. Drop old tables: DROP TABLE IF EXISTS worker_report CASCADE;

COMMENT ON SCHEMA behalf_chrome_extension IS 'Schema for Behalf Chrome Extension with enhanced multi-table content extraction';
COMMENT ON TABLE behalf_chrome_extension.tasks_queue IS 'Enhanced task queue with URL extraction and table routing';
COMMENT ON TABLE behalf_chrome_extension.task_completions IS 'Task completion tracking with detailed status and performance metrics';
COMMENT ON TABLE behalf_chrome_extension.page_html_default IS 'Default HTML content storage with structured metadata';
