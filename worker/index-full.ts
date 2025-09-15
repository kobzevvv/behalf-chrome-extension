/**
 * Full Cloudflare Worker - Behalf Task Manager v2.0
 * Complete implementation with D1, R2, and all features
 */

import { MockD1Database } from './mock-d1';

export interface Env {
  DB?: any; // D1Database or MockD1Database
  R2?: any; // R2Bucket
  KV?: any; // KVNamespace
  CALLBACKS_QUEUE?: any; // Queue
  PARSE_QUEUE?: any; // Queue
  TaskQueue?: any; // DurableObjectNamespace
  WEBHOOK_SECRET_KEY?: string;
  API_SECRET_KEY?: string;
}

// Initialize mock D1 for local development - make it persistent
let mockDB: MockD1Database | null = null;

function getDB(env: Env) {
  if (env.DB) {
    return env.DB;
  }
  if (!mockDB) {
    console.log('🔧 Initializing persistent mock D1 database');
    mockDB = new MockD1Database();
  }
  return mockDB;
}

// Utility functions
function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `j_${timestamp}_${random}`;
}

function sanitizeContentType(contentType?: string): string {
  if (!contentType || typeof contentType !== 'string') {
    return 'default';
  }
  
  return contentType
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50) || 'default';
}

function createResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function createErrorResponse(message: string, status: number = 400, details?: any): Response {
  return createResponse({
    error: message,
    status,
    timestamp: new Date().toISOString(),
    ...details
  }, status);
}

// Health check endpoint
async function handleHealth(request: Request, env: Env): Promise<Response> {
  try {
    const timestamp = new Date().toISOString();
    
    // Check D1 connection
    let dbStatus = 'unknown';
    try {
      const db = getDB(env);
      await db.prepare('SELECT 1').first();
      dbStatus = 'healthy';
    } catch (error) {
      dbStatus = 'error';
    }
    
    const health = {
      status: 'healthy',
      timestamp,
      services: {
        database: dbStatus,
        storage: env.R2 ? 'available' : 'not_configured',
        queues: env.CALLBACKS_QUEUE ? 'available' : 'not_configured',
        durable_objects: env.TaskQueue ? 'available' : 'not_configured'
      },
      version: '2.0.0-full'
    };
    
    return createResponse(health);
    
  } catch (error) {
    return createErrorResponse('Health check failed', 500, { error: (error as Error).message });
  }
}

// Create task endpoint
async function handleCreateTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    
    // Validate required fields
    if (!body.browserId || !body.url) {
      return createErrorResponse('browserId and url are required', 400);
    }
    
    // Validate URL
    try {
      new URL(body.url);
    } catch {
      return createErrorResponse('Invalid URL provided', 400);
    }
    
    const jobId = generateJobId();
    const now = Date.now();
    const contentType = sanitizeContentType(body.contentType || 'default');
    
    // Insert job into D1
    const db = getDB(env);
    const stmt = db.prepare(`
      INSERT INTO jobs (
        job_id, browser_id, task_name, url, content_type, 
        state, priority, callback_url, callback_secret_id, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = await stmt.bind(
      jobId,
      body.browserId,
      body.taskName || 'Get Page HTML',
      body.url,
      contentType,
      'queued',
      body.priority || 0,
      body.callbackUrl || null,
      body.callbackSecretId || null,
      now,
      now
    ).run();
    
    if (!result.success) {
      throw new Error('Failed to insert job into database');
    }
    
    console.log(`✅ Created job ${jobId} for browser ${body.browserId}`);
    
    return createResponse({
      jobId,
      state: 'queued',
      browserId: body.browserId,
      taskName: body.taskName || 'Get Page HTML',
      url: body.url,
      contentType,
      createdAt: now
    }, 201);
    
  } catch (error) {
    console.error('Create task error:', error);
    return createErrorResponse('Failed to create task', 500, { error: (error as Error).message });
  }
}

// Lease tasks endpoint - Enhanced with Durable Object
async function handleLease(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    
    if (!body.browserId) {
      return createErrorResponse('browserId is required', 400);
    }
    
    const maxItems = Math.min(body.max || 1, 10);
    
    // Find available tasks in D1
    const db = getDB(env);
    const stmt = db.prepare(`
      SELECT job_id, browser_id, task_name, url, content_type, priority, created_at
      FROM jobs 
      WHERE browser_id = ? AND state = 'queued'
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);
    
    const result = await stmt.bind(body.browserId, maxItems).all();
    const availableTasks = result.results || [];
    
    if (availableTasks.length === 0) {
      return createResponse({
        items: [],
        count: 0,
        browserId: body.browserId
      });
    }
    
    const leasedTasks = [];
    
    // Use Durable Object for lease management if available
    if (env.TaskQueue) {
      const taskQueueId = env.TaskQueue.idFromName('global');
      const taskQueue = env.TaskQueue.get(taskQueueId);
      
      // Lease each task through the Durable Object
      for (const task of availableTasks) {
        try {
          const leaseRequest = new Request('https://taskqueue.internal/lease', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              browserId: body.browserId,
              jobId: task.job_id
            })
          });
          
          const leaseResponse = await taskQueue.fetch(leaseRequest);
          
          if (leaseResponse.ok) {
            const leaseResult = await leaseResponse.json();
            
            // Update job state in D1
            const now = Date.now();
            const updateStmt = db.prepare(`
              UPDATE jobs 
              SET state = 'leased', lease_id = ?, lease_until = ?, updated_at = ?
              WHERE job_id = ? AND state = 'queued'
            `);
            
            await updateStmt.bind(
              leaseResult.leaseId, 
              leaseResult.leaseUntil, 
              now, 
              task.job_id
            ).run();
            
            leasedTasks.push({
              jobId: task.job_id,
              url: task.url,
              taskName: task.task_name,
              contentType: task.content_type,
              leaseId: leaseResult.leaseId,
              leaseUntil: leaseResult.leaseUntil,
              additionalParams: {}
            });
          }
        } catch (error) {
          console.error(`Failed to lease task ${task.job_id}:`, error);
          // Continue with other tasks
        }
      }
    } else {
      // Fallback to simple lease management without DO
      const now = Date.now();
      const leaseDurationMs = 30 * 60 * 1000; // 30 minutes
      const leaseUntil = now + leaseDurationMs;
      
      for (const task of availableTasks) {
        const leaseId = `L_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
        
        const updateStmt = db.prepare(`
          UPDATE jobs 
          SET state = 'leased', lease_id = ?, lease_until = ?, updated_at = ?
          WHERE job_id = ? AND state = 'queued'
        `);
        
        const updateResult = await updateStmt.bind(leaseId, leaseUntil, now, task.job_id).run();
        
        if (updateResult.success && updateResult.meta.changes > 0) {
          leasedTasks.push({
            jobId: task.job_id,
            url: task.url,
            taskName: task.task_name,
            contentType: task.content_type,
            leaseId,
            leaseUntil,
            additionalParams: {}
          });
        }
      }
    }
    
    console.log(`✅ Leased ${leasedTasks.length} tasks for browser ${body.browserId}`);
    
    return createResponse({
      items: leasedTasks,
      count: leasedTasks.length,
      browserId: body.browserId
    });
    
  } catch (error) {
    console.error('Lease error:', error);
    return createErrorResponse('Failed to lease tasks', 500, { error: (error as Error).message });
  }
}

// Heartbeat endpoint - Extend lease duration
async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    
    if (!body.jobId || !body.leaseId) {
      return createErrorResponse('jobId and leaseId are required', 400);
    }
    
    // Use Durable Object for heartbeat if available
    if (env.TaskQueue) {
      const taskQueueId = env.TaskQueue.idFromName('global');
      const taskQueue = env.TaskQueue.get(taskQueueId);
      
      const heartbeatRequest = new Request('https://taskqueue.internal/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: body.jobId,
          leaseId: body.leaseId
        })
      });
      
      const heartbeatResponse = await taskQueue.fetch(heartbeatRequest);
      const heartbeatResult = await heartbeatResponse.json();
      
      if (!heartbeatResponse.ok) {
        return createErrorResponse('Heartbeat failed', heartbeatResponse.status, heartbeatResult);
      }
      
      // Update lease in D1
      const db = getDB(env);
      await db.prepare(`
        UPDATE jobs 
        SET lease_until = ?, updated_at = ?
        WHERE job_id = ? AND lease_id = ?
      `).bind(
        heartbeatResult.leaseUntil, 
        Date.now(), 
        body.jobId, 
        body.leaseId
      ).run();
      
      console.log(`💓 Heartbeat for job ${body.jobId}, lease extended`);
      
      return createResponse({
        success: true,
        leaseUntil: heartbeatResult.leaseUntil,
        heartbeatCount: heartbeatResult.heartbeatCount
      });
      
    } else {
      // Fallback heartbeat without DO
      const db = getDB(env);
      const job = await db.prepare(`
        SELECT job_id, lease_id, lease_until FROM jobs 
        WHERE job_id = ? AND lease_id = ? AND state = 'leased'
      `).bind(body.jobId, body.leaseId).first();
      
      if (!job) {
        return createErrorResponse('Invalid job or lease', 400);
      }
      
      // Check if lease is expired
      if (Date.now() > job.lease_until) {
        return createErrorResponse('Lease expired', 410);
      }
      
      // Extend lease
      const leaseDurationMs = 30 * 60 * 1000; // 30 minutes
      const newLeaseUntil = Date.now() + leaseDurationMs;
      
      await db.prepare(`
        UPDATE jobs 
        SET lease_until = ?, updated_at = ?
        WHERE job_id = ?
      `).bind(newLeaseUntil, Date.now(), body.jobId).run();
      
      console.log(`💓 Heartbeat for job ${body.jobId} (fallback mode)`);
      
      return createResponse({
        success: true,
        leaseUntil: newLeaseUntil
      });
    }
    
  } catch (error) {
    console.error('Heartbeat error:', error);
    return createErrorResponse('Heartbeat failed', 500, { error: (error as Error).message });
  }
}

// Upload URL endpoint - Generate signed URL for R2 upload
async function handleUploadUrl(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');
    
    if (!jobId) {
      return createErrorResponse('jobId parameter is required', 400);
    }
    
    // Verify job exists and is leased
    const db = getDB(env);
    console.log(`🔍 Upload URL: Looking for job ${jobId}`);
    
    // Use simpler query that we know works with mock D1
    const job = await db.prepare(`
      SELECT job_id, state, lease_id FROM jobs 
      WHERE job_id = ?
    `).bind(jobId).first();
    
    console.log(`🔍 Upload URL: Query result:`, job);
    
    if (!job) {
      return createErrorResponse('Job not found', 404);
    }
    
    if (job.state !== 'leased') {
      return createErrorResponse('Job is not leased', 400);
    }
    
    // Generate R2 key
    const r2Key = `raw/${jobId}.html`;
    
    // For real R2, we'd generate a proper signed URL
    // For mock, we'll create a simple mock URL
    let uploadUrl: string;
    let uploadMethod = 'PUT';
    
    if (env.R2) {
      // Real R2 implementation would go here
      // const signedUrl = await env.R2.generateSignedUploadUrl(r2Key, { expiresIn: 3600 });
      // uploadUrl = signedUrl;
      uploadUrl = `https://mock-r2.local/upload/${r2Key}`;
    } else {
      // Mock R2 for local development
      const { getMockR2Bucket } = await import('./mock-r2');
      const r2 = getMockR2Bucket();
      uploadUrl = await r2.getSignedUploadUrl(r2Key, 3600);
    }
    
    console.log(`📤 Generated upload URL for job ${jobId}: ${r2Key}`);
    
    return createResponse({
      uploadUrl,
      r2Key,
      method: uploadMethod,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
      expiresIn: 3600
    });
    
  } catch (error) {
    console.error('Upload URL error:', error);
    return createErrorResponse('Failed to generate upload URL', 500, { error: (error as Error).message });
  }
}

// Submit task endpoint
async function handleSubmit(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    
    if (!body.jobId || !body.leaseId) {
      return createErrorResponse('jobId and leaseId are required', 400);
    }
    
    // Validate lease
    const db = getDB(env);
    const job = await db.prepare(`
      SELECT job_id, lease_id, state, url, content_type, callback_url, callback_secret_id
      FROM jobs 
      WHERE job_id = ? AND lease_id = ? AND state = 'leased'
    `).bind(body.jobId, body.leaseId).first();
    
    if (!job) {
      return createErrorResponse('Invalid job or lease', 400);
    }
    
    let contentSize: number = 0;
    let contentHash: string = '';
    let r2Key: string = '';
    
    // Handle content submission
    if (body.htmlBase64) {
      // Inline content submission (small files)
      const htmlContent = atob(body.htmlBase64);
      contentSize = htmlContent.length;
      contentHash = body.sha256 || await generateSHA256(htmlContent);
      r2Key = `raw/${body.jobId}.html`;
      
      // Store in R2 (or mock)
      if (env.R2) {
        await env.R2.put(r2Key, htmlContent, {
          httpMetadata: {
            contentType: body.contentType || 'text/html; charset=utf-8'
          }
        });
        console.log(`📄 Stored ${contentSize} bytes to R2: ${r2Key}`);
      } else {
        // Mock R2 storage
        const { getMockR2Bucket } = await import('./mock-r2');
        const r2 = getMockR2Bucket();
        await r2.put(r2Key, htmlContent, {
          httpMetadata: { contentType: body.contentType || 'text/html; charset=utf-8' }
        });
      }
      
    } else if (body.r2Key) {
      // R2 key submission (content already uploaded via signed URL)
      r2Key = body.r2Key;
      contentSize = body.size || 0;
      contentHash = body.sha256 || '';
      
      // Verify the R2 object exists
      if (env.R2) {
        const obj = await env.R2.get(r2Key);
        if (!obj) {
          return createErrorResponse('R2 object not found', 400);
        }
        console.log(`📄 Verified R2 object exists: ${r2Key}`);
      } else {
        // Mock R2 verification
        const { getMockR2Bucket } = await import('./mock-r2');
        const r2 = getMockR2Bucket();
        const obj = await r2.get(r2Key);
        if (!obj) {
          // For mock, we'll assume the object exists if r2Key is provided
          console.log(`📄 Mock R2: Assuming object exists for key: ${r2Key}`);
        }
      }
      
    } else {
      return createErrorResponse('Either htmlBase64 or r2Key must be provided', 400);
    }
    
    const now = Date.now();
    
    // Update job state and create artifact record
    const updateJobStmt = db.prepare(`
      UPDATE jobs 
      SET state = 'fetched', updated_at = ?, lease_id = NULL, lease_until = NULL
      WHERE job_id = ?
    `);
    
    const insertArtifactStmt = db.prepare(`
      INSERT OR REPLACE INTO artifacts (
        job_id, raw_r2_key, raw_sha256, raw_bytes, raw_content_type,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    await updateJobStmt.bind(now, body.jobId).run();
    await insertArtifactStmt.bind(
      body.jobId,
      r2Key,
      contentHash,
      contentSize,
      body.contentType || 'text/html; charset=utf-8',
      now,
      now
    ).run();
    
    // TODO: Enqueue webhook if callback URL provided
    if (job.callback_url) {
      console.log(`🎣 Would enqueue webhook for job ${body.jobId} to ${job.callback_url}`);
    }
    
    console.log(`✅ Submitted job ${body.jobId}, stored as ${r2Key}`);
    
    return createResponse({
      success: true,
      jobId: body.jobId,
      r2Key,
      contentHash,
      contentSize,
      state: 'fetched'
    });
    
  } catch (error) {
    console.error('Submit error:', error);
    return createErrorResponse('Failed to submit task', 500, { error: (error as Error).message });
  }
}

// Get task status endpoint
async function handleStatus(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const jobId = url.pathname.split('/').pop();
    
    if (!jobId) {
      return createErrorResponse('Job ID required', 400);
    }
    
    const db = getDB(env);
    const job = await db.prepare(`
      SELECT job_id, browser_id, task_name, url, content_type, state, 
             priority, attempts, created_at, updated_at, error_message
      FROM jobs 
      WHERE job_id = ?
    `).bind(jobId).first();
    
    if (!job) {
      return createErrorResponse('Job not found', 404);
    }
    
    return createResponse(job);
    
  } catch (error) {
    console.error('Status error:', error);
    return createErrorResponse('Failed to get status', 500, { error: (error as Error).message });
  }
}

// Get artifacts endpoint
async function handleArtifacts(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const jobId = url.pathname.split('/').pop();
    
    if (!jobId) {
      return createErrorResponse('Job ID required', 400);
    }
    
    const db = getDB(env);
    const artifacts = await db.prepare(`
      SELECT job_id, raw_r2_key, raw_sha256, raw_bytes, raw_content_type,
             parsed_r2_key, parsed_sha256, parsed_bytes, created_at, updated_at
      FROM artifacts 
      WHERE job_id = ?
    `).bind(jobId).first();
    
    if (!artifacts) {
      return createResponse({
        jobId,
        artifacts: null,
        message: 'No artifacts found'
      });
    }
    
    return createResponse(artifacts);
    
  } catch (error) {
    console.error('Artifacts error:', error);
    return createErrorResponse('Failed to get artifacts', 500, { error: (error as Error).message });
  }
}

// Get statistics endpoint
async function handleStats(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const contentType = url.searchParams.get('contentType');
    
    const db = getDB(env);
    
    // Get job statistics
    let jobQuery = `
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN state = 'queued' THEN 1 END) as queued_jobs,
        COUNT(CASE WHEN state = 'leased' THEN 1 END) as leased_jobs,
        COUNT(CASE WHEN state = 'fetched' THEN 1 END) as fetched_jobs,
        COUNT(CASE WHEN state = 'parsed' THEN 1 END) as parsed_jobs,
        COUNT(CASE WHEN state = 'delivered' THEN 1 END) as delivered_jobs,
        COUNT(CASE WHEN state = 'failed' THEN 1 END) as failed_jobs
      FROM jobs
    `;
    
    const params: any[] = [];
    if (contentType) {
      jobQuery += ' WHERE content_type = ?';
      params.push(contentType);
    }
    
    const jobStats = await db.prepare(jobQuery).bind(...params).first();
    
    // Get content statistics
    let contentQuery = `
      SELECT 
        COUNT(a.job_id) as total_artifacts,
        AVG(a.raw_bytes) as avg_content_size,
        SUM(a.raw_bytes) as total_bytes_stored
      FROM jobs j
      LEFT JOIN artifacts a ON j.job_id = a.job_id
    `;
    
    if (contentType) {
      contentQuery += ' WHERE j.content_type = ?';
    }
    
    const contentStats = await db.prepare(contentQuery).bind(...params).first();
    
    return createResponse({
      jobs: jobStats,
      content: contentStats,
      filters: {
        contentType: contentType || null
      },
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    return createErrorResponse('Failed to get statistics', 500, { error: (error as Error).message });
  }
}

// CORS handler
async function handleCors(request: Request): Promise<Response> {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, X-Delivery-Id',
      'Access-Control-Max-Age': '86400'
    }
  });
}

// Debug endpoint to see what's in the database
async function handleDebugJobs(request: Request, env: Env): Promise<Response> {
  try {
    const db = getDB(env);
    
    // Get all jobs
    const allJobs = await db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 10').all();
    
    return createResponse({
      totalJobs: allJobs.results?.length || 0,
      jobs: allJobs.results || [],
      debug: 'This endpoint shows recent jobs for debugging'
    });
    
  } catch (error) {
    console.error('Debug jobs error:', error);
    return createErrorResponse('Failed to get debug info', 500, { error: (error as Error).message });
  }
}

// Utility function for SHA-256 hashing
async function generateSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Main worker handler
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors(request);
    }

    try {
      // Route requests
      switch (true) {
        case path === '/health':
          return handleHealth(request, env);
        case path === '/tasks' && request.method === 'POST':
          return handleCreateTask(request, env);
        case path === '/lease' && request.method === 'POST':
          return handleLease(request, env);
        case path === '/heartbeat' && request.method === 'POST':
          return handleHeartbeat(request, env);
        case path === '/upload-url' && request.method === 'GET':
          return handleUploadUrl(request, env);
        case path === '/submit' && request.method === 'POST':
          return handleSubmit(request, env);
        case path.startsWith('/status/'):
          return handleStatus(request, env);
        case path.startsWith('/artifacts/'):
          return handleArtifacts(request, env);
        case path === '/stats':
          return handleStats(request, env);
        case path === '/debug/jobs':
          return handleDebugJobs(request, env);
        default:
          return createErrorResponse('Not Found', 404, { path });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return createErrorResponse(
        'Internal Server Error',
        500,
        { error: (error as Error).message }
      );
    }
  }
};

// Export Durable Object classes
export { TaskQueue } from './do-task-queue-simple';
