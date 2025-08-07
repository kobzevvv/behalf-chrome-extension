#!/bin/bash

# Deploy Cloudflare Worker for development with environment variables
set -e

echo "🚀 Deploying Cloudflare Worker for development..."

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ No .env file found"
    echo "Please create a .env file with your DATABASE_URL:"
    echo "DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please set it in your .env file:"
    echo "DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require"
    exit 1
fi

echo "✅ DATABASE_URL loaded from .env file"

# Deploy using wrangler with development environment
echo "🚀 Deploying to Cloudflare (development environment)..."

# Update wrangler.toml with the actual DATABASE_URL value for development
sed -i.bak "s|DATABASE_URL = \"\\$DATABASE_URL\"|DATABASE_URL = \"$DATABASE_URL\"|g" wrangler.toml

# Deploy the worker with development environment
wrangler deploy --env development

# Get the deployed worker URL
WORKER_URL="behalf-task-manager.dev-a96.workers.dev"

echo "✅ Worker deployed successfully!"
echo "🌐 Worker URL: https://$WORKER_URL"

# Update background.js with the worker URL
echo "📝 Updating Chrome extension with Worker URL..."
sed -i.bak "s|YOUR_CLOUDFLARE_WORKER_URL|https://$WORKER_URL|g" background.js

echo "✅ Chrome extension updated with Worker URL"
echo ""
echo "🎉 Development deployment complete!"
echo "📋 Next steps:"
echo "1. Load the Chrome extension in chrome://extensions/"
echo "2. Set browser_id to 'test_browser_id'"
echo "3. Test the connection"
echo ""
echo "💡 This deployment uses environment variables from .env file"
echo "💡 For production, use GitHub Actions workflow"
