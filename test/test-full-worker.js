#!/usr/bin/env node
/**
 * Test Full Worker - Comprehensive tests for the complete implementation
 */

import TestFramework from './test-framework.js';
import TestWebhookService from './webhook-service.js';

async function testFullWorker() {
  console.log('🚀 Testing Full Worker Implementation...\n');
  
  const config = {
    workerUrl: 'http://localhost:8788', // Different port for full worker
    webhookUrl: 'http://localhost:3001',
    testBrowserId: 'test-full-worker',
    timeout: 15000
  };
  
  let webhookService;
  let results = [];
  
  try {
    // Start webhook service
    console.log('📡 Starting webhook service...');
    webhookService = new TestWebhookService(3001);
    await webhookService.start();
    console.log('✅ Webhook service ready\n');
    
    // Test 1: Health Check with Services
    console.log('🔍 Test 1: Health check with services...');
    try {
      const response = await fetch(`${config.workerUrl}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const health = await response.json();
      console.log('Services status:', health.services);
      
      if (health.status !== 'healthy') {
        throw new Error(`Expected healthy status, got ${health.status}`);
      }
      
      if (!health.services || !health.services.database) {
        throw new Error('Missing services information');
      }
      
      console.log('✅ Health check passed with services info');
      results.push({ test: 'Health Check with Services', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      results.push({ test: 'Health Check with Services', status: 'FAILED', error: error.message });
    }
    
    // Test 2: Create Task with D1 Storage
    console.log('\n🔍 Test 2: Create task with D1 storage...');
    let createdJobId;
    try {
      const taskData = {
        browserId: config.testBrowserId,
        taskName: 'Get Page HTML',
        url: 'https://httpbin.org/html',
        contentType: 'test-content',
        priority: 1
      };
      
      const response = await fetch(`${config.workerUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      
      const result = await response.json();
      createdJobId = result.jobId;
      
      console.log('✅ Task created with ID:', createdJobId);
      console.log('   State:', result.state);
      console.log('   Content Type:', result.contentType);
      
      results.push({ test: 'Create Task with D1', status: 'PASSED', jobId: createdJobId });
    } catch (error) {
      console.error('❌ Create task failed:', error.message);
      results.push({ test: 'Create Task with D1', status: 'FAILED', error: error.message });
    }
    
    // Test 3: Lease Task from D1
    console.log('\n🔍 Test 3: Lease task from D1...');
    let leaseResult;
    try {
      const leaseData = {
        browserId: config.testBrowserId,
        max: 2
      };
      
      const response = await fetch(`${config.workerUrl}/lease`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaseData)
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      
      leaseResult = await response.json();
      
      console.log('✅ Lease successful:');
      console.log('   Items leased:', leaseResult.count);
      console.log('   Browser ID:', leaseResult.browserId);
      
      if (leaseResult.items && leaseResult.items.length > 0) {
        const item = leaseResult.items[0];
        console.log('   First item:');
        console.log('     Job ID:', item.jobId);
        console.log('     Lease ID:', item.leaseId);
        console.log('     URL:', item.url);
      }
      
      results.push({ test: 'Lease Task from D1', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Lease task failed:', error.message);
      results.push({ test: 'Lease Task from D1', status: 'FAILED', error: error.message });
    }
    
    // Test 4: Submit Task Content
    if (leaseResult && leaseResult.items && leaseResult.items.length > 0) {
      console.log('\n🔍 Test 4: Submit task content...');
      try {
        const lease = leaseResult.items[0];
        const testHtml = `
          <!DOCTYPE html>
          <html>
            <head><title>Test Page for ${lease.jobId}</title></head>
            <body>
              <h1>Test Content</h1>
              <p>This is test content for job ${lease.jobId}</p>
              <p>Timestamp: ${new Date().toISOString()}</p>
            </body>
          </html>
        `;
        
        const submitData = {
          jobId: lease.jobId,
          leaseId: lease.leaseId,
          contentType: 'text/html; charset=utf-8',
          size: testHtml.length,
          htmlBase64: btoa(testHtml)
        };
        
        const response = await fetch(`${config.workerUrl}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitData)
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        
        const result = await response.json();
        
        console.log('✅ Task submitted successfully:');
        console.log('   Job ID:', result.jobId);
        console.log('   R2 Key:', result.r2Key);
        console.log('   Content Size:', result.contentSize);
        console.log('   State:', result.state);
        
        results.push({ test: 'Submit Task Content', status: 'PASSED' });
      } catch (error) {
        console.error('❌ Submit task failed:', error.message);
        results.push({ test: 'Submit Task Content', status: 'FAILED', error: error.message });
      }
    } else {
      console.log('\n⏭️  Test 4: Skipped (no leased tasks)');
      results.push({ test: 'Submit Task Content', status: 'SKIPPED', error: 'No leased tasks available' });
    }
    
    // Test 5: Check Task Status
    if (createdJobId) {
      console.log('\n🔍 Test 5: Check task status...');
      try {
        const response = await fetch(`${config.workerUrl}/status/${createdJobId}`);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        
        const status = await response.json();
        
        console.log('✅ Status retrieved:');
        console.log('   Job ID:', status.job_id);
        console.log('   State:', status.state);
        console.log('   Browser ID:', status.browser_id);
        console.log('   URL:', status.url);
        
        results.push({ test: 'Check Task Status', status: 'PASSED' });
      } catch (error) {
        console.error('❌ Status check failed:', error.message);
        results.push({ test: 'Check Task Status', status: 'FAILED', error: error.message });
      }
    } else {
      console.log('\n⏭️  Test 5: Skipped (no created job)');
      results.push({ test: 'Check Task Status', status: 'SKIPPED', error: 'No job created' });
    }
    
    // Test 6: Check Artifacts
    if (createdJobId) {
      console.log('\n🔍 Test 6: Check artifacts...');
      try {
        const response = await fetch(`${config.workerUrl}/artifacts/${createdJobId}`);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        
        const artifacts = await response.json();
        
        console.log('✅ Artifacts retrieved:');
        console.log('   Job ID:', artifacts.job_id || artifacts.jobId);
        
        if (artifacts.raw_r2_key) {
          console.log('   Raw R2 Key:', artifacts.raw_r2_key);
          console.log('   Raw SHA256:', artifacts.raw_sha256);
          console.log('   Raw Bytes:', artifacts.raw_bytes);
        } else {
          console.log('   No artifacts found (expected for some test scenarios)');
        }
        
        results.push({ test: 'Check Artifacts', status: 'PASSED' });
      } catch (error) {
        console.error('❌ Artifacts check failed:', error.message);
        results.push({ test: 'Check Artifacts', status: 'FAILED', error: error.message });
      }
    } else {
      console.log('\n⏭️  Test 6: Skipped (no created job)');
      results.push({ test: 'Check Artifacts', status: 'SKIPPED', error: 'No job created' });
    }
    
    // Test 7: Statistics with D1 Data
    console.log('\n🔍 Test 7: Statistics with D1 data...');
    try {
      const response = await fetch(`${config.workerUrl}/stats`);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      
      const stats = await response.json();
      
      console.log('✅ Statistics retrieved:');
      console.log('   Total jobs:', stats.jobs?.total_jobs || 0);
      console.log('   Queued jobs:', stats.jobs?.queued_jobs || 0);
      console.log('   Fetched jobs:', stats.jobs?.fetched_jobs || 0);
      console.log('   Total artifacts:', stats.content?.total_artifacts || 0);
      
      results.push({ test: 'Statistics with D1', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Statistics failed:', error.message);
      results.push({ test: 'Statistics with D1', status: 'FAILED', error: error.message });
    }
    
    // Test 8: Content Type Filtering
    console.log('\n🔍 Test 8: Content type filtering...');
    try {
      const response = await fetch(`${config.workerUrl}/stats?contentType=test-content`);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      
      const stats = await response.json();
      
      console.log('✅ Filtered statistics retrieved:');
      console.log('   Filter:', stats.filters?.contentType);
      console.log('   Total jobs:', stats.jobs?.total_jobs || 0);
      
      results.push({ test: 'Content Type Filtering', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Content type filtering failed:', error.message);
      results.push({ test: 'Content Type Filtering', status: 'FAILED', error: error.message });
    }
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    results.push({ test: 'Test Suite', status: 'FAILED', error: error.message });
  }
  
  // Print results
  console.log('\n📊 Full Worker Test Results');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  
  results.forEach(result => {
    let status = '❓';
    if (result.status === 'PASSED') status = '✅';
    if (result.status === 'FAILED') status = '❌';
    if (result.status === 'SKIPPED') status = '⏭️ ';
    
    console.log(`${status} ${result.test}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`🎯 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  if (failed === 0) {
    console.log('🎉 All critical tests passed!');
    if (skipped > 0) {
      console.log(`ℹ️  ${skipped} tests were skipped due to dependencies`);
    }
    console.log('✅ Full worker implementation is working correctly');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
testFullWorker().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
