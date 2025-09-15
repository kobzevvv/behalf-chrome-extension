#!/usr/bin/env node
/**
 * Quick Status Test - Test just the status functionality
 */

async function testStatus() {
  const workerUrl = 'http://localhost:8788';
  
  console.log('🔍 Testing status functionality...\n');
  
  // Step 1: Create a task
  console.log('1. Creating a task...');
  const createResponse = await fetch(`${workerUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      browserId: 'test-status-quick',
      url: 'https://example.com/test',
      contentType: 'test-status'
    })
  });
  
  const task = await createResponse.json();
  console.log('✅ Task created:', task.jobId);
  
  // Step 2: Check debug endpoint
  console.log('\n2. Checking debug endpoint...');
  const debugResponse = await fetch(`${workerUrl}/debug/jobs`);
  const debug = await debugResponse.json();
  console.log('✅ Jobs in database:', debug.totalJobs);
  console.log('   First job ID:', debug.jobs[0]?.job_id);
  
  // Step 3: Test status endpoint
  console.log('\n3. Testing status endpoint...');
  const statusResponse = await fetch(`${workerUrl}/status/${task.jobId}`);
  const status = await statusResponse.json();
  
  console.log('Status response:', JSON.stringify(status, null, 2));
  
  if (status.error) {
    console.log('❌ Status lookup failed');
    console.log('   Expected job ID:', task.jobId);
    console.log('   Jobs in DB:', debug.jobs.map(j => j.job_id));
  } else {
    console.log('✅ Status lookup successful');
  }
}

testStatus().catch(console.error);
