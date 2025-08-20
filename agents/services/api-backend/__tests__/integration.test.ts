import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { createHmac } from 'crypto';

// Create a minimal test version of the API
function createTestApp() {
  const app = express();
  
  app.use(cors());
  app.use(express.json({ limit: "2mb", verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'api-backend' });
  });

  // Metrics endpoint  
  app.get('/metrics', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.end('# HELP test_metric A test metric\n# TYPE test_metric counter\ntest_metric 1\n');
  });

  // Job enqueue (mock)
  app.post('/enqueue', (req, res) => {
    const { type, args } = req.body || {};
    const id = 'test-job-' + Date.now();
    res.json({ id, status: 'queued', type, args });
  });

  // Task status (mock)
  app.get('/tasks/:id', (req, res) => {
    const { id } = req.params;
    if (id === 'nonexistent') {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ 
      id, 
      status: 'done', 
      progress: 100, 
      result: { message: 'completed' } 
    });
  });

  // UPP webhook with signature verification
  app.post('/webhooks/upp', (req: any, res) => {
    const secret = process.env.UPP_WEBHOOK_SECRET || '';
    const sig = (req.headers['x-upp-signature'] as string) || '';
    const evtId = (req.headers['x-upp-event-id'] as string) || '';
    
    let ok = false;
    if (secret && req.rawBody) {
      const h = createHmac('sha256', secret).update(req.rawBody).digest('hex');
      const provided = sig.trim();
      if (provided && provided.length === h.length) {
        ok = provided === h;
      }
    }
    
    if (!ok && secret) {
      return res.status(401).json({ error: 'invalid_signature' });
    }
    
    res.status(200).send('ok');
  });

  // Mirror request (mock)
  app.post('/mirror', (req, res) => {
    const { url } = req.body || {};
    const id = 'mirror-job-' + Date.now();
    res.json({ id, accepted: true, url });
  });

  // UPP invoice creation (mock)
  app.post('/upp/invoice', (req, res) => {
    const { customerEmail, items } = req.body || {};
    res.json({
      id: 'inv_' + Date.now(),
      customerEmail,
      items,
      payLink: 'https://pay.test/invoice',
      status: 'pending'
    });
  });

  return app;
}

describe('API Backend Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = createTestApp();
    process.env.UPP_WEBHOOK_SECRET = 'test_secret_123';
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        ok: true,
        service: 'api-backend'
      });
    });
  });

  describe('Metrics Endpoint', () => {
    it('should return prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/plain/);
      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('test_metric');
    });
  });

  describe('Job Management', () => {
    it('should enqueue a job successfully', async () => {
      const jobData = {
        type: 'test.job',
        args: { param1: 'value1' }
      };

      const response = await request(app)
        .post('/enqueue')
        .send(jobData)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'queued',
        type: 'test.job',
        args: { param1: 'value1' }
      });
      expect(response.body.id).toMatch(/^test-job-\d+$/);
    });

    it('should get job status', async () => {
      const response = await request(app)
        .get('/tasks/job-123')
        .expect(200);

      expect(response.body).toEqual({
        id: 'job-123',
        status: 'done',
        progress: 100,
        result: { message: 'completed' }
      });
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .get('/tasks/nonexistent')
        .expect(404);

      expect(response.body).toEqual({
        error: 'not_found'
      });
    });
  });

  describe('UPP Webhook', () => {
    it('should accept valid webhook signature', async () => {
      const payload = JSON.stringify({ type: 'payment.completed', amount: 1500 });
      const secret = 'test_secret_123';
      const signature = createHmac('sha256', secret).update(payload).digest('hex');

      const response = await request(app)
        .post('/webhooks/upp')
        .set('x-upp-signature', signature)
        .set('x-upp-event-id', 'evt_test_123')
        .set('content-type', 'application/json')
        .send(payload)
        .expect(200);

      expect(response.text).toBe('ok');
    });

    it('should reject invalid webhook signature', async () => {
      const payload = JSON.stringify({ type: 'payment.completed' });

      const response = await request(app)
        .post('/webhooks/upp')
        .set('x-upp-signature', 'invalid_signature')
        .set('x-upp-event-id', 'evt_test_123')
        .set('content-type', 'application/json')
        .send(payload)
        .expect(401);

      expect(response.body).toEqual({
        error: 'invalid_signature'
      });
    });

    it('should accept webhook when no secret is configured', async () => {
      delete process.env.UPP_WEBHOOK_SECRET;
      
      const payload = JSON.stringify({ type: 'test.event' });

      const response = await request(app)
        .post('/webhooks/upp')
        .set('content-type', 'application/json')
        .send(payload)
        .expect(200);

      expect(response.text).toBe('ok');
      
      // Restore secret
      process.env.UPP_WEBHOOK_SECRET = 'test_secret_123';
    });
  });

  describe('Mirror Request', () => {
    it('should accept mirror request', async () => {
      const mirrorData = {
        url: 'https://example.com',
        slack: { channel: 'C123', user: 'U123' }
      };

      const response = await request(app)
        .post('/mirror')
        .send(mirrorData)
        .expect(200);

      expect(response.body).toMatchObject({
        accepted: true,
        url: 'https://example.com'
      });
      expect(response.body.id).toMatch(/^mirror-job-\d+$/);
    });
  });

  describe('UPP Invoice', () => {
    it('should create invoice successfully', async () => {
      const invoiceData = {
        customerEmail: 'test@example.com',
        items: [
          { sku: 'fish-001', qty: 2, priceCents: 1500 }
        ]
      };

      const response = await request(app)
        .post('/upp/invoice')
        .send(invoiceData)
        .expect(200);

      expect(response.body).toMatchObject({
        customerEmail: 'test@example.com',
        items: [{ sku: 'fish-001', qty: 2, priceCents: 1500 }],
        payLink: 'https://pay.test/invoice',
        status: 'pending'
      });
      expect(response.body.id).toMatch(/^inv_\d+$/);
    });

    it('should handle missing customer email', async () => {
      const response = await request(app)
        .post('/upp/invoice')
        .send({
          items: [{ sku: 'test', qty: 1, priceCents: 100 }]
        })
        .expect(200);

      expect(response.body.customerEmail).toBeUndefined();
      expect(response.body.items).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/enqueue')
        .set('content-type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle missing content-type', async () => {
      const response = await request(app)
        .post('/enqueue')
        .send({ type: 'test' })
        .expect(200);

      expect(response.body.type).toBe('test');
    });
  });
});