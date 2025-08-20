// Global test setup
require('dotenv').config({ path: '.env.test' });

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console.log/error for cleaner test output
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Restore console for specific tests that need it
global.restoreConsole = () => {
  global.console = originalConsole;
};

// Clean up test artifacts
afterAll(async () => {
  // Clean up any test files or connections
  if (global.testCleanup) {
    await global.testCleanup();
  }
});