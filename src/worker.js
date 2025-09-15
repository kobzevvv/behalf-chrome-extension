// Enhanced Cloudflare Worker with Multi-Table Content Extraction
import { queries, utils } from './dataModel.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Log incoming request
    console.log(`[${new Date().toISOString()}] ${request.method} ${path} - ${request.headers.get('user-agent') || 'Unknown'}`);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      console.log(`[${new Date().toISOString()}] CORS preflight request`);
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Enhanced routing with new endpoints
      if (path === '/api/check-task' && request.method === 'POST') {
        console.log(`[${new Date().toISOString()}] Processing check-task request`);
        return await handleCheckTask(request, env, corsHeaders);
      } else if (path === '/api/report-task' && request.method === 'POST') {
        console.log(`[${new Date().toISOString()}] Processing enhanced report-task request`);
        return await handleReportTask(request, env, corsHeaders);
      } else if (path === '/api/enqueue-get-page-html' && request.method === 'GET') {
        console.log(`[${new Date().toISOString()}] Processing enhanced enqueue-get-page-html request`);
        return await handleEnqueueGetPageHtml(url, env, corsHeaders);
      } else if (path === '/api/enqueue-task' && request.method === 'POST') {
        console.log(`[${new Date().toISOString()}] Processing new enqueue-task request`);
        return await handleEnqueueTask(request, env, corsHeaders);
      } else if (path === '/api/stats' && request.method === 'GET') {
        console.log(`[${new Date().toISOString()}] Processing stats request`);
        return await handleStats(url, env, corsHeaders);
      } else {
        console.log(`[${new Date().toISOString()}] 404 - Path not found: ${path}`);
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Worker error:`, error);
      return new Response(
        JSON.stringify({ error: 'Internal Server Error', details: error.message }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  }
};

// ==============================================
// DATABASE CONNECTION UTILITY
// ==============================================

class DatabaseConnection {
  constructor(env) {
    this.env = env;
    this.dbHost = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    if (!this.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    try {
      const dbUrl = new URL(this.env.DATABASE_URL);
      this.dbHost = dbUrl.hostname;
      this.initialized = true;
      console.log(`[${new Date().toISOString()}] Database connection initialized for host: ${this.dbHost}`);
    } catch (urlError) {
      console.error(`[${new Date().toISOString()}] URL parsing error:`, urlError);
      throw new Error(`Invalid DATABASE_URL format: ${urlError.message}`);
    }
  }

  async executeQuery(query, params = []) {
    await this.initialize();

    console.log(`[${new Date().toISOString()}] Executing query: ${query.substring(0, 100)}...`);
    
    const response = await fetch(`https://${this.dbHost}/sql`, {
      method: 'POST',
      headers: {
        'neon-connection-string': this.env.DATABASE_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        params
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Database request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[${new Date().toISOString()}] Query executed successfully, rows: ${result.rows?.length || 0}`);
    return result;
  }
}

// ==============================================
// CONTENT EXTRACTION SERVICE
// ==============================================

class ContentExtractionService {
  constructor(db) {
    this.db = db;
  }

  async ensureTableExists(tableName) {
    const sanitizedName = utils.sanitizeTableName(tableName);
    
    // Check if table exists
    const checkQuery = queries.checkTableExists(sanitizedName);
    const checkResult = await this.db.executeQuery(checkQuery.text, [`page_html_${sanitizedName}`]);
    
    if (!checkResult.rows[0].exists) {
      console.log(`[${new Date().toISOString()}] Creating content table: page_html_${sanitizedName}`);
      
      // Create table
      const createQuery = queries.createContentTable(sanitizedName);
      await this.db.executeQuery(createQuery.text);
      
      // Create indexes (execute each index creation separately)
      const indexQueries = queries.createContentTableIndexes(sanitizedName);
      for (const indexQuery of indexQueries.queries) {
        await this.db.executeQuery(indexQuery);
      }
      
      console.log(`[${new Date().toISOString()}] Successfully created table and indexes for: ${sanitizedName}`);
    }

    return sanitizedName;
  }

  async processTaskCompletion(taskData, artifactsJson) {
    const startTime = Date.now();
    const { taskId, tableName = 'default', url } = taskData;
    
    try {
      // Ensure target table exists
      const sanitizedTableName = await this.ensureTableExists(tableName);
      
      // Extract HTML content from artifacts
      const htmlContent = this.extractHtmlContent(artifactsJson);
      if (!htmlContent) {
        throw new Error('No HTML content found in artifacts');
      }

      // Generate content hash for deduplication
      const contentHash = await utils.generateContentHash(htmlContent);
      
      // Check for existing content
      const existsQuery = queries.checkContentExists(sanitizedTableName);
      const existsResult = await this.db.executeQuery(existsQuery.text, [contentHash]);
      
      let recordId = null;
      let recordCount = 0;

      if (existsResult.rows.length === 0) {
        // Extract metadata
        const metadata = utils.extractHtmlMetadata(htmlContent);
        
        // Store new content - use regular insert since we already checked for duplicates
        const insertQuery = queries.insertContentRecord(sanitizedTableName);
        const insertResult = await this.db.executeQuery(insertQuery.text, [
          taskId,
          url,
          htmlContent,
          metadata.title,
          metadata.metaDescription,
          contentHash,
          htmlContent.length,
          JSON.stringify(artifactsJson)
        ]);
        
        recordId = insertResult.rows[0]?.id;
        recordCount = recordId ? 1 : 0;
        
        console.log(`[${new Date().toISOString()}] Stored new content record with ID: ${recordId}`);
      } else {
        console.log(`[${new Date().toISOString()}] Content already exists, skipping duplicate`);
        recordId = existsResult.rows[0].id;
        recordCount = 0; // No new record created
      }

      // Record task completion
      const processingTime = Date.now() - startTime;
      await this.db.executeQuery(queries.insertTaskCompletion.text, [
        taskId,
        sanitizedTableName,
        recordCount,
        'completed',
        processingTime,
        null
      ]);

      return {
        success: true,
        recordId,
        tableName: sanitizedTableName,
        recordCount,
        processingTime,
        contentHash
      };

    } catch (error) {
      console.error(`[${new Date().toISOString()}] Content processing error:`, error);
      
      // Record failed completion
      const processingTime = Date.now() - startTime;
      await this.db.executeQuery(queries.insertTaskCompletion.text, [
        taskId,
        tableName || 'default',
        0,
        'failed',
        processingTime,
        error.message
      ]);

      throw error;
    }
  }

  extractHtmlContent(artifactsJson) {
    // Handle different possible formats
    if (typeof artifactsJson === 'string') {
      return artifactsJson;
    }
    
    if (artifactsJson && typeof artifactsJson === 'object') {
      return artifactsJson['HTML content'] || 
             artifactsJson['html'] || 
             artifactsJson['htmlContent'] ||
             artifactsJson['content'] ||
             null;
    }
    
    return null;
  }
}

// ==============================================
// API HANDLERS
// ==============================================

async function handleCheckTask(request, env, corsHeaders) {
  const requestData = await request.json();
  const { browserId } = requestData;

  console.log(`[${new Date().toISOString()}] Check task request for browserId: ${browserId}`);

  if (!browserId) {
    console.log(`[${new Date().toISOString()}] Error: browserId is required`);
    return new Response(
      JSON.stringify({ error: 'browserId is required' }), 
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const db = new DatabaseConnection(env);
    const result = await db.executeQuery(queries.selectPendingTaskForBrowser.text, [browserId]);

    if (result.rows && result.rows.length > 0) {
      const task = result.rows[0];
      console.log(`[${new Date().toISOString()}] Found task in database:`, task);

      const response = {
        hasTask: true,
        task: {
          taskId: task.id,
          taskName: task.task_name,
          urlToExtract: task.url_to_extract,
          tableName: task.table_name || 'default',
          paramsJson: task.params_json ? JSON.parse(task.params_json) : {}
        }
      };
      
      console.log(`[${new Date().toISOString()}] Returning enhanced task:`, JSON.stringify(response));
      return new Response(
        JSON.stringify(response), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      console.log(`[${new Date().toISOString()}] No task found in database for browserId: ${browserId}`);
      return new Response(
        JSON.stringify({ hasTask: false }), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Database error:`, error);
    return new Response(
      JSON.stringify({ error: 'Database error: ' + error.message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleReportTask(request, env, corsHeaders) {
  const requestData = await request.json();
  const { taskId, datime, taskName, version, artifactsJson, tableName } = requestData;

  console.log(`[${new Date().toISOString()}] Enhanced report task request:`, { 
    taskId, datime, taskName, version, tableName,
    artifactsSize: JSON.stringify(artifactsJson).length 
  });

  if (!taskId || !artifactsJson) {
    console.log(`[${new Date().toISOString()}] Error: Missing required fields (taskId, artifactsJson)`);
    return new Response(
      JSON.stringify({ error: 'Missing required fields: taskId and artifactsJson are required' }), 
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const db = new DatabaseConnection(env);
    const contentService = new ContentExtractionService(db);
    
    // First, get task details to determine table and URL
    const taskQuery = `
      SELECT url_to_extract, table_name 
      FROM behalf_chrome_extension.tasks_queue 
      WHERE id = $1
    `;
    const taskResult = await db.executeQuery(taskQuery, [taskId]);
    
    if (!taskResult.rows || taskResult.rows.length === 0) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const taskData = {
      taskId,
      tableName: tableName || taskResult.rows[0].table_name || 'default',
      url: taskResult.rows[0].url_to_extract
    };

    // Process the content extraction with enhanced logic
    const result = await contentService.processTaskCompletion(taskData, artifactsJson);
    
    console.log(`[${new Date().toISOString()}] Task completion processed successfully:`, result);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        ...result,
        message: `Content stored in table: ${result.tableName}` 
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Enhanced report task error:`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Content processing error: ' + error.message,
        taskId 
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleEnqueueGetPageHtml(url, env, corsHeaders) {
  const browserId = (url.searchParams.get('browserId') || '').trim();
  const targetUrl = (url.searchParams.get('url') || '').trim();
  const tableName = (url.searchParams.get('tableName') || 'default').trim();

  console.log(`[${new Date().toISOString()}] Enhanced enqueue request:`, { 
    browserId, targetUrl, tableName 
  });

  if (!browserId) {
    return new Response(
      JSON.stringify({ error: 'browserId is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
  if (!targetUrl) {
    return new Response(
      JSON.stringify({ error: 'url is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    // Validate URL format
    try {
      new URL(targetUrl);
    } catch (_) {
      return new Response(
        JSON.stringify({ error: 'Invalid url format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const db = new DatabaseConnection(env);
    const result = await db.executeQuery(queries.insertTaskQueue.text, [
      browserId, 
      'Get Page HTML', 
      targetUrl, 
      utils.sanitizeTableName(tableName),
      JSON.stringify({ originalTableName: tableName })
    ]);

    const insertedId = result?.rows?.[0]?.id ?? null;

    return new Response(
      JSON.stringify({ 
        success: true, 
        id: insertedId, 
        browserId, 
        url: targetUrl, 
        tableName: utils.sanitizeTableName(tableName),
        message: `Task queued for table: page_html_${utils.sanitizeTableName(tableName)}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Enhanced enqueue error:`, error);
    return new Response(
      JSON.stringify({ error: 'Database error: ' + error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

async function handleEnqueueTask(request, env, corsHeaders) {
  const requestData = await request.json();
  const { browserId, taskName, urlToExtract, tableName, additionalParams } = requestData;

  console.log(`[${new Date().toISOString()}] New enqueue task request:`, { 
    browserId, taskName, urlToExtract, tableName 
  });

  if (!browserId || !taskName || !urlToExtract) {
    return new Response(
      JSON.stringify({ 
        error: 'Missing required fields: browserId, taskName, and urlToExtract are required' 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    // Validate URL format
    try {
      new URL(urlToExtract);
    } catch (_) {
      return new Response(
        JSON.stringify({ error: 'Invalid urlToExtract format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const db = new DatabaseConnection(env);
    const sanitizedTableName = utils.sanitizeTableName(tableName || 'default');
    
    const result = await db.executeQuery(queries.insertTaskQueue.text, [
      browserId, 
      taskName, 
      urlToExtract, 
      sanitizedTableName,
      JSON.stringify(additionalParams || {})
    ]);

    const insertedId = result?.rows?.[0]?.id ?? null;
    const createdDateTime = result?.rows?.[0]?.created_datetime ?? null;

    return new Response(
      JSON.stringify({ 
        success: true, 
        taskId: insertedId,
        browserId, 
        taskName,
        urlToExtract, 
        tableName: sanitizedTableName,
        createdDateTime,
        message: `Task queued for extraction to table: page_html_${sanitizedTableName}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Enqueue task error:`, error);
    return new Response(
      JSON.stringify({ error: 'Database error: ' + error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}

async function handleStats(url, env, corsHeaders) {
  const tableName = (url.searchParams.get('tableName') || '').trim();
  const since = (url.searchParams.get('since') || '').trim();

  console.log(`[${new Date().toISOString()}] Stats request:`, { tableName, since });

  try {
    const db = new DatabaseConnection(env);
    const stats = {};

    // Get task statistics
    const sinceDate = since ? new Date(since).toISOString() : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const taskStatsResult = await db.executeQuery(queries.getTaskStatistics.text, [sinceDate]);
    stats.tasks = taskStatsResult.rows[0] || {};

    // Get content table statistics if specified
    if (tableName) {
      const sanitizedTableName = utils.sanitizeTableName(tableName);
      try {
        const contentStatsQuery = queries.getContentTableStats(sanitizedTableName);
        const contentStatsResult = await db.executeQuery(contentStatsQuery.text);
        stats.content = {
          tableName: sanitizedTableName,
          ...contentStatsResult.rows[0]
        };
      } catch (error) {
        stats.content = {
          tableName: sanitizedTableName,
          error: `Table page_html_${sanitizedTableName} may not exist yet`
        };
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        stats,
        generatedAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Stats error:`, error);
    return new Response(
      JSON.stringify({ error: 'Stats error: ' + error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}
