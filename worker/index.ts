/**
 * Cloudflare Worker - Behalf Task Manager v2.0
 * Cloudflare-native ingestion pipeline with D1, R2, and Queues
 */

import { Router } from 'itty-router';
import { 
  handleCreateTask,
  handleLease,
  handleHeartbeat,
  handleSubmit,
  handleUploadUrl,
  handleStatus,
  handleArtifacts,
  handleStats,
  handleHealth
} from './handlers';
import { 
  handleCheckTask,
  handleReportTask,
  handleEnqueueGetPageHtml,
  handleEnqueueTask
} from './handlers/v1-compat';
import { corsHeaders, createErrorResponse, createSuccessResponse } from './utils/http';

// Types for Cloudflare Worker environment
export interface Env {
  // D1 Database
  DB: D1Database;
  
  // R2 Bucket
  R2: R2Bucket;
  
  // KV Namespace (optional)
  KV?: KVNamespace;
  
  // Queues
  PARSE_QUEUE?: Queue;
  CALLBACKS_QUEUE?: Queue;
  
  // Durable Object
  TaskQueue: DurableObjectNamespace;
  
  // Environment variables
  DATABASE_URL?: string;
  WEBHOOK_SECRET_KEY?: string;
  API_SECRET_KEY?: string;
}

// Create router
const router = Router();

// Health check endpoint
router.get('/health', handleHealth);

// V2 API endpoints (preferred)
router.post('/tasks', handleCreateTask);
router.post('/lease', handleLease);
router.post('/heartbeat', handleHeartbeat);
router.post('/submit', handleSubmit);
router.get('/upload-url', handleUploadUrl);
router.get('/status/:jobId', handleStatus);
router.get('/artifacts/:jobId', handleArtifacts);
router.get('/stats', handleStats);

// V1 compatibility endpoints
router.post('/api/check-task', handleCheckTask);
router.post('/api/report-task', handleReportTask);
router.get('/api/enqueue-get-page-html', handleEnqueueGetPageHtml);
router.post('/api/enqueue-task', handleEnqueueTask);
router.get('/api/stats', handleStats); // Same as v2

// CORS preflight
router.options('*', () => new Response(null, { headers: corsHeaders }));

// 404 handler
router.all('*', () => createErrorResponse('Not Found', 404));

// Main worker handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Add CORS headers to all responses
      const response = await router.handle(request, env, ctx);
      
      // Add CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      
      return response;
      
    } catch (error) {
      console.error('Worker error:', error);
      return createErrorResponse(
        'Internal Server Error',
        500,
        { error: (error as Error).message }
      );
    }
  },

  // Queue consumer for webhooks
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    // Handle webhook delivery queue
    if (batch.queue === 'callbacks-queue') {
      const { handleWebhookQueue } = await import('./handlers/webhook-consumer');
      await handleWebhookQueue(batch, env, ctx);
    }
    
    // Handle parse queue (if implemented)
    if (batch.queue === 'parse-queue') {
      const { handleParseQueue } = await import('./handlers/parse-consumer');
      await handleParseQueue(batch, env, ctx);
    }
  }
};

// Export Durable Object
export { TaskQueue } from './do-task-queue';
