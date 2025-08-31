// Cloudflare Worker with environment variables
import { queries } from './dataModel.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Log incoming request
    console.log(`[${new Date().toISOString()}] ${request.method} ${path} - ${request.headers.get('user-agent') || 'Unknown'}`);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      console.log(`[${new Date().toISOString()}] CORS preflight request`);
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/api/check-task' && request.method === 'POST') {
        console.log(`[${new Date().toISOString()}] Processing check-task request`);
        return await handleCheckTask(request, env, corsHeaders);
      } else if (path === '/api/report-task' && request.method === 'POST') {
        console.log(`[${new Date().toISOString()}] Processing report-task request`);
        return await handleReportTask(request, env, corsHeaders);
      } else if (path === '/api/enqueue-get-page-html' && request.method === 'GET') {
        console.log(`[${new Date().toISOString()}] Processing enqueue-get-page-html request`);
        return await handleEnqueueGetPageHtml(url, env, corsHeaders);
      } else {
        console.log(`[${new Date().toISOString()}] 404 - Path not found: ${path}`);
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Worker error:`, error);
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

  console.log(`[${new Date().toISOString()}] Check task request for browserId: ${browserId}`);

  if (!browserId) {
    console.log(`[${new Date().toISOString()}] Error: browserId is required`);
    return new Response(
      JSON.stringify({ error: 'browserId is required' }), 
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    // Connect to Neon database using HTTP API
    console.log(`[${new Date().toISOString()}] Connecting to database...`);
    
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    console.log(`[${new Date().toISOString()}] DATABASE_URL available: ${!!env.DATABASE_URL}`);
    
    // Parse the DATABASE_URL to extract connection details
    console.log(`[${new Date().toISOString()}] Full DATABASE_URL: ${env.DATABASE_URL}`);
    
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not available');
    }
    
    let dbUrl;
    const rawUrl = env.DATABASE_URL;
    
    if (!rawUrl) {
      throw new Error('DATABASE_URL is undefined in environment');
    }
    
    console.log(`[${new Date().toISOString()}] Raw DATABASE_URL length: ${rawUrl.length}`);
    console.log(`[${new Date().toISOString()}] Raw DATABASE_URL first 50 chars: ${rawUrl ? rawUrl.substring(0, 50) : 'undefined'}`);
    try {
      dbUrl = new URL(env.DATABASE_URL);
    } catch (urlError) {
      console.error(`[${new Date().toISOString()}] URL parsing error:`, urlError);
      throw new Error(`Invalid DATABASE_URL format: ${urlError.message}`);
    }
    const dbHost = dbUrl.hostname;
    const dbPassword = dbUrl.password;
    
    console.log(`[${new Date().toISOString()}] Database connection details:`, { dbHost, hasPassword: !!dbPassword });
    
    // Use Neon's HTTP API
    const neonResponse = await fetch(`https://${dbHost}/sql`, {
      method: 'POST',
      headers: {
        'neon-connection-string': env.DATABASE_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: queries.selectPendingTaskForBrowser.text,
        params: [browserId]
      })
    });

    if (!neonResponse.ok) {
      throw new Error(`Database request failed: ${neonResponse.status} - ${await neonResponse.text()}`);
    }

    const dbResult = await neonResponse.json();
    console.log(`[${new Date().toISOString()}] Database response:`, JSON.stringify(dbResult));

    if (dbResult.rows && dbResult.rows.length > 0) {
      const task = dbResult.rows[0];
      console.log(`[${new Date().toISOString()}] Found task in database:`, task);

      const response = {
        hasTask: true,
        task: {
          taskId: task.id,
          taskName: task.task,
          paramsJson: JSON.parse(task.params_json)
        }
      };
      
      console.log(`[${new Date().toISOString()}] Returning task:`, JSON.stringify(response));
      return new Response(
        JSON.stringify(response), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      console.log(`[${new Date().toISOString()}] No task found in database for browserId: ${browserId}`);
      return new Response(
        JSON.stringify({ hasTask: false }), 
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Database error:`, error);
    return new Response(
      JSON.stringify({ error: 'Database error: ' + error.message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleReportTask(request, env, corsHeaders) {
  const requestData = await request.json();
  const { taskId, datime, taskName, version, artifactsJson } = requestData;

  console.log(`[${new Date().toISOString()}] Report task request:`, { datime, taskName, version });

  if (!taskId || !datime || !taskName || !version || !artifactsJson) {
    console.log(`[${new Date().toISOString()}] Error: Missing required fields`);
    return new Response(
      JSON.stringify({ error: 'Missing required fields' }), 
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    // Connect to Neon database using HTTP API
    console.log(`[${new Date().toISOString()}] Saving task completion to database...`);
    
    // Parse the DATABASE_URL to extract connection details
    console.log(`[${new Date().toISOString()}] Full DATABASE_URL: ${env.DATABASE_URL}`);
    
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not available');
    }
    
    let dbUrl;
    const rawUrl = env.DATABASE_URL;
    
    if (!rawUrl) {
      throw new Error('DATABASE_URL is undefined in environment');
    }
    
    console.log(`[${new Date().toISOString()}] Raw DATABASE_URL length: ${rawUrl.length}`);
    console.log(`[${new Date().toISOString()}] Raw DATABASE_URL first 50 chars: ${rawUrl ? rawUrl.substring(0, 50) : 'undefined'}`);
    try {
      dbUrl = new URL(env.DATABASE_URL);
    } catch (urlError) {
      console.error(`[${new Date().toISOString()}] URL parsing error:`, urlError);
      throw new Error(`Invalid DATABASE_URL format: ${urlError.message}`);
    }
    const dbHost = dbUrl.hostname;
    const dbPassword = dbUrl.password;
    
    // Use Neon's HTTP API to insert the task report
    const neonResponse = await fetch(`https://${dbHost}/sql`, {
      method: 'POST',
      headers: {
        'neon-connection-string': env.DATABASE_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: queries.insertWorkerReport.text,
        params: [taskId, datime, taskName, version, JSON.stringify(artifactsJson)]
      })
    });

    if (!neonResponse.ok) {
      throw new Error(`Database insert failed: ${neonResponse.status} - ${await neonResponse.text()}`);
    }

    console.log(`[${new Date().toISOString()}] Task completion saved to database successfully:`, { 
      datime, 
      taskName, 
      version, 
      artifactsJsonSize: JSON.stringify(artifactsJson).length 
    });
    
    return new Response(
      JSON.stringify({ success: true }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Database error:`, error);
    return new Response(
      JSON.stringify({ error: 'Database error: ' + error.message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

async function handleEnqueueGetPageHtml(url, env, corsHeaders) {
  const browserId = (url.searchParams.get('browserId') || '').trim();
  const targetUrl = (url.searchParams.get('url') || '').trim();

  console.log(`[${new Date().toISOString()}] Enqueue request for browserId: ${browserId}, url: ${targetUrl}`);

  if (!browserId) {
    return new Response(
      JSON.stringify({ error: 'browserId is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
  if (!targetUrl) {
    return new Response(
      JSON.stringify({ error: 'url is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    // Validate URL format
    try {
      new URL(targetUrl);
    } catch (_) {
      return new Response(
        JSON.stringify({ error: 'Invalid url format' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    let dbUrl;
    try {
      dbUrl = new URL(env.DATABASE_URL);
    } catch (urlError) {
      console.error(`[${new Date().toISOString()}] URL parsing error:`, urlError);
      throw new Error(`Invalid DATABASE_URL format: ${urlError.message}`);
    }
    const dbHost = dbUrl.hostname;

    const neonResponse = await fetch(`https://${dbHost}/sql`, {
      method: 'POST',
      headers: {
        'neon-connection-string': env.DATABASE_URL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'INSERT INTO tasks_ques (browser_id, task, params_json) VALUES ($1, $2, $3) RETURNING id',
        params: [browserId, 'Get Page HTML', JSON.stringify({ URL: targetUrl })]
      })
    });

    if (!neonResponse.ok) {
      throw new Error(`Database insert failed: ${neonResponse.status} - ${await neonResponse.text()}`);
    }

    const result = await neonResponse.json();
    const insertedId = result?.rows?.[0]?.id ?? null;

    return new Response(
      JSON.stringify({ success: true, id: insertedId, browserId, url: targetUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Database error:`, error);
    return new Response(
      JSON.stringify({ error: 'Database error: ' + error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}
