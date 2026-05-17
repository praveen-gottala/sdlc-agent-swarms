/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  testMatch: ['**/*.test.ts'],
  displayName: 'e2e-test',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  testTimeout: 60000,
  // CLI pulls in @agentforge/eval → @agentforge/agents-clarifier; map to src so @swc/jest
  // transforms them. package.json "exports" default points at dist/*.js (ESM), which Jest won't load raw.
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
    '^@agentforge/telemetry$': '<rootDir>/../telemetry/src/index.ts',
    '^@agentforge/cli$': '<rootDir>/../cli/src/index.ts',
    '^@agentforge/cli/commands/(.*)$': '<rootDir>/../cli/src/commands/$1.ts',
    '^@agentforge/agents-implementer$': '<rootDir>/../agents-implementer/src/index.ts',
    '^@agentforge/agents-reviewer$': '<rootDir>/../agents-reviewer/src/index.ts',
    '^@agentforge/eval$': '<rootDir>/../eval/src/index.ts',
    '^@agentforge/agents-clarifier$': '<rootDir>/../agents-clarifier/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
