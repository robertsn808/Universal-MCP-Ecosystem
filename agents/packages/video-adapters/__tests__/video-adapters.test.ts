const { createProvider } = require('../src/index');

describe('Video Adapters', () => {
  describe('createProvider', () => {
    it('should create runway provider', () => {
      const provider = createProvider('runway');
      expect(provider).toBeDefined();
      expect(typeof provider.start).toBe('function');
      expect(typeof provider.status).toBe('function');
    });

    it('should create luma provider', () => {
      const provider = createProvider('luma');
      expect(provider).toBeDefined();
      expect(typeof provider.start).toBe('function');
      expect(typeof provider.status).toBe('function');
    });

    it('should create pika provider', () => {
      const provider = createProvider('pika');
      expect(provider).toBeDefined();
      expect(typeof provider.start).toBe('function');
      expect(typeof provider.status).toBe('function');
    });
  });

  describe('Provider simulation', () => {
    it('should return succeeded status for old IDs', async () => {
      const provider = createProvider('runway');
      const pastTs = Date.now() - 30000;
      const id = `sim-${pastTs}`;
      
      const status = await provider.status(id);
      
      expect(status.status).toBe('succeeded');
      expect(status.progress).toBe(100);
      expect(status.artifacts).toHaveLength(1);
      expect(status.artifacts[0]).toHaveProperty('url');
      expect(status.artifacts[0]).toHaveProperty('filename');
    });

    it('should return in_progress status for recent IDs', async () => {
      const provider = createProvider('runway');
      const recentTs = Date.now() - 5000;
      const id = `sim-${recentTs}`;
      
      const status = await provider.status(id);
      
      expect(['in_progress', 'running']).toContain(status.status);
      expect(status.progress).toBeGreaterThanOrEqual(0);
      expect(status.progress).toBeLessThan(100);
    });

    it('should start video generation', async () => {
      const provider = createProvider('runway');
      
      const result = await provider.start({
        prompt: 'test video',
        durationSeconds: 10
      });
      
      expect(result).toHaveProperty('id');
      expect(result.id).toMatch(/^sim-\d+$/);
    });
  });
});