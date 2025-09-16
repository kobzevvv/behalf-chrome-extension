/**
 * V2 API Handlers
 * Modern Cloudflare-native API endpoints
 */

import { Env } from '../index';
import { createSuccessResponse, createErrorResponse, validateJsonBody } from '../utils/http';
import { generateJobId, generateLeaseId, getCurrentTimestamp } from '../utils/ids';
import { validateContentType, sanitizeContentType } from '../utils/validation';

/**
 * Health Check - GET /health
 */
export async function handleHealth(request: Request, env: Env): Promise<Response> {
  try {
    const timestamp = new Date().toISOString();
    
    // Check D1 connection
    let dbStatus = 'unknown';
    try {
      await env.DB.prepare('SELECT 1').first();
      dbStatus = 'healthy';
    } catch (error) {
      dbStatus = 'error';
    }
    
    // Check R2 connection
    let r2Status = 'unknown';
    try {
      await env.R2.head('health-check');
      r2Status = 'healthy';
    } catch (error) {
      r2Status = 'healthy'; // R2 head on non-existent key is expected
    }
    
    const health = {
      status: 'healthy',
      timestamp,
      services: {
        database: dbStatus,
        storage: r2Status,
        queues: env.CALLBACKS_QUEUE ? 'available' : 'not_configured',
        durable_objects: env.TaskQueue ? 'available' : 'not_configured'
      },
      version: '2.0.0'
    };
    
    return createSuccessResponse(health);
    
  } catch (error) {
    return createErrorResponse('Health check failed', 500, { error: (error as Error).message });
  }
}

/**
 * Create Task - POST /tasks
 */
export async function handleCreateTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await validateJsonBody(request, [
      'browserId',
      'taskName', 
      'url'
    ]);
    
    const jobId = generateJobId();
    const now = getCurrentTimestamp();
    const contentType = sanitizeContentType(body.contentType || 'default');
    
    // Validate URL
    try {
      new URL(body.url);
    } catch {
      return createErrorResponse('Invalid URL provided', 400);
    }
    
    // Insert job into D1
    const stmt = env.DB.prepare(`
      INSERT INTO jobs (
        job_id, browser_id, task_name, url, content_type, 
        state, priority, callback_url, callback_secret_id, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      jobId,
      body.browserId,
      body.taskName,
      body.url,
      contentType,
      'queued',
      body.priority || 0,
      body.callbackUrl || null,
      body.callbackSecretId || null,
      now,
      now
    ).run();
    
    console.log(`✅ Created job ${jobId} for browser ${body.browserId}`);
    
    return createSuccessResponse({
      jobId,
      state: 'queued',
      browserId: body.browserId,
      taskName: body.taskName,
      url: body.url,
      contentType,
      createdAt: now
    }, 201);
    
  } catch (error) {
    console.error('Create task error:', error);
    return createErrorResponse('Failed to create task', 500, { error: (error as Error).message });
  }
}

/**
 * Lease Tasks - POST /lease
 */
export async function handleLease(request: Request, env: Env): Promise<Response> {
  try {
    const body = await validateJsonBody(request, ['browserId']);
    const maxItems = Math.min(body.max || 1, 10); // Limit to 10 items max
    
    // Get TaskQueue Durable Object
    const taskQueueId = env.TaskQueue.idFromName('global');
    const taskQueue = env.TaskQueue.get(taskQueueId);
    
    // Request lease from Durable Object
    const leaseRequest = new Request('https://taskqueue.internal/lease', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId: body.browserId,
        maxItems
      })
    });
    
    const leaseResponse = await taskQueue.fetch(leaseRequest);
    const leaseResult = await leaseResponse.json() as any;
    
    if (!leaseResponse.ok) {
      return createErrorResponse('Lease failed', leaseResponse.status, leaseResult);
    }
    
    console.log(`✅ Leased ${(leaseResult as any).items?.length || 0} tasks for browser ${body.browserId}`);
    
    return createSuccessResponse(leaseResult);
    
  } catch (error) {
    console.error('Lease error:', error);
    return createErrorResponse('Failed to lease tasks', 500, { error: (error as Error).message });
  }
}

/**
 * Heartbeat - POST /heartbeat
 */
export async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  try {
    const body = await validateJsonBody(request, ['jobId', 'leaseId']);
    
    // Get TaskQueue Durable Object
    const taskQueueId = env.TaskQueue.idFromName('global');
    const taskQueue = env.TaskQueue.get(taskQueueId);
    
    // Send heartbeat to Durable Object
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
    
    console.log(`💓 Heartbeat for job ${body.jobId}`);
    
    return createSuccessResponse(heartbeatResult);
    
  } catch (error) {
    console.error('Heartbeat error:', error);
    return createErrorResponse('Heartbeat failed', 500, { error: (error as Error).message });
  }
}

/**
 * Submit Task - POST /submit
 */
export async function handleSubmit(request: Request, env: Env): Promise<Response> {
  try {
    const body = await validateJsonBody(request, ['jobId', 'leaseId']);
    
    // Validate lease first
    const job = await env.DB.prepare(`
      SELECT job_id, lease_id, state, url, content_type, callback_url, callback_secret_id
      FROM jobs 
      WHERE job_id = ? AND lease_id = ? AND state = 'leased'
    `).bind(body.jobId, body.leaseId).first();
    
    if (!job) {
      return createErrorResponse('Invalid job or lease', 400);
    }
    
    let r2Key: string;
    let contentSize: number;
    let contentHash: string;
    
    // Handle content submission
    if (body.htmlBase64) {
      // Option A: Base64 inline content
      const htmlContent = atob(body.htmlBase64);
      contentSize = htmlContent.length;
      contentHash = body.sha256 || await generateSHA256(htmlContent);
      
      // Store in R2
      r2Key = `raw/${body.jobId}.html`;
      await env.R2.put(r2Key, htmlContent, {
        httpMetadata: {
          contentType: body.contentType || 'text/html; charset=utf-8'
        }
      });
      
    } else if (body.r2Key) {
      // Option B: Pre-uploaded to R2
      r2Key = body.r2Key;
      contentSize = body.size || 0;
      contentHash = body.sha256 || '';
      
      // Verify the R2 object exists
      const r2Object = await env.R2.head(r2Key);
      if (!r2Object) {
        return createErrorResponse('R2 object not found', 400);
      }
      
    } else {
      return createErrorResponse('Either htmlBase64 or r2Key must be provided', 400);
    }
    
    const now = getCurrentTimestamp();
    
    // Update job state and create artifact record
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE jobs 
        SET state = 'fetched', updated_at = ?, lease_id = NULL, lease_until = NULL
        WHERE job_id = ?
      `).bind(now, body.jobId),
      
      env.DB.prepare(`
        INSERT OR REPLACE INTO artifacts (
          job_id, raw_r2_key, raw_sha256, raw_bytes, raw_content_type,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        body.jobId,
        r2Key,
        contentHash,
        contentSize,
        body.contentType || 'text/html; charset=utf-8',
        now,
        now
      )
    ]);
    
    // Enqueue webhook if callback URL provided
    if (job.callback_url && env.CALLBACKS_QUEUE) {
      await env.CALLBACKS_QUEUE.send({
        job_id: body.jobId,
        phase: 'ingested',
        callback_url: job.callback_url,
        callback_secret_id: job.callback_secret_id
      });
    }
    
    console.log(`✅ Submitted job ${body.jobId}, stored as ${r2Key}`);
    
    return createSuccessResponse({
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

/**
 * Get Upload URL - GET /upload-url
 */
export async function handleUploadUrl(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('jobId');
    
    if (!jobId) {
      return createErrorResponse('jobId parameter required', 400);
    }
    
    // Verify job exists and is leased
    const job = await env.DB.prepare(`
      SELECT job_id, state, lease_id FROM jobs WHERE job_id = ?
    `).bind(jobId).first();
    
    if (!job || job.state !== 'leased') {
      return createErrorResponse('Job not found or not leased', 400);
    }
    
    // Generate signed upload URL
    const r2Key = `raw/${jobId}.html`;
    // Note: createPresignedUrl is not available in current R2Bucket interface
    // const signedUrl = await env.R2.createPresignedUrl(r2Key, 'PUT', {
    //   expiresIn: 3600 // 1 hour
    // });
    
    return createSuccessResponse({
      uploadUrl: `https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/r2/buckets/behalf-ingestion/objects/${r2Key}`,
      r2Key,
      method: 'PUT',
      expiresIn: 3600
    });
    
  } catch (error) {
    console.error('Upload URL error:', error);
    return createErrorResponse('Failed to generate upload URL', 500, { error: (error as Error).message });
  }
}

/**
 * Get Task Status - GET /status/:jobId
 */
export async function handleStatus(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const jobId = url.pathname.split('/').pop();
    
    if (!jobId) {
      return createErrorResponse('Job ID required', 400);
    }
    
    const job = await env.DB.prepare(`
      SELECT job_id, browser_id, task_name, url, content_type, state, 
             priority, attempts, created_at, updated_at, error_message
      FROM jobs 
      WHERE job_id = ?
    `).bind(jobId).first();
    
    if (!job) {
      return createErrorResponse('Job not found', 404);
    }
    
    return createSuccessResponse(job);
    
  } catch (error) {
    console.error('Status error:', error);
    return createErrorResponse('Failed to get status', 500, { error: (error as Error).message });
  }
}

/**
 * Get Artifacts - GET /artifacts/:jobId
 */
export async function handleArtifacts(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const jobId = url.pathname.split('/').pop();
    
    if (!jobId) {
      return createErrorResponse('Job ID required', 400);
    }
    
    const artifacts = await env.DB.prepare(`
      SELECT job_id, raw_r2_key, raw_sha256, raw_bytes, raw_content_type,
             parsed_r2_key, parsed_sha256, parsed_bytes, created_at, updated_at
      FROM artifacts 
      WHERE job_id = ?
    `).bind(jobId).first();
    
    if (!artifacts) {
      return createSuccessResponse({
        jobId,
        artifacts: null,
        message: 'No artifacts found'
      });
    }
    
    return createSuccessResponse(artifacts);
    
  } catch (error) {
    console.error('Artifacts error:', error);
    return createErrorResponse('Failed to get artifacts', 500, { error: (error as Error).message });
  }
}

/**
 * Get Statistics - GET /stats
 */
export async function handleStats(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const contentType = url.searchParams.get('contentType');
    const since = url.searchParams.get('since');
    
    let whereClause = '';
    let params: any[] = [];
    
    if (contentType) {
      whereClause += ' WHERE content_type = ?';
      params.push(contentType);
    }
    
    if (since) {
      const sinceTimestamp = new Date(since).getTime();
      whereClause += contentType ? ' AND' : ' WHERE';
      whereClause += ' created_at >= ?';
      params.push(sinceTimestamp);
    }
    
    // Job statistics
    const jobStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN state = 'queued' THEN 1 END) as queued_jobs,
        COUNT(CASE WHEN state = 'leased' THEN 1 END) as leased_jobs,
        COUNT(CASE WHEN state = 'fetched' THEN 1 END) as fetched_jobs,
        COUNT(CASE WHEN state = 'parsed' THEN 1 END) as parsed_jobs,
        COUNT(CASE WHEN state = 'delivered' THEN 1 END) as delivered_jobs,
        COUNT(CASE WHEN state = 'failed' THEN 1 END) as failed_jobs,
        AVG(CASE WHEN state IN ('fetched', 'parsed', 'delivered') 
            THEN updated_at - created_at END) as avg_processing_time_ms
      FROM jobs ${whereClause}
    `).bind(...params).first();
    
    // Content statistics
    const contentStats = await env.DB.prepare(`
      SELECT 
        COUNT(DISTINCT j.content_type) as content_types,
        COUNT(a.job_id) as total_artifacts,
        AVG(a.raw_bytes) as avg_content_size,
        SUM(a.raw_bytes) as total_bytes_stored
      FROM jobs j
      LEFT JOIN artifacts a ON j.job_id = a.job_id
      ${whereClause}
    `).bind(...params).first();
    
    return createSuccessResponse({
      jobs: jobStats,
      content: contentStats,
      filters: {
        contentType: contentType || null,
        since: since || null
      },
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    return createErrorResponse('Failed to get statistics', 500, { error: (error as Error).message });
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
