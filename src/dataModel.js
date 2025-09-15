// Enhanced data model for Behalf Chrome Extension
// Supports multi-table content extraction with behalf_chrome_extension schema

// Utility functions for table name handling
export const utils = {
  // Sanitize table name to prevent SQL injection and ensure valid naming
  sanitizeTableName: (tableName) => {
    if (!tableName || typeof tableName !== 'string') {
      return 'default';
    }
    
    // Remove any non-alphanumeric characters except underscores, convert to lowercase
    const sanitized = tableName.toLowerCase().replace(/[^a-z0-9_]/g, '');
    
    // Ensure it starts with a letter, max 50 chars
    const cleaned = sanitized.replace(/^[^a-z]+/, '').substring(0, 50);
    
    return cleaned || 'default';
  },

  // Generate full table name with schema and prefix
  getContentTableName: (tableName) => {
    const sanitized = utils.sanitizeTableName(tableName);
    return `behalf_chrome_extension.page_html_${sanitized}`;
  },

  // Generate content hash for deduplication
  generateContentHash: async (content) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // Extract title and meta description from HTML
  extractHtmlMetadata: (htmlContent) => {
    try {
      // Simple regex-based extraction (since we can't use DOM in worker)
      const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim().substring(0, 500) : null;
      
      const metaDescMatch = htmlContent.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i);
      const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : null;
      
      return { title, metaDescription };
    } catch (error) {
      console.warn('Failed to extract HTML metadata:', error);
      return { title: null, metaDescription: null };
    }
  }
};

export const queries = {
  // ==============================================
  // TASK QUEUE QUERIES
  // ==============================================
  
  // Select pending task for browser (enhanced with new schema)
  selectPendingTaskForBrowser: {
    text: `
      SELECT t.id, t.task_name, t.url_to_extract, t.table_name, t.params_json, t.created_datetime
      FROM behalf_chrome_extension.tasks_queue t
      LEFT JOIN behalf_chrome_extension.task_completions c ON c.task_id = t.id
      WHERE t.browser_id = $1 AND c.id IS NULL
      ORDER BY t.created_datetime ASC LIMIT 1
    `
  },

  // Insert new task into queue
  insertTaskQueue: {
    text: `
      INSERT INTO behalf_chrome_extension.tasks_queue 
      (browser_id, task_name, url_to_extract, table_name, params_json)
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id, created_datetime
    `
  },

  // ==============================================
  // DYNAMIC TABLE MANAGEMENT
  // ==============================================

  // Create content table dynamically
  createContentTable: (tableName) => {
    const sanitizedName = utils.sanitizeTableName(tableName);
    return {
      text: `
        CREATE TABLE IF NOT EXISTS behalf_chrome_extension.page_html_${sanitizedName} (
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
        )
      `,
      tableName: sanitizedName
    };
  },

  // Create indexes for content table (returns array of individual queries)
  createContentTableIndexes: (tableName) => {
    const sanitizedName = utils.sanitizeTableName(tableName);
    return {
      queries: [
        `CREATE INDEX IF NOT EXISTS idx_page_html_${sanitizedName}_task_id ON behalf_chrome_extension.page_html_${sanitizedName}(task_id)`,
        `CREATE INDEX IF NOT EXISTS idx_page_html_${sanitizedName}_url ON behalf_chrome_extension.page_html_${sanitizedName}(url)`,
        `CREATE INDEX IF NOT EXISTS idx_page_html_${sanitizedName}_content_hash ON behalf_chrome_extension.page_html_${sanitizedName}(content_hash)`,
        `CREATE INDEX IF NOT EXISTS idx_page_html_${sanitizedName}_extracted_datetime ON behalf_chrome_extension.page_html_${sanitizedName}(extracted_datetime)`
      ],
      tableName: sanitizedName
    };
  },

  // Check if table exists
  checkTableExists: (tableName) => {
    const sanitizedName = utils.sanitizeTableName(tableName);
    return {
      text: `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'behalf_chrome_extension' 
          AND table_name = $1
        )
      `,
      tableName: sanitizedName
    };
  },

  // ==============================================
  // CONTENT STORAGE QUERIES
  // ==============================================

  // Insert content record with deduplication
  insertContentRecord: (tableName) => {
    const sanitizedName = utils.sanitizeTableName(tableName);
    return {
      text: `
        INSERT INTO behalf_chrome_extension.page_html_${sanitizedName} 
        (task_id, url, html_content, title, meta_description, content_hash, content_size_bytes, extraction_metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      tableName: sanitizedName
    };
  },

  // Insert content record with conflict handling (for tables with unique constraint)
  insertContentRecordWithConflict: (tableName) => {
    const sanitizedName = utils.sanitizeTableName(tableName);
    return {
      text: `
        INSERT INTO behalf_chrome_extension.page_html_${sanitizedName} 
        (task_id, url, html_content, title, meta_description, content_hash, content_size_bytes, extraction_metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (content_hash) DO NOTHING
        RETURNING id
      `,
      tableName: sanitizedName
    };
  },

  // Check for duplicate content
  checkContentExists: (tableName) => {
    const sanitizedName = utils.sanitizeTableName(tableName);
    return {
      text: `
        SELECT id, task_id FROM behalf_chrome_extension.page_html_${sanitizedName}
        WHERE content_hash = $1
        LIMIT 1
      `,
      tableName: sanitizedName
    };
  },

  // ==============================================
  // TASK COMPLETION TRACKING
  // ==============================================

  // Insert task completion record
  insertTaskCompletion: {
    text: `
      INSERT INTO behalf_chrome_extension.task_completions 
      (task_id, extraction_table, record_count, status, processing_duration_ms, error_message)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `
  },

  // Update task completion with error
  updateTaskCompletionError: {
    text: `
      UPDATE behalf_chrome_extension.task_completions 
      SET status = 'failed', error_message = $2
      WHERE task_id = $1
    `
  },

  // ==============================================
  // LEGACY COMPATIBILITY (DEPRECATED)
  // ==============================================

  // Legacy query for backward compatibility (maps to new schema)
  insertWorkerReport: {
    text: `
      INSERT INTO behalf_chrome_extension.task_completions 
      (task_id, extraction_table, record_count, status, completed_datetime)
      VALUES ($1, 'legacy_report', 1, 'completed', $2)
    `,
    deprecated: true,
    note: 'Use insertTaskCompletion instead'
  },

  // ==============================================
  // ANALYTICS AND MONITORING
  // ==============================================

  // Get task processing statistics
  getTaskStatistics: {
    text: `
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN c.status = 'completed' THEN 1 END) as completed_tasks,
        COUNT(CASE WHEN c.status = 'failed' THEN 1 END) as failed_tasks,
        COUNT(CASE WHEN c.id IS NULL THEN 1 END) as pending_tasks,
        AVG(c.processing_duration_ms) as avg_processing_time_ms
      FROM behalf_chrome_extension.tasks_queue t
      LEFT JOIN behalf_chrome_extension.task_completions c ON c.task_id = t.id
      WHERE t.created_datetime >= $1
    `
  },

  // Get content table statistics
  getContentTableStats: (tableName) => {
    const sanitizedName = utils.sanitizeTableName(tableName);
    return {
      text: `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT url) as unique_urls,
          AVG(content_size_bytes) as avg_content_size,
          MAX(extracted_datetime) as last_extraction,
          MIN(extracted_datetime) as first_extraction
        FROM behalf_chrome_extension.page_html_${sanitizedName}
      `,
      tableName: sanitizedName
    };
  }
};


