/**
 * TaskQueue Durable Object
 * Manages task leasing, heartbeats, and lease expiration
 */

import { generateLeaseId, getCurrentTimestamp, getFutureTimestamp, isTimestampExpired } from './utils/ids';
import { createSuccessResponse, createErrorResponse } from './utils/http';

export interface TaskLease {
  jobId: string;
  leaseId: string;
  browserId: string;
  leaseUntil: number;
  heartbeatCount: number;
  createdAt: number;
}

export class TaskQueue {
  private state: DurableObjectState;
  private env: any; // Will be properly typed later
  private leases: Map<string, TaskLease> = new Map();
  private browserLeases: Map<string, Set<string>> = new Map(); // browserId -> Set<jobId>

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    
    // Initialize from storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Map<string, TaskLease>>('leases');
      if (stored) {
        this.leases = new Map(stored);
        
        // Rebuild browser index
        for (const [jobId, lease] of this.leases) {
          if (!this.browserLeases.has(lease.browserId)) {
            this.browserLeases.set(lease.browserId, new Set());
          }
          this.browserLeases.get(lease.browserId)!.add(jobId);
        }
      }
    });

    // Set up periodic cleanup of expired leases
    // Note: setAlarm is not available in the current DurableObjectState interface
    // this.state.setAlarm(Date.now() + 60000); // Check every minute
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case '/lease':
          return await this.handleLease(request);
        case '/heartbeat':
          return await this.handleHeartbeat(request);
        case '/release':
          return await this.handleRelease(request);
        case '/status':
          return await this.handleStatus(request);
        default:
          return createErrorResponse('Not Found', 404);
      }
    } catch (error) {
      console.error('TaskQueue DO error:', error);
      return createErrorResponse('Internal Error', 500, { error: (error as Error).message });
    }
  }

  /**
   * Handle lease request
   */
  async handleLease(request: Request): Promise<Response> {
    const body = await request.json() as any;
    const { browserId, maxItems = 1 } = body;

    if (!browserId) {
      return createErrorResponse('browserId is required', 400);
    }

    // Clean up expired leases first
    await this.cleanupExpiredLeases();

    // Find available tasks for this browser
    const availableTasks = await this.findAvailableTasks(browserId, maxItems);
    const leasedTasks = [];

    for (const task of availableTasks) {
      const lease = await this.createLease(task, browserId);
      if (lease) {
        leasedTasks.push({
          jobId: task.job_id,
          url: task.url,
          taskName: task.task_name,
          contentType: task.content_type,
          leaseId: lease.leaseId,
          leaseUntil: lease.leaseUntil,
          additionalParams: task.params_json ? JSON.parse(task.params_json) : {}
        });
      }
    }

    // Save state
    await this.saveState();

    return createSuccessResponse({
      items: leasedTasks,
      count: leasedTasks.length,
      browserId
    });
  }

  /**
   * Handle heartbeat request
   */
  async handleHeartbeat(request: Request): Promise<Response> {
    const body = await request.json() as any;
    const { jobId, leaseId } = body;

    if (!jobId || !leaseId) {
      return createErrorResponse('jobId and leaseId are required', 400);
    }

    const lease = this.leases.get(jobId);
    if (!lease || lease.leaseId !== leaseId) {
      return createErrorResponse('Invalid lease', 400);
    }

    if (isTimestampExpired(lease.leaseUntil)) {
      // Lease already expired
      await this.releaseLease(jobId);
      return createErrorResponse('Lease expired', 410);
    }

    // Extend lease
    const leaseDurationMs = 30 * 60 * 1000; // 30 minutes
    lease.leaseUntil = getFutureTimestamp(leaseDurationMs);
    lease.heartbeatCount++;

    // Update in D1
    await this.env.DB.prepare(`
      UPDATE jobs 
      SET lease_until = ?, updated_at = ?
      WHERE job_id = ?
    `).bind(lease.leaseUntil, getCurrentTimestamp(), jobId).run();

    await this.saveState();

    return createSuccessResponse({
      success: true,
      jobId,
      leaseId,
      leaseUntil: lease.leaseUntil,
      heartbeatCount: lease.heartbeatCount
    });
  }

  /**
   * Handle release request (when task is completed)
   */
  async handleRelease(request: Request): Promise<Response> {
    const body = await request.json() as any;
    const { jobId, leaseId } = body;

    if (!jobId || !leaseId) {
      return createErrorResponse('jobId and leaseId are required', 400);
    }

    const lease = this.leases.get(jobId);
    if (!lease || lease.leaseId !== leaseId) {
      return createErrorResponse('Invalid lease', 400);
    }

    await this.releaseLease(jobId);
    await this.saveState();

    return createSuccessResponse({
      success: true,
      jobId,
      message: 'Lease released'
    });
  }

  /**
   * Handle status request
   */
  async handleStatus(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const browserId = url.searchParams.get('browserId');

    const status: any = {
      totalLeases: this.leases.size,
      browsers: this.browserLeases.size,
      leases: Array.from(this.leases.values()),
      timestamp: getCurrentTimestamp()
    };

    if (browserId) {
      const browserJobs = this.browserLeases.get(browserId) || new Set();
      status['browserLeases'] = Array.from(browserJobs).map(jobId => this.leases.get(jobId)).filter(Boolean);
    }

    return createSuccessResponse(status);
  }

  /**
   * Find available tasks in D1
   */
  async findAvailableTasks(browserId: string, maxItems: number): Promise<any[]> {
    const stmt = this.env.DB.prepare(`
      SELECT job_id, browser_id, task_name, url, content_type, priority, created_at, params_json
      FROM jobs 
      WHERE browser_id = ? AND state = 'queued'
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);

    const result = await stmt.bind(browserId, maxItems).all();
    return result.results || [];
  }

  /**
   * Create a lease for a task
   */
  async createLease(task: any, browserId: string): Promise<TaskLease | null> {
    const jobId = task.job_id;
    const leaseId = generateLeaseId();
    const now = getCurrentTimestamp();
    const leaseDurationMs = 30 * 60 * 1000; // 30 minutes
    const leaseUntil = getFutureTimestamp(leaseDurationMs);

    // Update job state in D1
    const updateResult = await this.env.DB.prepare(`
      UPDATE jobs 
      SET state = 'leased', lease_id = ?, lease_until = ?, updated_at = ?
      WHERE job_id = ? AND state = 'queued'
    `).bind(leaseId, leaseUntil, now, jobId).run();

    if (!updateResult.success || updateResult.changes === 0) {
      // Task was already leased by someone else
      return null;
    }

    // Create lease object
    const lease: TaskLease = {
      jobId,
      leaseId,
      browserId,
      leaseUntil,
      heartbeatCount: 0,
      createdAt: now
    };

    // Store in memory
    this.leases.set(jobId, lease);

    // Update browser index
    if (!this.browserLeases.has(browserId)) {
      this.browserLeases.set(browserId, new Set());
    }
    this.browserLeases.get(browserId)!.add(jobId);

    console.log(`✅ Created lease ${leaseId} for job ${jobId} (browser: ${browserId})`);
    return lease;
  }

  /**
   * Release a lease
   */
  async releaseLease(jobId: string): Promise<void> {
    const lease = this.leases.get(jobId);
    if (!lease) return;

    // Remove from memory
    this.leases.delete(jobId);

    // Update browser index
    const browserJobs = this.browserLeases.get(lease.browserId);
    if (browserJobs) {
      browserJobs.delete(jobId);
      if (browserJobs.size === 0) {
        this.browserLeases.delete(lease.browserId);
      }
    }

    console.log(`🔓 Released lease ${lease.leaseId} for job ${jobId}`);
  }

  /**
   * Clean up expired leases
   */
  async cleanupExpiredLeases(): Promise<void> {
    const now = getCurrentTimestamp();
    const expiredJobs: string[] = [];

    // Find expired leases
    for (const [jobId, lease] of this.leases) {
      if (isTimestampExpired(lease.leaseUntil)) {
        expiredJobs.push(jobId);
      }
    }

    if (expiredJobs.length === 0) return;

    console.log(`🧹 Cleaning up ${expiredJobs.length} expired leases`);

    // Update jobs back to queued state in D1
    for (const jobId of expiredJobs) {
      await this.env.DB.prepare(`
        UPDATE jobs 
        SET state = 'queued', lease_id = NULL, lease_until = NULL, 
            attempts = attempts + 1, updated_at = ?
        WHERE job_id = ?
      `).bind(now, jobId).run();

      // Release from memory
      await this.releaseLease(jobId);
    }
  }

  /**
   * Save state to durable storage
   */
  async saveState(): Promise<void> {
    await this.state.storage.put('leases', Array.from(this.leases.entries()));
  }

  /**
   * Alarm handler for periodic cleanup
   */
  async alarm(): Promise<void> {
    try {
      await this.cleanupExpiredLeases();
      await this.saveState();
      
      // Set next alarm
      // await this.state.setAlarm(Date.now() + 60000); // Check again in 1 minute
      
    } catch (error) {
      console.error('TaskQueue alarm error:', error);
      // Still set next alarm even if this one failed
      // await this.state.setAlarm(Date.now() + 60000);
    }
  }
}
