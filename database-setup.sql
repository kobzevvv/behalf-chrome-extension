-- Database setup for Behalf Chrome Extension
-- Run this script in your Neon database
-- SAFE: Uses IF NOT EXISTS and won't affect existing tables/data

-- Create tasks_ques table for storing task requests
-- This will only create the table if it doesn't already exist
CREATE TABLE IF NOT EXISTS tasks_ques (
    id SERIAL PRIMARY KEY,
    browser_id VARCHAR(255) NOT NULL,
    Task VARCHAR(255) NOT NULL,
    Params_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create worker_report table for storing task execution results
-- This will only create the table if it doesn't already exist
CREATE TABLE IF NOT EXISTS worker_report (
    id SERIAL PRIMARY KEY,
    datime TIMESTAMP NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    artifacts_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_ques_browser_id ON tasks_ques(browser_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ques_created_at ON tasks_ques(created_at);
CREATE INDEX IF NOT EXISTS idx_worker_report_datime ON worker_report(datime);
CREATE INDEX IF NOT EXISTS idx_worker_report_task_name ON worker_report(task_name);

-- Insert test data for the extension (safe - won't duplicate)
-- ON CONFLICT DO NOTHING ensures this won't fail if data already exists
INSERT INTO tasks_ques (browser_id, Task, Params_json) 
VALUES (
    'test_browser_id',
    'Get Page HTML',
    '{"URL": "https://hh.ru/resume/22c04954000baf52a70097a6046b517a693869?hhtmFrom=chat&vacancyId=123286350&resumeId=196039335&t=4664068255"}'
) ON CONFLICT DO NOTHING;

-- Create a function to update the updated_at timestamp
-- CREATE OR REPLACE is safe - won't affect existing data
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
-- DROP IF EXISTS ensures no conflicts with existing triggers
DROP TRIGGER IF EXISTS update_tasks_ques_updated_at ON tasks_ques;
CREATE TRIGGER update_tasks_ques_updated_at 
    BEFORE UPDATE ON tasks_ques 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON TABLE tasks_ques TO your_user;
-- GRANT ALL PRIVILEGES ON TABLE worker_report TO your_user;
-- GRANT USAGE, SELECT ON SEQUENCE tasks_ques_id_seq TO your_user;
-- GRANT USAGE, SELECT ON SEQUENCE worker_report_id_seq TO your_user;
