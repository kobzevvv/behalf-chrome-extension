/**
 * Test Webhook Service
 * Receives webhooks during testing and stores them for verification
 */

import express from 'express';
import crypto from 'crypto';

class TestWebhookService {
  constructor(port = 3001) {
    this.app = express();
    this.port = port;
    this.webhooks = new Map(); // testId -> webhooks[]
    this.secrets = new Map(); // secretId -> secret
    
    this.setupRoutes();
    this.setupTestSecrets();
  }

  setupRoutes() {
    this.app.use(express.json({ limit: '10mb' }));
    
    // Middleware to capture raw body for signature verification
    this.app.use('/test-webhook', express.raw({ 
      type: 'application/json', 
      limit: '10mb'
    }), (req, res, next) => {
      req.rawBody = req.body;
      // Parse JSON for easier handling
      if (req.body && req.body.length > 0) {
        try {
          req.body = JSON.parse(req.body.toString());
        } catch (error) {
          return res.status(400).json({ error: 'Invalid JSON' });
        }
      }
      next();
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'test-webhook-service',
        webhooksReceived: this.getTotalWebhookCount(),
        timestamp: new Date().toISOString()
      });
    });

    // Receive webhooks
    this.app.post('/test-webhook/:testId', (req, res) => {
      this.handleWebhook(req, res);
    });

    // Get received webhooks for a test
    this.app.get('/test-webhook/:testId/received', (req, res) => {
      const testId = req.params.testId;
      const webhooks = this.webhooks.get(testId) || [];
      
      res.json({
        testId,
        count: webhooks.length,
        webhooks: webhooks.map(w => ({
          ...w,
          payload: w.payload // payload is already parsed
        }))
      });
    });

    // Clear webhooks for a test
    this.app.delete('/test-webhook/:testId', (req, res) => {
      const testId = req.params.testId;
      this.webhooks.delete(testId);
      res.json({ success: true, testId, message: 'Webhooks cleared' });
    });

    // List all test IDs
    this.app.get('/test-webhooks', (req, res) => {
      const testIds = Array.from(this.webhooks.keys());
      res.json({
        testIds,
        totalTests: testIds.length,
        totalWebhooks: this.getTotalWebhookCount()
      });
    });

    // Clear all webhooks
    this.app.delete('/test-webhooks', (req, res) => {
      const count = this.getTotalWebhookCount();
      this.webhooks.clear();
      res.json({ success: true, message: `Cleared ${count} webhooks` });
    });
  }

  setupTestSecrets() {
    // Predefined test secrets
    this.secrets.set('test-secret', 'test-webhook-secret-key-123');
    this.secrets.set('e2e-secret', 'e2e-test-secret-key-456');
    this.secrets.set('github-action-secret', 'github-action-secret-key-789');
  }

  handleWebhook(req, res) {
    const testId = req.params.testId;
    const signature = req.headers['x-signature'];
    const deliveryId = req.headers['x-delivery-id'];
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    console.log(`📨 Webhook received for test: ${testId}`);
    console.log(`   Delivery ID: ${deliveryId}`);
    console.log(`   Signature: ${signature}`);
    console.log(`   Body size: ${rawBody.length} bytes`);

    try {
      // Verify HMAC signature if present
      let signatureValid = true;
      let secretUsed = null;

      if (signature) {
        const result = this.verifySignature(rawBody, signature);
        signatureValid = result.valid;
        secretUsed = result.secret;
      }

      // Get the payload (already parsed by middleware)
      const payload = req.body;

      // Store the webhook
      const webhook = {
        testId,
        deliveryId,
        signature,
        signatureValid,
        secretUsed,
        rawBody: rawBody.toString(),
        payload,
        headers: { ...req.headers },
        receivedAt: new Date().toISOString(),
        timestamp: Date.now()
      };

      if (!this.webhooks.has(testId)) {
        this.webhooks.set(testId, []);
      }
      this.webhooks.get(testId).push(webhook);

      console.log(`✅ Webhook stored for test: ${testId}`);
      console.log(`   Job ID: ${payload.job_id}`);
      console.log(`   Phase: ${payload.phase}`);
      console.log(`   Content Type: ${payload.content_type}`);
      console.log(`   Signature Valid: ${signatureValid}`);

      // Respond with success
      res.status(200).json({
        success: true,
        testId,
        deliveryId,
        message: 'Webhook received and stored',
        signatureValid,
        timestamp: webhook.receivedAt
      });

    } catch (error) {
      console.error('❌ Error handling webhook:', error);
      res.status(500).json({
        error: 'Internal server error',
        testId,
        deliveryId,
        message: error.message
      });
    }
  }

  verifySignature(rawBody, signature) {
    // Expected format: "sha256=<hex>"
    if (!signature || !signature.startsWith('sha256=')) {
      return { valid: false, secret: null };
    }

    const expectedHash = signature.substring(7); // Remove "sha256="

    // Try all known secrets
    for (const [secretId, secret] of this.secrets.entries()) {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(rawBody);
      const computedHash = hmac.digest('hex');

      if (crypto.timingSafeEqual(
        Buffer.from(expectedHash, 'hex'),
        Buffer.from(computedHash, 'hex')
      )) {
        return { valid: true, secret: secretId };
      }
    }

    return { valid: false, secret: null };
  }

  getTotalWebhookCount() {
    let count = 0;
    for (const webhooks of this.webhooks.values()) {
      count += webhooks.length;
    }
    return count;
  }

  start() {
    return new Promise((resolve) => {
      const server = this.app.listen(this.port, () => {
        console.log(`🎣 Test Webhook Service started on port ${this.port}`);
        console.log(`   Health check: http://localhost:${this.port}/health`);
        console.log(`   Webhook endpoint: http://localhost:${this.port}/test-webhook/{testId}`);
        resolve(server);
      });
    });
  }

  // Helper method for programmatic testing
  waitForWebhook(testId, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkWebhook = () => {
        const webhooks = this.webhooks.get(testId) || [];
        if (webhooks.length > 0) {
          resolve(webhooks[0]);
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Webhook not received within ${timeout}ms`));
          return;
        }
        
        setTimeout(checkWebhook, 100);
      };
      
      checkWebhook();
    });
  }

  // Golden data verification
  async verifyWebhookPayload(testId, expectedPayload) {
    const webhooks = this.webhooks.get(testId) || [];
    if (webhooks.length === 0) {
      throw new Error(`No webhooks received for test: ${testId}`);
    }

    const webhook = webhooks[0];
    const payload = JSON.parse(webhook.rawBody);

    // Verify required fields
    const requiredFields = ['job_id', 'phase', 'browser_id', 'url', 'content_type'];
    for (const field of requiredFields) {
      if (!payload[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Verify expected values
    for (const [key, expectedValue] of Object.entries(expectedPayload)) {
      if (payload[key] !== expectedValue) {
        throw new Error(`Expected ${key}=${expectedValue}, got ${payload[key]}`);
      }
    }

    // Verify signature if present
    if (!webhook.signatureValid && webhook.signature) {
      throw new Error('Invalid HMAC signature');
    }

    return { valid: true, webhook, payload };
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3001;
  const service = new TestWebhookService(port);
  
  service.start().then(() => {
    console.log('✅ Test Webhook Service is ready for testing!');
    console.log('   Press Ctrl+C to stop');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Test Webhook Service...');
    process.exit(0);
  });
}

export default TestWebhookService;
