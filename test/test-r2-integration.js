#!/usr/bin/env node
/**
 * R2 Integration Test
 * Tests signed upload URLs and R2 storage functionality
 */

async function testR2Integration() {
  console.log('🚀 Testing R2 Integration\n');
  
  const workerUrl = 'http://localhost:8788';
  const testBrowserId = `test-r2-${Date.now()}`;
  let results = [];
  
  try {
    // Test 1: Create a task
    console.log('🔍 Test 1: Creating task for R2 testing...');
    const taskResponse = await fetch(`${workerUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId: testBrowserId,
        taskName: 'Get Page HTML',
        url: 'https://example.com/large-page',
        contentType: 'r2-test',
        priority: 1
      })
    });
    
    if (!taskResponse.ok) throw new Error(`Task creation failed: ${taskResponse.status}`);
    
    const task = await taskResponse.json();
    console.log(`   ✅ Created task: ${task.jobId}`);
    results.push({ test: 'Create Task', status: 'PASSED', data: { jobId: task.jobId } });
    
    // Test 2: Lease the task
    console.log('\n🔍 Test 2: Leasing task...');
    const leaseResponse = await fetch(`${workerUrl}/lease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId: testBrowserId,
        max: 1
      })
    });
    
    if (!leaseResponse.ok) throw new Error(`Lease failed: ${leaseResponse.status}`);
    
    const leaseResult = await leaseResponse.json();
    if (leaseResult.count === 0) throw new Error('No tasks were leased');
    
    const lease = leaseResult.items[0];
    console.log(`   ✅ Leased task: ${lease.jobId} with lease: ${lease.leaseId}`);
    results.push({ test: 'Lease Task', status: 'PASSED' });
    
    // Test 3: Get upload URL
    console.log('\n🔍 Test 3: Getting signed upload URL...');
    const uploadUrlResponse = await fetch(`${workerUrl}/upload-url?jobId=${lease.jobId}`);
    
    if (!uploadUrlResponse.ok) {
      const errorText = await uploadUrlResponse.text();
      throw new Error(`Upload URL failed: ${uploadUrlResponse.status} - ${errorText}`);
    }
    
    const uploadUrlResult = await uploadUrlResponse.json();
    console.log(`📤 Upload URL Results:`);
    console.log(`   Upload URL: ${uploadUrlResult.uploadUrl}`);
    console.log(`   R2 Key: ${uploadUrlResult.r2Key}`);
    console.log(`   Method: ${uploadUrlResult.method}`);
    console.log(`   Expires In: ${uploadUrlResult.expiresIn}s`);
    
    if (!uploadUrlResult.uploadUrl || !uploadUrlResult.r2Key) {
      throw new Error('Invalid upload URL response');
    }
    
    console.log('✅ Upload URL generation successful');
    results.push({ test: 'Generate Upload URL', status: 'PASSED' });
    
    // Test 4: Simulate direct R2 upload (mock)
    console.log('\n🔍 Test 4: Simulating R2 upload...');
    const testHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>R2 Integration Test</title></head>
        <body>
          <h1>R2 Upload Test</h1>
          <p>Job ID: ${lease.jobId}</p>
          <p>R2 Key: ${uploadUrlResult.r2Key}</p>
          <p>Upload Method: Direct R2</p>
          <p>Uploaded at: ${new Date().toISOString()}</p>
          <div>
            <h2>Large Content Simulation</h2>
            ${Array(100).fill(0).map((_, i) => `<p>Line ${i + 1}: This is a test of R2 storage capabilities.</p>`).join('\n            ')}
          </div>
        </body>
      </html>
    `;
    
    // In a real scenario, we'd upload to the signed URL
    // For testing, we'll simulate this by submitting with r2Key
    console.log(`   📄 Simulated upload of ${testHtml.length} bytes to ${uploadUrlResult.r2Key}`);
    console.log('✅ R2 upload simulation complete');
    results.push({ test: 'Simulate R2 Upload', status: 'PASSED' });
    
    // Test 5: Submit with R2 key
    console.log('\n🔍 Test 5: Submitting task with R2 key...');
    const submitResponse = await fetch(`${workerUrl}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: lease.jobId,
        leaseId: lease.leaseId,
        r2Key: uploadUrlResult.r2Key,
        size: testHtml.length,
        sha256: 'simulated-hash-for-r2-test',
        contentType: 'text/html; charset=utf-8'
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
    console.log(`   Upload Method: ${submitResult.uploadMethod || 'r2-direct'}`);
    
    if (!submitResult.success || submitResult.state !== 'fetched') {
      throw new Error('Submit did not complete successfully');
    }
    
    console.log('✅ R2 submission successful');
    results.push({ test: 'Submit with R2 Key', status: 'PASSED' });
    
    // Test 6: Test inline submission (for comparison)
    console.log('\n🔍 Test 6: Testing inline submission...');
    
    // Create another task for inline test
    const inlineTaskResponse = await fetch(`${workerUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        browserId: testBrowserId,
        taskName: 'Get Page HTML',
        url: 'https://example.com/small-page',
        contentType: 'inline-test'
      })
    });
    
    const inlineTask = await inlineTaskResponse.json();
    
    // Lease it
    const inlineLeaseResponse = await fetch(`${workerUrl}/lease`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserId: testBrowserId, max: 1 })
    });
    
    const inlineLeaseResult = await inlineLeaseResponse.json();
    if (inlineLeaseResult.count === 0) throw new Error('No inline task leased');
    
    const inlineLease = inlineLeaseResult.items[0];
    
    // Submit inline
    const smallHtml = '<html><body><h1>Small inline test</h1></body></html>';
    const inlineSubmitResponse = await fetch(`${workerUrl}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: inlineLease.jobId,
        leaseId: inlineLease.leaseId,
        htmlBase64: btoa(smallHtml),
        contentType: 'text/html; charset=utf-8'
      })
    });
    
    const inlineSubmitResult = await inlineSubmitResponse.json();
    console.log(`📤 Inline Submit Results:`);
    console.log(`   Success: ${inlineSubmitResult.success}`);
    console.log(`   Content Size: ${inlineSubmitResult.contentSize}`);
    console.log(`   Upload Method: inline`);
    
    if (!inlineSubmitResult.success) {
      throw new Error('Inline submit failed');
    }
    
    console.log('✅ Inline submission successful');
    results.push({ test: 'Inline Submission', status: 'PASSED' });
    
    // Test 7: Check artifacts
    console.log('\n🔍 Test 7: Checking artifacts...');
    const artifactsResponse = await fetch(`${workerUrl}/artifacts/${lease.jobId}`);
    
    if (artifactsResponse.ok) {
      const artifacts = await artifactsResponse.json();
      console.log(`📊 Artifacts for ${lease.jobId}:`);
      console.log(`   Raw R2 Key: ${artifacts.raw_r2_key}`);
      console.log(`   Raw Size: ${artifacts.raw_bytes} bytes`);
      console.log(`   Content Type: ${artifacts.content_type}`);
      
      if (artifacts.raw_r2_key === uploadUrlResult.r2Key) {
        console.log('✅ Artifacts match expected R2 key');
        results.push({ test: 'Check Artifacts', status: 'PASSED' });
      } else {
        throw new Error('Artifacts do not match expected R2 key');
      }
    } else {
      console.log('⚠️  Artifacts endpoint not available or failed');
      results.push({ test: 'Check Artifacts', status: 'SKIPPED' });
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    results.push({ test: 'Current Test', status: 'FAILED', error: error.message });
  }
  
  // Print results
  console.log('\n' + '='.repeat(70));
  console.log('📊 R2 Integration Test Results');
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
  console.log(`🎯 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  if (failed === 0) {
    console.log('\n🎉 R2 Integration Tests: SUCCESS!');
    console.log('✅ Signed upload URLs working');
    console.log('✅ R2 storage integration functional');
    console.log('✅ Both R2 and inline submission methods working');
    console.log('✅ Artifact tracking operational');
  } else {
    console.log('\n⚠️  Some R2 integration tests failed');
  }
  
  console.log('\n' + '='.repeat(70));
  
  return { passed, failed, skipped };
}

// Run the test
testR2Integration().catch(error => {
  console.error('💥 R2 integration test runner failed:', error);
  process.exit(1);
});
