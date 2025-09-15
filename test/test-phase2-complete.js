#!/usr/bin/env node
/**
 * Phase 2 Complete Test - Comprehensive validation of our implementation
 */

import TestWebhookService from './webhook-service.js';

async function runPhase2Tests() {
  console.log('🎯 Phase 2 Complete Test Suite\n');
  console.log('Testing: Full Worker with D1, API endpoints, and comprehensive functionality\n');
  
  const config = {
    workerUrl: 'http://localhost:8788',
    webhookUrl: 'http://localhost:3001',
    testBrowserId: `test-phase2-${Date.now()}`,
    timeout: 15000
  };
  
  let webhookService;
  let results = [];
  
  try {
    // Start services
    console.log('🚀 Starting test services...');
    webhookService = new TestWebhookService(3001);
    await webhookService.start();
    console.log('✅ Services ready\n');
    
    // Phase 2 Test 1: Advanced Health Check
    console.log('🔍 Test 1: Advanced health check...');
    try {
      const response = await fetch(`${config.workerUrl}/health`);
      const health = await response.json();
      
      console.log('📊 System Status:');
      console.log(`   Overall: ${health.status}`);
      console.log(`   Database: ${health.services.database}`);
      console.log(`   Storage: ${health.services.storage}`);
      console.log(`   Queues: ${health.services.queues}`);
      console.log(`   Version: ${health.version}`);
      
      if (health.status === 'healthy' && health.services.database === 'healthy') {
        console.log('✅ Advanced health check passed');
        results.push({ test: 'Advanced Health Check', status: 'PASSED' });
      } else {
        throw new Error('Health check failed');
      }
    } catch (error) {
      console.error('❌ Advanced health check failed:', error.message);
      results.push({ test: 'Advanced Health Check', status: 'FAILED', error: error.message });
    }
    
    // Phase 2 Test 2: Task Creation with Rich Metadata
    console.log('\n🔍 Test 2: Task creation with rich metadata...');
    let taskIds = [];
    try {
      const tasks = [
        { browserId: config.testBrowserId, url: 'https://example.com/resume1', contentType: 'resumes', priority: 1 },
        { browserId: config.testBrowserId, url: 'https://example.com/job1', contentType: 'job-listings', priority: 2 },
        { browserId: config.testBrowserId, url: 'https://example.com/search1', contentType: 'search-results', priority: 0 }
      ];
      
      for (const taskData of tasks) {
        const response = await fetch(`${config.workerUrl}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...taskData,
            taskName: 'Get Page HTML'
          })
        });
        
        if (!response.ok) throw new Error(`Failed to create task: ${response.status}`);
        
        const result = await response.json();
        taskIds.push(result.jobId);
        
        console.log(`   ✅ Created ${result.contentType} task: ${result.jobId}`);
      }
      
      console.log(`✅ Created ${taskIds.length} tasks with different content types`);
      results.push({ test: 'Rich Task Creation', status: 'PASSED', data: { taskIds } });
      
    } catch (error) {
      console.error('❌ Task creation failed:', error.message);
      results.push({ test: 'Rich Task Creation', status: 'FAILED', error: error.message });
    }
    
    // Phase 2 Test 3: Database Persistence Verification
    console.log('\n🔍 Test 3: Database persistence verification...');
    try {
      const response = await fetch(`${config.workerUrl}/debug/jobs`);
      const debug = await response.json();
      
      console.log(`📊 Database Status:`);
      console.log(`   Total jobs in database: ${debug.totalJobs}`);
      console.log(`   Recent jobs:`);
      
      debug.jobs.slice(0, 3).forEach((job, i) => {
        console.log(`     ${i + 1}. ${job.job_id} - ${job.content_type} (${job.state})`);
      });
      
      if (debug.totalJobs >= taskIds.length) {
        console.log('✅ Database persistence verified');
        results.push({ test: 'Database Persistence', status: 'PASSED' });
      } else {
        throw new Error(`Expected ${taskIds.length} jobs, found ${debug.totalJobs}`);
      }
      
    } catch (error) {
      console.error('❌ Database verification failed:', error.message);
      results.push({ test: 'Database Persistence', status: 'FAILED', error: error.message });
    }
    
    // Phase 2 Test 4: Task Status Tracking
    if (taskIds.length > 0) {
      console.log('\n🔍 Test 4: Task status tracking...');
      try {
        const jobId = taskIds[0];
        const response = await fetch(`${config.workerUrl}/status/${jobId}`);
        const status = await response.json();
        
        console.log(`📊 Task Status for ${jobId}:`);
        console.log(`   State: ${status.state}`);
        console.log(`   Browser: ${status.browser_id}`);
        console.log(`   URL: ${status.url}`);
        console.log(`   Content Type: ${status.content_type}`);
        console.log(`   Priority: ${status.priority}`);
        console.log(`   Created: ${new Date(status.created_at).toISOString()}`);
        
        if (status.job_id === jobId && status.state === 'queued') {
          console.log('✅ Task status tracking verified');
          results.push({ test: 'Task Status Tracking', status: 'PASSED' });
        } else {
          throw new Error('Status data inconsistent');
        }
        
      } catch (error) {
        console.error('❌ Task status tracking failed:', error.message);
        results.push({ test: 'Task Status Tracking', status: 'FAILED', error: error.message });
      }
    } else {
      results.push({ test: 'Task Status Tracking', status: 'SKIPPED', error: 'No tasks created' });
    }
    
    // Phase 2 Test 5: Advanced Statistics
    console.log('\n🔍 Test 5: Advanced statistics...');
    try {
      // Test general stats
      const generalResponse = await fetch(`${config.workerUrl}/stats`);
      const generalStats = await generalResponse.json();
      
      // Test filtered stats
      const filteredResponse = await fetch(`${config.workerUrl}/stats?contentType=resumes`);
      const filteredStats = await filteredResponse.json();
      
      console.log(`📊 Statistics Summary:`);
      console.log(`   Total jobs: ${generalStats.jobs.total_jobs || 0}`);
      console.log(`   Queued jobs: ${generalStats.jobs.queued_jobs || 0}`);
      console.log(`   Total artifacts: ${generalStats.content.total_artifacts || 0}`);
      console.log(`   Resume jobs (filtered): ${filteredStats.jobs.total_jobs || 0}`);
      
      if (generalStats.jobs && filteredStats.filters) {
        console.log('✅ Advanced statistics verified');
        results.push({ test: 'Advanced Statistics', status: 'PASSED' });
      } else {
        throw new Error('Statistics format incorrect');
      }
      
    } catch (error) {
      console.error('❌ Advanced statistics failed:', error.message);
      results.push({ test: 'Advanced Statistics', status: 'FAILED', error: error.message });
    }
    
    // Phase 2 Test 6: API Error Handling
    console.log('\n🔍 Test 6: API error handling...');
    try {
      const tests = [
        { endpoint: '/tasks', method: 'POST', data: {}, expectedStatus: 400, desc: 'Missing required fields' },
        { endpoint: '/tasks', method: 'POST', data: { browserId: 'test', url: 'invalid-url' }, expectedStatus: 400, desc: 'Invalid URL' },
        { endpoint: '/status/nonexistent', method: 'GET', expectedStatus: 404, desc: 'Nonexistent job' },
        { endpoint: '/lease', method: 'POST', data: {}, expectedStatus: 400, desc: 'Missing browser ID' }
      ];
      
      let errorTestsPassed = 0;
      for (const test of tests) {
        try {
          const response = await fetch(`${config.workerUrl}${test.endpoint}`, {
            method: test.method,
            headers: { 'Content-Type': 'application/json' },
            body: test.data ? JSON.stringify(test.data) : undefined
          });
          
          if (response.status === test.expectedStatus) {
            console.log(`   ✅ ${test.desc}: ${response.status}`);
            errorTestsPassed++;
          } else {
            console.log(`   ❌ ${test.desc}: Expected ${test.expectedStatus}, got ${response.status}`);
          }
        } catch (error) {
          console.log(`   ❌ ${test.desc}: ${error.message}`);
        }
      }
      
      if (errorTestsPassed === tests.length) {
        console.log('✅ API error handling verified');
        results.push({ test: 'API Error Handling', status: 'PASSED' });
      } else {
        throw new Error(`${errorTestsPassed}/${tests.length} error tests passed`);
      }
      
    } catch (error) {
      console.error('❌ API error handling failed:', error.message);
      results.push({ test: 'API Error Handling', status: 'FAILED', error: error.message });
    }
    
    // Phase 2 Test 7: CORS Support
    console.log('\n🔍 Test 7: CORS support...');
    try {
      const response = await fetch(`${config.workerUrl}/health`, {
        method: 'OPTIONS'
      });
      
      const corsHeaders = {
        'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
        'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
        'access-control-allow-headers': response.headers.get('access-control-allow-headers')
      };
      
      console.log(`📊 CORS Headers:`);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        console.log(`   ${key}: ${value}`);
      });
      
      if (corsHeaders['access-control-allow-origin'] === '*' && 
          corsHeaders['access-control-allow-methods']?.includes('POST')) {
        console.log('✅ CORS support verified');
        results.push({ test: 'CORS Support', status: 'PASSED' });
      } else {
        throw new Error('CORS headers missing or incorrect');
      }
      
    } catch (error) {
      console.error('❌ CORS support failed:', error.message);
      results.push({ test: 'CORS Support', status: 'FAILED', error: error.message });
    }
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    results.push({ test: 'Test Suite', status: 'FAILED', error: error.message });
  }
  
  // Print comprehensive results
  console.log('\n' + '='.repeat(70));
  console.log('📊 Phase 2 Complete Test Results');
  console.log('='.repeat(70));
  
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
  
  console.log('\n' + '='.repeat(70));
  console.log(`🎯 Final Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  // Phase 2 Assessment
  console.log('\n🎉 Phase 2 Assessment:');
  
  if (failed === 0) {
    console.log('✅ ALL TESTS PASSED! Phase 2 implementation is working correctly.');
    console.log('\n🚀 What we\'ve accomplished in Phase 2:');
    console.log('   ✅ Full D1 database integration');
    console.log('   ✅ Complete v2 API with all endpoints');
    console.log('   ✅ Rich task creation and management');
    console.log('   ✅ Advanced statistics and filtering');
    console.log('   ✅ Comprehensive error handling');
    console.log('   ✅ CORS support for web integration');
    console.log('   ✅ Database persistence and verification');
    
    console.log('\n🎯 Ready for Phase 3:');
    console.log('   🔄 Durable Objects for lease management');
    console.log('   🔄 R2 integration for file storage');
    console.log('   🔄 Webhook system with HMAC signing');
    console.log('   🔄 Full end-to-end task lifecycle');
    
  } else if (failed <= 2) {
    console.log('⚠️  MOSTLY SUCCESSFUL with minor issues.');
    console.log('   Core functionality is working, some advanced features need refinement.');
    
  } else {
    console.log('❌ NEEDS ATTENTION - Multiple test failures.');
    console.log('   Review the errors above before proceeding to Phase 3.');
  }
  
  console.log('\n' + '='.repeat(70));
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run the comprehensive test
runPhase2Tests().catch(error => {
  console.error('💥 Phase 2 test runner failed:', error);
  process.exit(1);
});
