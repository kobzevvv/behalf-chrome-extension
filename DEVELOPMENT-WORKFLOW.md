# 🔄 Development Workflow Guide

## **Perfect Setup - You Were Right!** ✅

This setup gives you the **best of both worlds**:
- 🧪 **Automatic development deployments** for testing
- 🏭 **Manual production deployments** for safety

## **How It Works**

### **🔄 Automatic Development Deployment**
```
Push/PR → GitHub Actions → behalf-task-manager-dev → Test & Validate
```

**Triggers:**
- ✅ Push to any branch (`main`, `feat/*`, `feature/*`)
- ✅ Pull request creation/update
- ✅ Manual trigger via GitHub Actions

**What happens:**
1. **Build** TypeScript automatically
2. **Deploy** to `behalf-task-manager-dev`
3. **Test** health endpoints
4. **Report** results in GitHub

### **📦 Manual Production Deployment**
```
You decide → npm run deploy:prod → behalf-task-manager → Production
```

## **GitHub Secrets Setup**

Add these secrets to your GitHub repository:

1. **`CLOUDFLARE_API_TOKEN`** - Your Cloudflare API token
2. **`DATABASE_URL_DEV`** - Development database URL (optional)

## **Chrome Extension Testing**

### **Development Testing:**
- Use development worker: `https://behalf-task-manager-dev.YOUR_SUBDOMAIN.workers.dev`
- Safe to experiment and break things

### **Production Usage:**
- Use production worker: `https://behalf-task-manager.YOUR_SUBDOMAIN.workers.dev`
- Only deploy when ready

## **Workflow Examples**

### **Feature Development:**
```bash
# 1. Create feature branch
git checkout -b feature/awesome-feature

# 2. Make changes and push
git push origin feature/awesome-feature
# ↑ Automatically deploys to development

# 3. Test with development worker URL
# Update Chrome extension popup with dev URL

# 4. Create PR when ready
# ↑ Automatically runs tests on development deployment

# 5. Merge to main
git checkout main
git merge feature/awesome-feature
# ↑ Updates development deployment

# 6. Deploy to production when satisfied
npm run deploy:prod
```

### **Quick Testing:**
```bash
# Push any change to test
git add . && git commit -m "test change" && git push
# ↑ Automatically available at behalf-task-manager-dev
```

## **Benefits**

✅ **Fast feedback** - See changes deployed in ~2 minutes  
✅ **Safe experimentation** - Development environment isolated  
✅ **Automatic testing** - Health checks on every deployment  
✅ **Production safety** - Manual control over production releases  
✅ **Great logs** - GitHub Actions provides excellent error reporting  
✅ **Team ready** - Easy to add collaborators later  

## **Commands Reference**

```bash
# Development
npm run deploy:dev      # Manual dev deployment
npm run dev            # Local development server

# Production  
npm run deploy:prod    # Manual production deployment
npm run deploy         # Same as deploy:prod

# Testing
npm test              # Run test suite
```

This is exactly the **industry standard approach** you mentioned! 🎉
