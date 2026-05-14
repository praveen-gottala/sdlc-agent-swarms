/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'cli',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/governance$': '<rootDir>/../governance/src/index.ts',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^@agentforge/channels$': '<rootDir>/../channels/src/index.ts',
    '^@agentforge/agents-design$': '<rootDir>/../agents-design/src/index.ts',
    '^@agentforge/agents-ux$': '<rootDir>/../agents-ux/src/index.ts',
    '^@agentforge/agents-ux/(.*)$': '<rootDir>/../agents-ux/src/$1',
    '^@agentforge/telemetry$': '<rootDir>/../telemetry/src/index.ts',
    '^@agentforge/designspec-renderer$': '<rootDir>/../designspec-renderer/src/index.ts',
    '^@agentforge/eval$': '<rootDir>/../eval/src/index.ts',
    '^@agentforge/agents-clarifier$': '<rootDir>/../agents-clarifier/src/index.ts',
    '^@agentforge/agents-clarifier/(.*)\\.js$': '<rootDir>/../agents-clarifier/src/$1',
    '^(\\..*)\\.js$': '$1',
  },
};
