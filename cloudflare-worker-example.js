// Sample Cloudflare Worker implementation
// Replace with your actual Cloudflare Worker code

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/api/check-task' && request.method === 'POST') {
        return await handleCheckTask(request, env, corsHeaders);
      } else if (path === '/api/report-task' && request.method === 'POST') {
        return await handleReportTask(request, env, corsHeaders);
      } else {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal Server Error' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  }
};

async function handleCheckTask(request, env, corsHeaders) {
  const requestData = await request.json();
  const { browserId } = requestData;

  if (!browserId) {
    return new Response(
      JSON.stringify({ error: 'browserId is required' }), 
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    // Query the database for tasks
    const { results } = await env.DB.prepare(`
      SELECT * FROM tasks_ques 
      WHERE browser_id = ? 
      LIMIT 1
    `).bind(browserId).all();

    if (results.length > 0) {
      const task = results[0];
      return new Response(
        JSON.stringify({
          hasTask: true,
          task: {
            taskName: task.Task,
            paramsJson: JSON.parse(task.Params_json)
          }
        }), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      return new Response(
        JSON.stringify({ hasTask: false }), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error) {
    console.error('Database error:', error);
    return new Response(
      JSON.stringify({ error: 'Database error' }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleReportTask(request, env, corsHeaders) {
  const requestData = await request.json();
  const { datime, taskName, version, artifactsJson } = requestData;

  if (!datime || !taskName || !version || !artifactsJson) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields' }), 
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    // Insert task report into database
    await env.DB.prepare(`
      INSERT INTO worker_report (datime, task_name, version, artifacts_json)
      VALUES (?, ?, ?, ?)
    `).bind(datime, taskName, version, JSON.stringify(artifactsJson)).run();

    return new Response(
      JSON.stringify({ success: true }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Database error:', error);
    return new Response(
      JSON.stringify({ error: 'Database error' }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
} 