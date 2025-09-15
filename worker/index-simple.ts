/**
 * Simplified Cloudflare Worker - Behalf Task Manager v2.0
 * Basic working version for initial testing
 */

export interface Env {
  DB?: any; // D1Database - simplified for now
  R2?: any; // R2Bucket - simplified for now  
  KV?: any; // KVNamespace - simplified for now
}

// Simple health check endpoint
async function handleHealth(request: Request, env: Env): Promise<Response> {
  return new Response(JSON.stringify({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0-simple',
    services: {
      database: 'not_configured',
      storage: 'not_configured',
      queues: 'not_configured'
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Simple task creation endpoint
async function handleCreateTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    
    if (!body.browserId || !body.url) {
      return new Response(JSON.stringify({
        error: 'browserId and url are required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const jobId = `j_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    
    // For now, just return success without D1 (we'll add that next)
    return new Response(JSON.stringify({
      jobId,
      state: 'queued',
      browserId: body.browserId,
      url: body.url,
      contentType: body.contentType || 'default',
      createdAt: Date.now()
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to create task',
      message: (error as Error).message
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}

// Simple lease endpoint
async function handleLease(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    
    if (!body.browserId) {
      return new Response(JSON.stringify({
        error: 'browserId is required'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // For now, return empty lease (no tasks available)
    return new Response(JSON.stringify({
      items: [],
      count: 0,
      browserId: body.browserId
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to lease tasks',
      message: (error as Error).message
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}

// Simple stats endpoint
async function handleStats(request: Request, env: Env): Promise<Response> {
  return new Response(JSON.stringify({
    jobs: {
      total_jobs: 0,
      queued_jobs: 0,
      leased_jobs: 0,
      fetched_jobs: 0
    },
    content: {
      total_artifacts: 0,
      avg_content_size: 0
    },
    generatedAt: new Date().toISOString()
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// CORS handler
async function handleCors(request: Request): Promise<Response> {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
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
        case path === '/stats':
          return handleStats(request, env);
        default:
          return new Response(JSON.stringify({
            error: 'Not Found',
            path
          }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json' } 
          });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: (error as Error).message
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  }
};
