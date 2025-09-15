#!/bin/bash

# Test deployment script for faster debugging
# Usage: ./test-deploy.sh [delay_seconds]

DELAY=${1:-180}  # Default 3 minutes (180 seconds)

echo "🚀 Starting test deployment cycle..."
echo "⏰ Will trigger deployment in ${DELAY} seconds"

# Push current changes
echo "📤 Pushing changes to GitHub..."
git add .
git commit -m "test: deployment iteration $(date '+%H:%M:%S')" || echo "No changes to commit"
git push

echo "✅ Changes pushed!"
echo "⏳ Waiting ${DELAY} seconds before triggering deployment..."
echo "💡 You can use this time to make additional changes if needed"

# Countdown timer
for ((i=DELAY; i>0; i--)); do
    if [ $((i % 30)) -eq 0 ] || [ $i -le 10 ]; then
        echo "⏰ ${i} seconds remaining..."
    fi
    sleep 1
done

echo ""
echo "🎯 Time's up! Triggering deployment..."
echo "🔗 Check your Cloudflare dashboard for deployment status"
echo "📊 Or check GitHub Actions if you have auto-deploy set up"

# You can add a webhook trigger here if you have one set up
# curl -X POST "YOUR_WEBHOOK_URL" -d '{"trigger":"deploy"}'

echo "✅ Deployment trigger sent!"
echo "🔍 Monitor your deployment logs for the next error to fix"
