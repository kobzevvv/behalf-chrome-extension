#!/usr/bin/env node
/**
 * Phase 3 Lease Management Test
 * Tests the enhanced lease system with heartbeats
 */

async function testLeaseManagement() {
  console.log('🚀 Phase 3: Testing Enhanced Lease Management\n');
  
  const workerUrl = 'http://localhost:8788';
  const testBrowserId = `test-lease-${Date.now()}`;
  let results = [];
  
  try {
    // Test 1: Create multiple tasks
    console.log('🔍 Test 1: Creating multiple tasks...');
    const tasks = [];
    for (let i = 1; i <= 3; i++) {
      const taskData = {
        browserId: testBrowserId,
        taskName: 'Get Page HTML',
        url: `https://example.com/page${i}`,
        contentType: 'test-lease',
        priority: i
      };
      
      const response = await fetch(`${workerUrl}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
      
      if (!response.ok) throw new Error(`Failed to create task ${i}: ${response.status}`);
      
      const task = await response.json();
      tasks.push(task);
      console.log(`   ✅ Created task ${i}: ${task.jobId} (priority: ${i})`);
    }
    
    console.log(`✅ Created ${tasks.length} tasks for lease testing`);
    results.push({ test: 'Create Multiple Tasks', status: 'PASSED', data: { taskCount: tasks.length } });
    
    // Test 2: Lease tasks
    console.log('\n🔍 Test 2: Leasing tasks...');
    const leaseResponse = await fetch(`${workerUrl}/lease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId: testBrowserId,
        max: 2
      })
    });
    
    if (!leaseResponse.ok) throw new Error(`Lease failed: ${leaseResponse.status}`);
    
    const leaseResult = await leaseResponse.json();
    console.log(`📊 Lease Results:`);
    console.log(`   Items leased: ${leaseResult.count}`);
    console.log(`   Browser ID: ${leaseResult.browserId}`);
    
    if (leaseResult.items && leaseResult.items.length > 0) {
      leaseResult.items.forEach((item, i) => {
        console.log(`   Task ${i + 1}:`);
        console.log(`     Job ID: ${item.jobId}`);
        console.log(`     Lease ID: ${item.leaseId}`);
        console.log(`     URL: ${item.url}`);
        console.log(`     Lease Until: ${new Date(item.leaseUntil).toISOString()}`);
      });
      
      console.log('✅ Lease operation successful');
      results.push({ test: 'Lease Tasks', status: 'PASSED', data: { leasedCount: leaseResult.count } });
      
      // Test 3: Heartbeat
      if (leaseResult.items.length > 0) {
        console.log('\n🔍 Test 3: Testing heartbeat...');
        const firstLease = leaseResult.items[0];
        
        const heartbeatResponse = await fetch(`${workerUrl}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: firstLease.jobId,
            leaseId: firstLease.leaseId
          })
        });
        
        if (!heartbeatResponse.ok) {
          const errorText = await heartbeatResponse.text();
          throw new Error(`Heartbeat failed: ${heartbeatResponse.status} - ${errorText}`);
        }
        
        const heartbeatResult = await heartbeatResponse.json();
        console.log(`💓 Heartbeat Results:`);
        console.log(`   Success: ${heartbeatResult.success}`);
        console.log(`   New lease until: ${new Date(heartbeatResult.leaseUntil).toISOString()}`);
        if (heartbeatResult.heartbeatCount !== undefined) {
          console.log(`   Heartbeat count: ${heartbeatResult.heartbeatCount}`);
        }
        
        // Verify lease was extended
        const originalLeaseUntil = firstLease.leaseUntil;
        const newLeaseUntil = heartbeatResult.leaseUntil;
        
        if (newLeaseUntil > originalLeaseUntil) {
          console.log('✅ Lease successfully extended via heartbeat');
          results.push({ test: 'Heartbeat Extension', status: 'PASSED' });
        } else {
          throw new Error('Lease was not extended');
        }
        
        // Test 4: Task status after lease
        console.log('\n🔍 Test 4: Checking task status after lease...');
        const statusResponse = await fetch(`${workerUrl}/status/${firstLease.jobId}`);
        
        if (!statusResponse.ok) throw new Error(`Status check failed: ${statusResponse.status}`);
        
        const status = await statusResponse.json();
        console.log(`📊 Task Status After Lease:`);
        console.log(`   State: ${status.state}`);
        console.log(`   Lease ID: ${status.lease_id}`);
        console.log(`   Lease Until: ${new Date(status.lease_until).toISOString()}`);
        
        if (status.state === 'leased' && status.lease_id === firstLease.leaseId) {
          console.log('✅ Task status correctly shows leased state');
          results.push({ test: 'Task Status After Lease', status: 'PASSED' });
        } else {
          throw new Error(`Expected leased state, got ${status.state}`);
        }
        
        // Test 5: Submit task
        console.log('\n🔍 Test 5: Submitting task content...');
        const testHtml = `
          <!DOCTYPE html>
          <html>
            <head><title>Lease Test Page</title></head>
            <body>
              <h1>Phase 3 Lease Test</h1>
              <p>Job ID: ${firstLease.jobId}</p>
              <p>Lease ID: ${firstLease.leaseId}</p>
              <p>Submitted at: ${new Date().toISOString()}</p>
            </body>
          </html>
        `;
        
        const submitResponse = await fetch(`${workerUrl}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: firstLease.jobId,
            leaseId: firstLease.leaseId,
            contentType: 'text/html; charset=utf-8',
            size: testHtml.length,
            htmlBase64: btoa(testHtml)
          })
        });
        
        if (!submitResponse.ok) {
          const errorText = await submitResponse.text();
          throw new Error(`Submit failed: ${submitResponse.status} - ${errorText}`);
        }
        
        const submitResult = await submitResponse.json();
        console.log(`📤 Submit Results:`);
        console.log(`   Success: ${submitResult.success}`);
        console.log(`   Job ID: ${submitResult.jobId}`);
        console.log(`   R2 Key: ${submitResult.r2Key}`);
        console.log(`   Content Size: ${submitResult.contentSize}`);
        console.log(`   State: ${submitResult.state}`);
        
        if (submitResult.success && submitResult.state === 'fetched') {
          console.log('✅ Task submission successful');
          results.push({ test: 'Task Submission', status: 'PASSED' });
        } else {
          throw new Error('Task submission failed');
        }
        
        // Test 6: Final status check
        console.log('\n🔍 Test 6: Final task status check...');
        const finalStatusResponse = await fetch(`${workerUrl}/status/${firstLease.jobId}`);
        const finalStatus = await finalStatusResponse.json();
        
        console.log(`📊 Final Task Status:`);
        console.log(`   State: ${finalStatus.state}`);
        console.log(`   Lease ID: ${finalStatus.lease_id}`);
        
        if (finalStatus.state === 'fetched') {
          console.log('✅ Task successfully transitioned to fetched state');
          results.push({ test: 'Final Status Check', status: 'PASSED' });
        } else {
          console.log(`⚠️  Task state is ${finalStatus.state}, expected 'fetched'`);
          results.push({ test: 'Final Status Check', status: 'WARNING' });
        }
        
      } else {
        console.log('⏭️  Skipping heartbeat and submission tests (no leases)');
        results.push({ test: 'Heartbeat Extension', status: 'SKIPPED', error: 'No leases available' });
        results.push({ test: 'Task Status After Lease', status: 'SKIPPED', error: 'No leases available' });
        results.push({ test: 'Task Submission', status: 'SKIPPED', error: 'No leases available' });
        results.push({ test: 'Final Status Check', status: 'SKIPPED', error: 'No leases available' });
      }
    } else {
      console.log('❌ No tasks were leased');
      results.push({ test: 'Lease Tasks', status: 'FAILED', error: 'No tasks leased' });
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    results.push({ test: 'Current Test', status: 'FAILED', error: error.message });
  }
  
  // Print results
  console.log('\n' + '='.repeat(70));
  console.log('📊 Phase 3 Lease Management Test Results');
  console.log('='.repeat(70));
  
  const passed = results.filter(r => r.status === 'PASSED').length;
  const failed = results.filter(r => r.status === 'FAILED').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  
  results.forEach(result => {
    let status = '❓';
    if (result.status === 'PASSED') status = '✅';
    if (result.status === 'FAILED') status = '❌';
    if (result.status === 'SKIPPED') status = '⏭️ ';
    if (result.status === 'WARNING') status = '⚠️ ';
    
    console.log(`${status} ${result.test}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(70));
  console.log(`🎯 Results: ${passed} passed, ${failed} failed, ${skipped} skipped, ${warnings} warnings`);
  
  if (failed === 0) {
    console.log('\n🎉 Phase 3 Lease Management Tests: SUCCESS!');
    console.log('✅ Enhanced lease system is working correctly');
    console.log('✅ Heartbeat mechanism operational');
    console.log('✅ Task lifecycle management functional');
  } else {
    console.log('\n⚠️  Some lease management tests failed');
  }
  
  console.log('\n' + '='.repeat(70));
  
  return { passed, failed, skipped, warnings };
}

// Run the test
testLeaseManagement().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
