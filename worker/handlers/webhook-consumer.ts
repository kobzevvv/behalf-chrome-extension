/**
 * Webhook Consumer
 * Handles reliable webhook delivery with retries and HMAC signing
 */

import { generateDeliveryId, getCurrentTimestamp, getFutureTimestamp } from '../utils/ids';
import { createWebhookSignature } from '../utils/http';

export interface WebhookMessage {
  job_id: string;
  phase: 'ingested' | 'parsed';
  callback_url: string;
  callback_secret_id?: string;
}

export interface WebhookPayload {
  job_id: string;
  phase: 'ingested' | 'parsed';
  browser_id: string;
  url: string;
  content_type: string;
  artifacts: {
    raw_html?: {
      r2_key: string;
      sha256: string;
      bytes: number;
    };
    parsed_data?: {
      r2_key: string;
      sha256: string;
      bytes: number;
    };
  };
  timestamps: {
    created_at: number;
    ingested_at?: number;
    parsed_at?: number;
  };
}

/**
 * Handle webhook delivery queue
 */
export async function handleWebhookQueue(
  batch: MessageBatch<WebhookMessage>, 
  env: any, 
  ctx: ExecutionContext
): Promise<void> {
  console.log(`🎣 Processing ${batch.messages.length} webhook messages`);

  for (const message of batch.messages) {
    try {
      await processWebhookMessage(message.body, env, ctx);
      message.ack();
    } catch (error) {
      console.error('❌ Webhook message processing failed:', error);
      message.retry();
    }
  }
}

/**
 * Process a single webhook message
 */
async function processWebhookMessage(
  message: WebhookMessage, 
  env: any, 
  ctx: ExecutionContext
): Promise<void> {
  const { job_id, phase, callback_url, callback_secret_id } = message;

  console.log(`📨 Processing webhook for job ${job_id}, phase: ${phase}`);

  // Get job details from D1
  const job = await env.DB.prepare(`
    SELECT j.*, a.raw_r2_key, a.raw_sha256, a.raw_bytes, 
           a.parsed_r2_key, a.parsed_sha256, a.parsed_bytes
    FROM jobs j
    LEFT JOIN artifacts a ON j.job_id = a.job_id
    WHERE j.job_id = ?
  `).bind(job_id).first();

  if (!job) {
    console.error(`❌ Job ${job_id} not found for webhook`);
    throw new Error(`Job ${job_id} not found`);
  }

  // Build webhook payload
  const payload = await buildWebhookPayload(job, phase);
  const payloadJson = JSON.stringify(payload);

  // Generate delivery ID
  const deliveryId = generateDeliveryId();

  // Get webhook secret for HMAC signing
  let signature: string | undefined;
  if (callback_secret_id) {
    const secret = await getWebhookSecret(callback_secret_id, env);
    if (secret) {
      signature = await createWebhookSignature(payloadJson, secret);
    }
  }

  // Prepare headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Delivery-Id': deliveryId,
    'User-Agent': 'Behalf-Webhook-Delivery/2.0'
  };

  if (signature) {
    headers['X-Signature'] = signature;
  }

  // Record delivery attempt
  await recordDeliveryAttempt(env, {
    deliveryId,
    jobId: job_id,
    phase,
    url: callback_url,
    attempts: 1
  });

  try {
    // Send webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(callback_url, {
      method: 'POST',
      headers,
      body: payloadJson,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Update delivery record
    await updateDeliveryRecord(env, deliveryId, {
      statusCode: response.status,
      deliveredAt: response.ok ? getCurrentTimestamp() : undefined,
      lastError: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
    });

    if (response.ok) {
      console.log(`✅ Webhook delivered successfully to ${callback_url} (status: ${response.status})`);
      
      // Update job state if this was the final webhook
      if (phase === 'ingested' && job.state === 'fetched') {
        await env.DB.prepare(`
          UPDATE jobs SET state = 'delivered', updated_at = ? WHERE job_id = ?
        `).bind(getCurrentTimestamp(), job_id).run();
      }
    } else {
      console.error(`❌ Webhook delivery failed: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    console.error(`❌ Webhook delivery error for ${callback_url}:`, error);

    // Update delivery record with error
    await updateDeliveryRecord(env, deliveryId, {
      lastError: (error as Error).message,
      attempts: await incrementDeliveryAttempts(env, deliveryId)
    });

    // Check if we should retry
    const maxRetries = 3;
    const attempts = await getDeliveryAttempts(env, deliveryId);
    
    if (attempts < maxRetries) {
      // Requeue with exponential backoff
      const delaySeconds = Math.pow(2, attempts) * 60; // 1min, 2min, 4min
      
      ctx.waitUntil(
        env.CALLBACKS_QUEUE.send(message, { delaySeconds })
      );
      
      console.log(`🔄 Webhook requeued for retry in ${delaySeconds}s (attempt ${attempts + 1}/${maxRetries})`);
    } else {
      console.error(`💀 Webhook delivery failed permanently after ${attempts} attempts`);
      
      // Mark job as failed
      await env.DB.prepare(`
        UPDATE jobs SET state = 'failed', error_message = ?, updated_at = ? WHERE job_id = ?
      `).bind(`Webhook delivery failed: ${(error as Error).message}`, getCurrentTimestamp(), job_id).run();
    }

    throw error; // Re-throw to mark message as failed
  }
}

/**
 * Build webhook payload from job data
 */
async function buildWebhookPayload(job: any, phase: string): Promise<WebhookPayload> {
  const payload: WebhookPayload = {
    job_id: job.job_id,
    phase: phase as 'ingested' | 'parsed',
    browser_id: job.browser_id,
    url: job.url,
    content_type: job.content_type,
    artifacts: {},
    timestamps: {
      created_at: job.created_at,
    }
  };

  // Add raw HTML artifact if available
  if (job.raw_r2_key) {
    payload.artifacts.raw_html = {
      r2_key: job.raw_r2_key,
      sha256: job.raw_sha256,
      bytes: job.raw_bytes
    };
    payload.timestamps.ingested_at = job.updated_at;
  }

  // Add parsed data artifact if available
  if (job.parsed_r2_key) {
    payload.artifacts.parsed_data = {
      r2_key: job.parsed_r2_key,
      sha256: job.parsed_sha256,
      bytes: job.parsed_bytes
    };
    payload.timestamps.parsed_at = job.updated_at;
  }

  return payload;
}

/**
 * Get webhook secret by ID
 */
async function getWebhookSecret(secretId: string, env: any): Promise<string | null> {
  // In production, this would look up secrets from a secure store
  // For now, use predefined test secrets
  const testSecrets: Record<string, string> = {
    'test-secret': 'test-webhook-secret-key-123',
    'e2e-secret': 'e2e-test-secret-key-456',
    'github-action-secret': 'github-action-secret-key-789'
  };

  return testSecrets[secretId] || env.WEBHOOK_SECRET_KEY || null;
}

/**
 * Record delivery attempt in D1
 */
async function recordDeliveryAttempt(env: any, delivery: {
  deliveryId: string;
  jobId: string;
  phase: string;
  url: string;
  attempts: number;
}): Promise<void> {
  await env.DB.prepare(`
    INSERT OR REPLACE INTO callbacks (
      delivery_id, job_id, phase, url, attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    delivery.deliveryId,
    delivery.jobId,
    delivery.phase,
    delivery.url,
    delivery.attempts,
    getCurrentTimestamp(),
    getCurrentTimestamp()
  ).run();
}

/**
 * Update delivery record
 */
async function updateDeliveryRecord(env: any, deliveryId: string, updates: {
  statusCode?: number;
  deliveredAt?: number;
  lastError?: string;
  attempts?: number;
}): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.statusCode !== undefined) {
    fields.push('status_code = ?');
    values.push(updates.statusCode);
  }

  if (updates.deliveredAt !== undefined) {
    fields.push('delivered_at = ?');
    values.push(updates.deliveredAt);
  }

  if (updates.lastError !== undefined) {
    fields.push('last_error = ?');
    values.push(updates.lastError);
  }

  if (updates.attempts !== undefined) {
    fields.push('attempts = ?');
    values.push(updates.attempts);
  }

  fields.push('updated_at = ?');
  values.push(getCurrentTimestamp());

  values.push(deliveryId);

  await env.DB.prepare(`
    UPDATE callbacks SET ${fields.join(', ')} WHERE delivery_id = ?
  `).bind(...values).run();
}

/**
 * Increment delivery attempts
 */
async function incrementDeliveryAttempts(env: any, deliveryId: string): Promise<number> {
  const result = await env.DB.prepare(`
    UPDATE callbacks SET attempts = attempts + 1, updated_at = ? 
    WHERE delivery_id = ? 
    RETURNING attempts
  `).bind(getCurrentTimestamp(), deliveryId).first();

  return result?.attempts || 1;
}

/**
 * Get current delivery attempts
 */
async function getDeliveryAttempts(env: any, deliveryId: string): Promise<number> {
  const result = await env.DB.prepare(`
    SELECT attempts FROM callbacks WHERE delivery_id = ?
  `).bind(deliveryId).first();

  return result?.attempts || 0;
}
