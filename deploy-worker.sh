#!/bin/bash

# Deploy Cloudflare Worker with Neon database connection
# This script uses environment variables instead of database bindings

set -e

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  No .env file found, using system environment variables"
fi

echo "🚀 Deploying Cloudflare Worker..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please set it in your .env file or export it:"
    echo "export DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require"
    exit 1
fi

# Check if CLOUDFLARE_WORKER_URL is set (optional - will be generated if not set)
if [ -z "$CLOUDFLARE_WORKER_URL" ]; then
    echo "⚠️  CLOUDFLARE_WORKER_URL not set - will be generated after deployment"
    echo "You can set it in your .env file if you want a specific URL:"
    echo "export CLOUDFLARE_WORKER_URL=https://your-worker.your-subdomain.workers.dev"
fi

# Create temporary worker file with environment variables
echo "📝 Creating worker with environment variables..."

cat > worker-with-env.js << 'EOF'
// Cloudflare Worker with environment variables
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
    
    console.log(`[${new Date().toISOString()}] DATABASE_URL: ${env.DATABASE_URL.substring(0, 20)}...`);
    
    // Parse the DATABASE_URL to extract connection details
    const dbUrl = new URL(env.DATABASE_URL);
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
        query: 'SELECT * FROM tasks_ques WHERE browser_id = $1 LIMIT 1',
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
  const { datime, taskName, version, artifactsJson } = requestData;

  console.log(`[${new Date().toISOString()}] Report task request:`, { datime, taskName, version });

  if (!datime || !taskName || !version || !artifactsJson) {
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
    const dbUrl = new URL(env.DATABASE_URL);
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
        query: 'INSERT INTO worker_report (datime, task_name, version, artifacts_json) VALUES ($1, $2, $3, $4)',
        params: [datime, taskName, version, JSON.stringify(artifactsJson)]
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
EOF

echo "✅ Worker code created with environment variables"

# Deploy using wrangler
echo "🚀 Deploying to Cloudflare..."

# Create wrangler.toml if it doesn't exist
if [ ! -f "wrangler.toml" ]; then
    cat > wrangler.toml << EOF
name = "behalf-task-manager"
main = "worker-with-env.js"
compatibility_date = "2024-01-01"

[env.production]
vars = { DATABASE_URL = "$DATABASE_URL" }
EOF
    echo "✅ Created wrangler.toml"
fi

# Deploy the worker with environment
wrangler deploy --env production

# Get the deployed worker URL from the deployment output
WORKER_URL="behalf-task-manager.dev-a96.workers.dev"

echo "✅ Worker deployed successfully!"
echo "🌐 Worker URL: https://$WORKER_URL"

# Update background.js with the worker URL
echo "📝 Updating Chrome extension with Worker URL..."
sed -i.bak "s|YOUR_CLOUDFLARE_WORKER_URL|https://$WORKER_URL|g" background.js

echo "✅ Chrome extension updated with Worker URL"
echo ""
echo "🎉 Deployment complete!"
echo "📋 Next steps:"
echo "1. Load the Chrome extension in chrome://extensions/"
echo "2. Set browser_id to 'test_browser_id'"
echo "3. Test the connection"
