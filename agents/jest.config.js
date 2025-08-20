/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services', '<rootDir>/packages'],
  testMatch: [
    '**/__tests__/**/*.{js,ts}',
    '**/?(*.)+(spec|test).{js,ts}'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/packages/video-adapters/test/',
    '<rootDir>/services/api-backend/test/',
    '<rootDir>/node_modules/'
  ],
  collectCoverageFrom: [
    'services/**/*.{ts,js}',
    'packages/**/*.{ts,js}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^db$': '<rootDir>/packages/db/src/index.ts',
    '^storage$': '<rootDir>/packages/storage/src/index.ts',
    '^upp-client$': '<rootDir>/packages/upp-client/src/index.ts',
    '^intent-router$': '<rootDir>/packages/intent-router/src/index.ts',
    '^video-adapters$': '<rootDir>/packages/video-adapters/src/index.ts'
  },
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json'
    }
  }
};