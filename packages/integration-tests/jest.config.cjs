/** @type {import('jest').Config} */
module.exports = {
  displayName: 'integration-tests',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/governance$': '<rootDir>/../governance/src/index.ts',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^@agentforge/channels$': '<rootDir>/../channels/src/index.ts',
    '^@agentforge/agents-code$': '<rootDir>/../agents-code/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
