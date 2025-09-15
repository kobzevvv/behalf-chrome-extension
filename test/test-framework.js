/**
 * Comprehensive Test Framework for Cloudflare-native Refactor
 * Test-driven development approach with clear pass/fail indicators
 */

import { expect } from 'chai';

export class TestFramework {
  constructor(config = {}) {
    this.config = {
      workerUrl: config.workerUrl || 'http://localhost:8787',
      webhookUrl: config.webhookUrl || 'http://localhost:3001',
      testBrowserId: config.testBrowserId || 'test-browser-tdd',
      timeout: config.timeout || 30000,
      ...config
    };
    
    this.results = [];
    this.webhookService = null;
  }

  /**
   * Test Suite: Core API Endpoints (v2)
   */
  async testCoreAPIEndpoints() {
    console.log('\n🧪 Testing Core API Endpoints (v2)...\n');
    
    const tests = [
      () => this.testHealthCheck(),
      () => this.testCreateTask(),
      () => this.testLeaseTask(),
      () => this.testHeartbeat(),
      () => this.testSubmitTask(),
      () => this.testTaskStatus(),
      () => this.testArtifacts(),
      () => this.testStats()
    ];

    for (const test of tests) {
      try {
        await test();
      } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        this.results.push({ test: test.name, status: 'FAILED', error: error.message });
      }
    }
  }

  /**
   * Test Suite: End-to-End Flow
   */
  async testEndToEndFlow() {
    console.log('\n🔄 Testing End-to-End Flow...\n');
    
    try {
      // 1. Create task with webhook
      const taskResult = await this.createTaskWithWebhook();
      console.log('✅ Task created:', taskResult.jobId);
      
      // 2. Lease task
      const leaseResult = await this.leaseTask(taskResult.jobId);
      console.log('✅ Task leased:', leaseResult.leaseId);
      
      // 3. Submit HTML content
      const submitResult = await this.submitTaskContent(taskResult.jobId, leaseResult.leaseId);
      console.log('✅ Content submitted:', submitResult.recordId);
      
      // 4. Verify webhook delivery
      await this.verifyWebhookDelivery(taskResult.jobId);
      console.log('✅ Webhook delivered successfully');
      
      // 5. Verify golden data
      await this.verifyGoldenData(taskResult.jobId);
      console.log('✅ Golden data verification passed');
      
      this.results.push({ test: 'End-to-End Flow', status: 'PASSED' });
      
    } catch (error) {
      console.error(`❌ E2E Test failed: ${error.message}`);
      this.results.push({ test: 'End-to-End Flow', status: 'FAILED', error: error.message });
    }
  }

  /**
   * Test Suite: Error Handling & Edge Cases
   */
  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling & Edge Cases...\n');
    
    const tests = [
      () => this.testInvalidJobId(),
      () => this.testExpiredLease(),
      () => this.testInvalidWebhookUrl(),
      () => this.testLargeContentHandling(),
      () => this.testContentDeduplication(),
      () => this.testConcurrentLeases()
    ];

    for (const test of tests) {
      try {
        await test();
      } catch (error) {
        console.error(`❌ Error test failed: ${error.message}`);
        this.results.push({ test: test.name, status: 'FAILED', error: error.message });
      }
    }
  }

  /**
   * Individual Test Methods
   */
  
  async testHealthCheck() {
    console.log('🔍 Testing health check...');
    const response = await fetch(`${this.config.workerUrl}/health`);
    expect(response.status).to.equal(200);
    
    const data = await response.json();
    expect(data).to.have.property('status', 'healthy');
    expect(data).to.have.property('timestamp');
    expect(data).to.have.property('services');
    
    console.log('✅ Health check passed');
    this.results.push({ test: 'Health Check', status: 'PASSED' });
  }

  async testCreateTask() {
    console.log('🔍 Testing task creation...');
    
    const taskData = {
      browserId: this.config.testBrowserId,
      taskName: 'Get Page HTML',
      url: 'https://httpbin.org/html',
      contentType: 'test-content',
      callbackUrl: `${this.config.webhookUrl}/test-webhook/create-task-test`
    };

    const response = await fetch(`${this.config.workerUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });

    expect(response.status).to.equal(201);
    
    const result = await response.json();
    expect(result).to.have.property('jobId');
    expect(result).to.have.property('state', 'queued');
    expect(result.browserId).to.equal(taskData.browserId);
    
    console.log('✅ Task creation passed');
    this.results.push({ test: 'Create Task', status: 'PASSED', jobId: result.jobId });
    return result;
  }

  async testLeaseTask() {
    console.log('🔍 Testing task leasing...');
    
    const leaseData = {
      browserId: this.config.testBrowserId,
      max: 1
    };

    const response = await fetch(`${this.config.workerUrl}/lease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leaseData)
    });

    expect(response.status).to.equal(200);
    
    const result = await response.json();
    expect(result).to.have.property('items');
    expect(result.items).to.be.an('array');
    
    if (result.items.length > 0) {
      const item = result.items[0];
      expect(item).to.have.property('jobId');
      expect(item).to.have.property('leaseId');
      expect(item).to.have.property('leaseUntil');
      expect(item).to.have.property('url');
    }
    
    console.log('✅ Task leasing passed');
    this.results.push({ test: 'Lease Task', status: 'PASSED' });
    return result.items[0] || null;
  }

  async testHeartbeat() {
    console.log('🔍 Testing heartbeat...');
    
    // First create and lease a task
    const task = await this.testCreateTask();
    const lease = await this.testLeaseTask();
    
    if (!lease) {
      throw new Error('No lease available for heartbeat test');
    }

    const heartbeatData = {
      jobId: lease.jobId,
      leaseId: lease.leaseId
    };

    const response = await fetch(`${this.config.workerUrl}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(heartbeatData)
    });

    expect(response.status).to.equal(200);
    
    const result = await response.json();
    expect(result).to.have.property('success', true);
    expect(result).to.have.property('leaseUntil');
    
    console.log('✅ Heartbeat passed');
    this.results.push({ test: 'Heartbeat', status: 'PASSED' });
    return result;
  }

  async testSubmitTask() {
    console.log('🔍 Testing task submission...');
    
    // This will be implemented after we have the full flow
    // For now, just mark as pending
    console.log('⏳ Task submission test pending implementation');
    this.results.push({ test: 'Submit Task', status: 'PENDING' });
  }

  async testTaskStatus() {
    console.log('🔍 Testing task status...');
    
    const task = await this.testCreateTask();
    
    const response = await fetch(`${this.config.workerUrl}/status/${task.jobId}`);
    expect(response.status).to.equal(200);
    
    const result = await response.json();
    expect(result).to.have.property('jobId', task.jobId);
    expect(result).to.have.property('state');
    expect(result).to.have.property('createdAt');
    
    console.log('✅ Task status passed');
    this.results.push({ test: 'Task Status', status: 'PASSED' });
    return result;
  }

  async testArtifacts() {
    console.log('🔍 Testing artifacts endpoint...');
    
    const task = await this.testCreateTask();
    
    const response = await fetch(`${this.config.workerUrl}/artifacts/${task.jobId}`);
    expect(response.status).to.equal(200);
    
    const result = await response.json();
    expect(result).to.have.property('jobId', task.jobId);
    // Initially, artifacts should be empty
    
    console.log('✅ Artifacts test passed');
    this.results.push({ test: 'Artifacts', status: 'PASSED' });
    return result;
  }

  async testStats() {
    console.log('🔍 Testing stats endpoint...');
    
    const response = await fetch(`${this.config.workerUrl}/stats`);
    expect(response.status).to.equal(200);
    
    const result = await response.json();
    expect(result).to.have.property('jobs');
    expect(result).to.have.property('generatedAt');
    
    console.log('✅ Stats test passed');
    this.results.push({ test: 'Stats', status: 'PASSED' });
    return result;
  }

  /**
   * Helper Methods for Complex Tests
   */
  
  async createTaskWithWebhook() {
    const testId = `e2e-${Date.now()}`;
    const taskData = {
      browserId: this.config.testBrowserId,
      taskName: 'Get Page HTML',
      url: 'https://httpbin.org/html',
      contentType: 'test-content',
      callbackUrl: `${this.config.webhookUrl}/test-webhook/${testId}`,
      callbackSecretId: 'test-secret'
    };

    const response = await fetch(`${this.config.workerUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });

    if (!response.ok) {
      throw new Error(`Failed to create task: ${response.status}`);
    }

    const result = await response.json();
    result.testId = testId;
    return result;
  }

  async leaseTask(jobId) {
    const leaseData = {
      browserId: this.config.testBrowserId,
      max: 1
    };

    const response = await fetch(`${this.config.workerUrl}/lease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leaseData)
    });

    if (!response.ok) {
      throw new Error(`Failed to lease task: ${response.status}`);
    }

    const result = await response.json();
    const lease = result.items.find(item => item.jobId === jobId);
    
    if (!lease) {
      throw new Error(`Job ${jobId} not found in lease response`);
    }

    return lease;
  }

  async submitTaskContent(jobId, leaseId) {
    const testHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Test Content</h1>
          <p>This is test content for job ${jobId}</p>
        </body>
      </html>
    `;

    const submitData = {
      jobId,
      leaseId,
      contentType: 'text/html; charset=utf-8',
      size: testHtml.length,
      sha256: await this.generateSHA256(testHtml),
      htmlBase64: btoa(testHtml)
    };

    const response = await fetch(`${this.config.workerUrl}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitData)
    });

    if (!response.ok) {
      throw new Error(`Failed to submit task: ${response.status}`);
    }

    return await response.json();
  }

  async verifyWebhookDelivery(jobId, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Check if webhook was delivered
      // This would query the test webhook service
      const webhooks = await this.getReceivedWebhooks(jobId);
      
      if (webhooks.length > 0) {
        const webhook = webhooks[0];
        expect(webhook.payload).to.have.property('job_id', jobId);
        expect(webhook.payload).to.have.property('phase', 'ingested');
        return webhook;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Webhook not delivered within ${timeout}ms`);
  }

  async verifyGoldenData(jobId) {
    // Verify the stored data matches expected patterns
    const artifacts = await fetch(`${this.config.workerUrl}/artifacts/${jobId}`);
    const artifactData = await artifacts.json();
    
    expect(artifactData).to.have.property('raw_r2_key');
    expect(artifactData).to.have.property('raw_sha256');
    expect(artifactData).to.have.property('raw_bytes');
    
    // Additional golden data checks would go here
    return artifactData;
  }

  async getReceivedWebhooks(testId) {
    try {
      const response = await fetch(`${this.config.webhookUrl}/test-webhook/${testId}/received`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      // Webhook service might not be running yet
    }
    return [];
  }

  async generateSHA256(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Error Handling Tests
   */
  
  async testInvalidJobId() {
    console.log('🔍 Testing invalid job ID handling...');
    
    const response = await fetch(`${this.config.workerUrl}/status/invalid-job-id`);
    expect(response.status).to.equal(404);
    
    console.log('✅ Invalid job ID test passed');
    this.results.push({ test: 'Invalid Job ID', status: 'PASSED' });
  }

  async testExpiredLease() {
    console.log('🔍 Testing expired lease handling...');
    // This test will be implemented when we have lease expiry logic
    console.log('⏳ Expired lease test pending implementation');
    this.results.push({ test: 'Expired Lease', status: 'PENDING' });
  }

  async testInvalidWebhookUrl() {
    console.log('🔍 Testing invalid webhook URL handling...');
    // This test will be implemented when we have webhook validation
    console.log('⏳ Invalid webhook URL test pending implementation');
    this.results.push({ test: 'Invalid Webhook URL', status: 'PENDING' });
  }

  async testLargeContentHandling() {
    console.log('🔍 Testing large content handling...');
    // This test will be implemented when we have R2 upload flow
    console.log('⏳ Large content test pending implementation');
    this.results.push({ test: 'Large Content', status: 'PENDING' });
  }

  async testContentDeduplication() {
    console.log('🔍 Testing content deduplication...');
    // This test will be implemented when we have dedup logic
    console.log('⏳ Content deduplication test pending implementation');
    this.results.push({ test: 'Content Deduplication', status: 'PENDING' });
  }

  async testConcurrentLeases() {
    console.log('🔍 Testing concurrent lease handling...');
    // This test will be implemented when we have DO lease logic
    console.log('⏳ Concurrent leases test pending implementation');
    this.results.push({ test: 'Concurrent Leases', status: 'PENDING' });
  }

  /**
   * Test Runner & Reporting
   */
  
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Test Suite...\n');
    
    this.results = [];
    
    try {
      await this.testCoreAPIEndpoints();
      await this.testEndToEndFlow();
      await this.testErrorHandling();
    } catch (error) {
      console.error('💥 Test suite failed:', error);
    }
    
    this.printResults();
    return this.results;
  }

  printResults() {
    console.log('\n📊 Test Results Summary\n');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const pending = this.results.filter(r => r.status === 'PENDING').length;
    
    console.log(`✅ PASSED: ${passed}`);
    console.log(`❌ FAILED: ${failed}`);
    console.log(`⏳ PENDING: ${pending}`);
    console.log(`📊 TOTAL: ${this.results.length}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => r.status === 'FAILED')
        .forEach(r => console.log(`   - ${r.test}: ${r.error}`));
    }
    
    if (pending > 0) {
      console.log('\n⏳ Pending Tests:');
      this.results
        .filter(r => r.status === 'PENDING')
        .forEach(r => console.log(`   - ${r.test}`));
    }
    
    console.log('\n' + '='.repeat(50));
    
    const successRate = Math.round((passed / (passed + failed)) * 100) || 0;
    console.log(`🎯 Success Rate: ${successRate}% (${passed}/${passed + failed})`);
  }
}

// Export for use in other test files
export default TestFramework;
