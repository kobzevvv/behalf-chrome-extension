#!/bin/bash

# Local test script to simulate GitHub Actions workflow
set -e

echo "🧪 Testing GitHub Actions workflow locally..."

# Load environment variables
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ No .env file found"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    exit 1
fi

echo "✅ Environment variables loaded"

# Deploy using wrangler (simulating GitHub Actions)
echo "🚀 Deploying to Cloudflare (simulating GitHub Actions)..."
wrangler deploy --env production

# Get the deployed worker URL
WORKER_URL="behalf-task-manager-production.dev-a96.workers.dev"

echo "✅ Worker deployed successfully!"
echo "🌐 Worker URL: https://$WORKER_URL"

# Wait for deployment propagation
echo "⏳ Waiting 10 seconds for deployment to propagate..."
sleep 10

# Test Worker Health (simulating GitHub Actions test)
echo "🏥 Testing worker health endpoint..."
HTTP_CODE=$(curl -s -o health-response.json -w "%{http_code}" "$WORKER_URL/api/check-task" -X POST -H "Content-Type: application/json" -d '{"browserId": "test_browser_id"}' || echo "000")

echo "HTTP Status Code: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Health check passed!"
    cat health-response.json | jq '.' || cat health-response.json
    
    # Check if DATABASE_URL is configured
    if grep -q '"hasTask":true' health-response.json; then
        echo "✅ DATABASE_URL is configured and working"
    else
        echo "⚠️ DATABASE_URL might not be configured"
    fi
else
    echo "❌ Health check failed with status: $HTTP_CODE"
    if [ -f health-response.json ]; then
        cat health-response.json
    fi
    exit 1
fi

# Test Report Endpoint (simulating GitHub Actions test)
echo "🚀 Testing report endpoint..."
cat > test-report-payload.json <<EOF
{
  "datime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "taskName": "Get Page HTML",
  "version": "0.1",
  "artifactsJson": {
    "HTML content": "test content from local workflow"
  }
}
EOF

echo "📝 Test payload:"
cat test-report-payload.json | jq '.'
echo ""

# Make the API call
HTTP_CODE=$(curl -s -o report-response.json -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d @test-report-payload.json \
  "$WORKER_URL/api/report-task")

echo "HTTP Status Code: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Report endpoint test passed!"
    echo ""
    echo "📊 Report Results:"
    cat report-response.json | jq '.' || cat report-response.json
else
    echo "❌ Report endpoint test failed!"
    echo "Response:"
    cat report-response.json | jq '.' 2>/dev/null || cat report-response.json
    exit 1
fi

echo ""
echo "🎉 Local workflow test completed successfully!"
echo "📋 Summary:"
echo "- Worker deployed: ✅"
echo "- Health check: ✅"
echo "- Report test: ✅"
echo ""
echo "💡 Ready for GitHub Actions deployment!"
