/** @type {import('jest').Config} */
module.exports = {
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  testMatch: ['**/*.test.ts'],
  displayName: 'e2e-test',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  testTimeout: 60000,
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/governance$': '<rootDir>/../governance/src/index.ts',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^@agentforge/channels$': '<rootDir>/../channels/src/index.ts',
    '^@agentforge/agents-code$': '<rootDir>/../agents-code/src/index.ts',
    '^@agentforge/agents-design$': '<rootDir>/../agents-design/src/index.ts',
    '^@agentforge/agents-spec$': '<rootDir>/../agents-spec/src/index.ts',
    '^@agentforge/agents-cicd$': '<rootDir>/../agents-cicd/src/index.ts',
    '^@agentforge/agents-ux$': '<rootDir>/../agents-ux/src/index.ts',
    '^@agentforge/designspec-renderer$': '<rootDir>/../designspec-renderer/src/index.ts',
    '^@agentforge/cli$': '<rootDir>/../cli/src/index.ts',
    '^@agentforge/cli/commands/(.*)$': '<rootDir>/../cli/src/commands/$1.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
