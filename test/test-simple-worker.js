#!/usr/bin/env node
/**
 * Test Simple Worker - Test our basic worker implementation
 */

import TestFramework from './test-framework.js';

async function testSimpleWorker() {
  console.log('🧪 Testing Simple Worker Implementation...\n');
  
  const config = {
    workerUrl: 'http://localhost:8787',
    webhookUrl: 'http://localhost:3001',
    testBrowserId: 'test-simple-worker',
    timeout: 10000
  };
  
  const framework = new TestFramework(config);
  let results = [];
  
  try {
    // Test 1: Health Check
    console.log('🔍 Test 1: Health check...');
    try {
      await framework.testHealthCheck();
      results.push({ test: 'Health Check', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      results.push({ test: 'Health Check', status: 'FAILED', error: error.message });
    }
    
    // Test 2: Create Task
    console.log('\n🔍 Test 2: Create task...');
    try {
      const task = await framework.testCreateTask();
      console.log('✅ Task created:', task.jobId);
      results.push({ test: 'Create Task', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Create task failed:', error.message);
      results.push({ test: 'Create Task', status: 'FAILED', error: error.message });
    }
    
    // Test 3: Lease Task (should return empty for now)
    console.log('\n🔍 Test 3: Lease task...');
    try {
      const lease = await framework.testLeaseTask();
      console.log('✅ Lease request successful (empty result expected)');
      results.push({ test: 'Lease Task', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Lease task failed:', error.message);
      results.push({ test: 'Lease Task', status: 'FAILED', error: error.message });
    }
    
    // Test 4: Stats
    console.log('\n🔍 Test 4: Stats endpoint...');
    try {
      const stats = await framework.testStats();
      console.log('✅ Stats retrieved successfully');
      results.push({ test: 'Stats', status: 'PASSED' });
    } catch (error) {
      console.error('❌ Stats failed:', error.message);
      results.push({ test: 'Stats', status: 'FAILED', error: error.message });
    }
    
    // Test 5: Invalid endpoint
    console.log('\n🔍 Test 5: Invalid endpoint handling...');
    try {
      const response = await fetch(`${config.workerUrl}/invalid-endpoint`);
      if (response.status === 404) {
        console.log('✅ Invalid endpoint correctly returns 404');
        results.push({ test: 'Invalid Endpoint', status: 'PASSED' });
      } else {
        throw new Error(`Expected 404, got ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Invalid endpoint test failed:', error.message);
      results.push({ test: 'Invalid Endpoint', status: 'FAILED', error: error.message });
    }
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    results.push({ test: 'Test Suite', status: 'FAILED', error: error.message });
  }
  
  // Print results
  console.log('\n📊 Simple Worker Test Results');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  
  results.forEach(result => {
    const status = result.status === 'PASSED' ? '✅' : '❌';
    console.log(`${status} ${result.test}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`🎯 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All simple worker tests passed!');
    console.log('✅ Ready to implement full functionality');
  } else {
    console.log('⚠️  Some tests failed. Check the errors above.');
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
testSimpleWorker().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
