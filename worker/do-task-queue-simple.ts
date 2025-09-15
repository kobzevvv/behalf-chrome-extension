/**
 * TaskQueue Durable Object - Simplified Version
 * Manages task leasing, heartbeats, and lease expiration
 */

import { generateLeaseId, getCurrentTimestamp, getFutureTimestamp } from './utils/ids';

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
  private env: any;
  private leases: Map<string, TaskLease> = new Map(); // jobId -> lease
  private browserLeases: Map<string, Set<string>> = new Map(); // browserId -> Set<jobId>

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    
    // Initialize from storage
    this.state.blockConcurrencyWhile(async () => {
      const storedLeases = await this.state.storage.get<[string, TaskLease][]>('leases');
      if (storedLeases) {
        this.leases = new Map(storedLeases);
        
        // Rebuild browser index
        for (const [jobId, lease] of this.leases) {
          if (!this.browserLeases.has(lease.browserId)) {
            this.browserLeases.set(lease.browserId, new Set());
          }
          this.browserLeases.get(lease.browserId)!.add(jobId);
        }
      }
    });
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
          return new Response(JSON.stringify({ error: 'Not Found' }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json' } 
          });
      }
    } catch (error) {
      console.error('TaskQueue DO error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal Error', 
        message: (error as Error).message 
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  }

  /**
   * Handle lease request from worker
   */
  async handleLease(request: Request): Promise<Response> {
    const body = await request.json() as any;
    const { browserId, jobId, maxLeaseDuration = 30 * 60 * 1000 } = body;

    if (!browserId || !jobId) {
      return new Response(JSON.stringify({ 
        error: 'browserId and jobId are required' 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Check if job is already leased
    if (this.leases.has(jobId)) {
      const existingLease = this.leases.get(jobId)!;
      
      // If lease is expired, clean it up
      if (getCurrentTimestamp() > existingLease.leaseUntil) {
        await this.releaseLease(jobId);
      } else {
        // Job is currently leased
        return new Response(JSON.stringify({ 
          error: 'Job already leased', 
          leaseId: existingLease.leaseId,
          leaseUntil: existingLease.leaseUntil
        }), { 
          status: 409, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }
    }

    // Create new lease
    const leaseId = generateLeaseId();
    const now = getCurrentTimestamp();
    const leaseUntil = getFutureTimestamp(maxLeaseDuration);

    const lease: TaskLease = {
      jobId,
      leaseId,
      browserId,
      leaseUntil,
      heartbeatCount: 0,
      createdAt: now
    };

    // Store lease
    this.leases.set(jobId, lease);

    // Update browser index
    if (!this.browserLeases.has(browserId)) {
      this.browserLeases.set(browserId, new Set());
    }
    this.browserLeases.get(browserId)!.add(jobId);

    // Persist to durable storage
    await this.saveState();

    console.log(`🔒 Created lease ${leaseId} for job ${jobId} (browser: ${browserId})`);

    return new Response(JSON.stringify({
      success: true,
      leaseId,
      leaseUntil,
      maxLeaseDuration
    }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  /**
   * Handle heartbeat to extend lease
   */
  async handleHeartbeat(request: Request): Promise<Response> {
    const body = await request.json() as any;
    const { jobId, leaseId } = body;

    if (!jobId || !leaseId) {
      return new Response(JSON.stringify({ 
        error: 'jobId and leaseId are required' 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const lease = this.leases.get(jobId);
    if (!lease || lease.leaseId !== leaseId) {
      return new Response(JSON.stringify({ 
        error: 'Invalid lease' 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Check if lease is expired
    if (getCurrentTimestamp() > lease.leaseUntil) {
      await this.releaseLease(jobId);
      return new Response(JSON.stringify({ 
        error: 'Lease expired' 
      }), { 
        status: 410, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Extend lease
    const leaseDurationMs = 30 * 60 * 1000; // 30 minutes
    lease.leaseUntil = getFutureTimestamp(leaseDurationMs);
    lease.heartbeatCount++;

    await this.saveState();

    console.log(`💓 Heartbeat for job ${jobId}, lease extended until ${new Date(lease.leaseUntil).toISOString()}`);

    return new Response(JSON.stringify({
      success: true,
      leaseUntil: lease.leaseUntil,
      heartbeatCount: lease.heartbeatCount
    }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  /**
   * Handle lease release (when task is completed)
   */
  async handleRelease(request: Request): Promise<Response> {
    const body = await request.json() as any;
    const { jobId, leaseId } = body;

    if (!jobId || !leaseId) {
      return new Response(JSON.stringify({ 
        error: 'jobId and leaseId are required' 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const lease = this.leases.get(jobId);
    if (!lease || lease.leaseId !== leaseId) {
      return new Response(JSON.stringify({ 
        error: 'Invalid lease' 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    await this.releaseLease(jobId);
    await this.saveState();

    console.log(`🔓 Released lease ${leaseId} for job ${jobId}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Lease released'
    }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  /**
   * Handle status request
   */
  async handleStatus(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const browserId = url.searchParams.get('browserId');

    const status = {
      totalLeases: this.leases.size,
      browsers: this.browserLeases.size,
      timestamp: getCurrentTimestamp()
    };

    if (browserId) {
      const browserJobs = this.browserLeases.get(browserId) || new Set();
      const browserLeases = Array.from(browserJobs)
        .map(jobId => this.leases.get(jobId))
        .filter(Boolean);
      
      (status as any).browserLeases = browserLeases;
    } else {
      (status as any).allLeases = Array.from(this.leases.values());
    }

    return new Response(JSON.stringify(status), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  /**
   * Release a lease
   */
  private async releaseLease(jobId: string): Promise<void> {
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

    console.log(`🗑️  Released lease ${lease.leaseId} for job ${jobId}`);
  }

  /**
   * Save state to durable storage
   */
  private async saveState(): Promise<void> {
    await this.state.storage.put('leases', Array.from(this.leases.entries()));
  }

  /**
   * Cleanup expired leases (called periodically)
   */
  async cleanupExpiredLeases(): Promise<void> {
    const now = getCurrentTimestamp();
    const expiredJobs: string[] = [];

    // Find expired leases
    for (const [jobId, lease] of this.leases) {
      if (now > lease.leaseUntil) {
        expiredJobs.push(jobId);
      }
    }

    if (expiredJobs.length === 0) return;

    console.log(`🧹 Cleaning up ${expiredJobs.length} expired leases`);

    // Release expired leases
    for (const jobId of expiredJobs) {
      await this.releaseLease(jobId);
    }

    await this.saveState();
  }
}
