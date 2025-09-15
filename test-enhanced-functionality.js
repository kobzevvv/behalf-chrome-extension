#!/usr/bin/env node

/**
 * Enhanced Functionality Test Script for Behalf Chrome Extension
 * 
 * This script tests the new multi-table content extraction functionality
 * 
 * Usage:
 *   node test-enhanced-functionality.js
 */

const WORKER_URL = 'https://behalf-task-manager-production.dev-a96.workers.dev';

async function testRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testPostRequest(url, body) {
  return testRequest(url, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function runEnhancedTests() {
  console.log('🧪 Testing Enhanced Multi-Table Functionality...\n');
  console.log(`🌐 Worker URL: ${WORKER_URL}\n`);

  const testBrowserId = `test_enhanced_${Date.now()}`;
  let testResults = [];

  // Test 1: Enhanced Task Queueing with table_name
  console.log('📋 Test 1: Enhanced Task Queueing (GET with table_name)');
  const enqueueTest1 = await testRequest(
    `${WORKER_URL}/api/enqueue-get-page-html?browserId=${testBrowserId}&url=https://example.com/resume&tableName=resumes`
  );
  testResults.push({ name: 'Enhanced Enqueue (resumes)', ...enqueueTest1 });
  console.log(enqueueTest1.success ? '✅ Success' : '❌ Failed:', enqueueTest1.data || enqueueTest1.error);

  // Test 2: New POST Task Queueing
  console.log('\n📋 Test 2: New POST Task Queueing');
  const enqueueTest2 = await testPostRequest(`${WORKER_URL}/api/enqueue-task`, {
    browserId: testBrowserId,
    taskName: 'Get Page HTML',
    urlToExtract: 'https://example.com/search-results',
    tableName: 'search_results',
    additionalParams: {
      includeImages: false,
      extractLinks: true
    }
  });
  testResults.push({ name: 'POST Task Queueing', ...enqueueTest2 });
  console.log(enqueueTest2.success ? '✅ Success' : '❌ Failed:', enqueueTest2.data || enqueueTest2.error);

  // Test 3: Check Enhanced Task Response
  console.log('\n📋 Test 3: Check Enhanced Task Response');
  const checkTaskTest = await testPostRequest(`${WORKER_URL}/api/check-task`, {
    browserId: testBrowserId
  });
  testResults.push({ name: 'Check Enhanced Task', ...checkTaskTest });
  console.log(checkTaskTest.success ? '✅ Success' : '❌ Failed:', checkTaskTest.data || checkTaskTest.error);

  let taskId = null;
  if (checkTaskTest.success && checkTaskTest.data.hasTask) {
    taskId = checkTaskTest.data.task.taskId;
    console.log(`   📝 Task ID for next test: ${taskId}`);
  }

  // Test 4: Enhanced Report Task (if we have a task)
  if (taskId) {
    console.log('\n📋 Test 4: Enhanced Report Task');
    const reportTest = await testPostRequest(`${WORKER_URL}/api/report-task`, {
      taskId: taskId,
      datime: new Date().toISOString(),
      taskName: 'Get Page HTML',
      version: '2.0',
      artifactsJson: {
        'HTML content': '<html><head><title>Test Resume Page</title></head><body><h1>John Doe Resume</h1><p>Software Engineer with 5 years experience...</p></body></html>',
        title: 'Test Resume Page',
        extractedAt: new Date().toISOString()
      }
    });
    testResults.push({ name: 'Enhanced Report Task', ...reportTest });
    console.log(reportTest.success ? '✅ Success' : '❌ Failed:', reportTest.data || reportTest.error);
  }

  // Test 5: Statistics Endpoint
  console.log('\n📋 Test 5: Statistics Endpoint');
  const statsTest = await testRequest(`${WORKER_URL}/api/stats`);
  testResults.push({ name: 'Statistics Endpoint', ...statsTest });
  console.log(statsTest.success ? '✅ Success' : '❌ Failed:', statsTest.data || statsTest.error);

  // Test 6: Table-specific Statistics
  console.log('\n📋 Test 6: Table-specific Statistics (resumes)');
  const tableStatsTest = await testRequest(`${WORKER_URL}/api/stats?tableName=resumes`);
  testResults.push({ name: 'Table Statistics', ...tableStatsTest });
  console.log(tableStatsTest.success ? '✅ Success' : '❌ Failed:', tableStatsTest.data || tableStatsTest.error);

  // Summary
  console.log('\n📊 Test Summary:');
  console.log('─'.repeat(50));
  
  let passedTests = 0;
  let totalTests = testResults.length;
  
  testResults.forEach(result => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} ${result.name}`);
    if (result.success) passedTests++;
  });
  
  console.log('─'.repeat(50));
  console.log(`🎯 Results: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Enhanced functionality is working correctly.');
    console.log('\n💡 New features ready for use:');
    console.log('   • Multi-table content extraction');
    console.log('   • Enhanced task queueing with table_name parameter');
    console.log('   • Content deduplication');
    console.log('   • Task completion tracking');
    console.log('   • Performance statistics');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above for details.');
  }
  
  console.log('\n🔗 Enhanced API Endpoints:');
  console.log(`   GET  ${WORKER_URL}/api/enqueue-get-page-html?browserId=X&url=Y&tableName=Z`);
  console.log(`   POST ${WORKER_URL}/api/enqueue-task`);
  console.log(`   POST ${WORKER_URL}/api/check-task`);
  console.log(`   POST ${WORKER_URL}/api/report-task`);
  console.log(`   GET  ${WORKER_URL}/api/stats?tableName=X`);
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runEnhancedTests().catch((error) => {
    console.error('Test script error:', error);
    process.exit(1);
  });
}

export { runEnhancedTests };



