#!/usr/bin/env node
/**
 * Test Runner - Orchestrates the full test suite
 * Starts webhook service, runs tests, and reports results
 */

import TestFramework from './test-framework.js';
import TestWebhookService from './webhook-service.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class TestRunner {
  constructor() {
    this.webhookService = null;
    this.workerProcess = null;
    this.config = {
      workerUrl: process.env.WORKER_URL || 'http://localhost:8787',
      webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3001',
      testBrowserId: process.env.TEST_BROWSER_ID || `test-${Date.now()}`,
      skipWebhookService: process.env.SKIP_WEBHOOK_SERVICE === 'true',
      skipWorkerStart: process.env.SKIP_WORKER_START === 'true'
    };
  }

  async startServices() {
    console.log('🚀 Starting test services...\n');

    // Start webhook service
    if (!this.config.skipWebhookService) {
      console.log('📡 Starting test webhook service...');
      this.webhookService = new TestWebhookService(3001);
      await this.webhookService.start();
      console.log('✅ Webhook service ready\n');
    }

    // Start local worker (if not already running)
    if (!this.config.skipWorkerStart) {
      console.log('⚡ Starting Cloudflare Worker locally...');
      await this.startLocalWorker();
      console.log('✅ Worker ready\n');
    }

    // Wait a moment for services to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  async startLocalWorker() {
    return new Promise((resolve, reject) => {
      // Start wrangler dev in the background
      this.workerProcess = spawn('wrangler', ['dev', '--port', '8787'], {
        cwd: join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      
      this.workerProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // Look for the ready message
        if (text.includes('Ready on') || text.includes('listening on')) {
          console.log('   Worker output:', text.trim());
          resolve();
        }
      });

      this.workerProcess.stderr.on('data', (data) => {
        const text = data.toString();
        console.log('   Worker stderr:', text.trim());
      });

      this.workerProcess.on('error', (error) => {
        console.error('❌ Failed to start worker:', error);
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.workerProcess && !this.workerProcess.killed) {
          console.log('⚠️  Worker start timeout - continuing anyway');
          resolve();
        }
      }, 30000);
    });
  }

  async runTests() {
    console.log('🧪 Running comprehensive test suite...\n');
    
    const testFramework = new TestFramework(this.config);
    const results = await testFramework.runAllTests();
    
    return results;
  }

  async stopServices() {
    console.log('\n🛑 Stopping test services...');
    
    if (this.workerProcess) {
      this.workerProcess.kill('SIGTERM');
      console.log('✅ Worker stopped');
    }
    
    if (this.webhookService) {
      // The webhook service will be stopped when the process exits
      console.log('✅ Webhook service stopped');
    }
  }

  async run() {
    let exitCode = 0;
    
    try {
      // Print configuration
      console.log('🔧 Test Configuration:');
      console.log(`   Worker URL: ${this.config.workerUrl}`);
      console.log(`   Webhook URL: ${this.config.webhookUrl}`);
      console.log(`   Test Browser ID: ${this.config.testBrowserId}`);
      console.log(`   Skip Webhook Service: ${this.config.skipWebhookService}`);
      console.log(`   Skip Worker Start: ${this.config.skipWorkerStart}`);
      console.log('');

      await this.startServices();
      const results = await this.runTests();
      
      // Determine exit code based on results
      const failed = results.filter(r => r.status === 'FAILED').length;
      const passed = results.filter(r => r.status === 'PASSED').length;
      
      if (failed > 0) {
        console.log(`\n❌ Tests failed: ${failed} failed, ${passed} passed`);
        exitCode = 1;
      } else {
        console.log(`\n✅ All tests passed: ${passed} passed, 0 failed`);
        exitCode = 0;
      }
      
    } catch (error) {
      console.error('\n💥 Test runner failed:', error);
      exitCode = 1;
    } finally {
      await this.stopServices();
    }
    
    process.exit(exitCode);
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TestRunner();
  runner.run().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

export default TestRunner;
