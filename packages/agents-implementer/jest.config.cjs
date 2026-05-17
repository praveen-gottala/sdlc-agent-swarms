/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'agents-implementer',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/core/(.*)$': '<rootDir>/../core/src/$1',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^@agentforge/telemetry$': '<rootDir>/../telemetry/src/index.ts',
    '^@agentforge/agents-ux$': '<rootDir>/../agents-ux/src/index.ts',
    '^@agentforge/agents-architect$': '<rootDir>/../agents-architect/src/index.ts',
    '^@agentforge/designspec-renderer$': '<rootDir>/../designspec-renderer/src/index.ts',
    '^@agentforge/governance$': '<rootDir>/../governance/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
