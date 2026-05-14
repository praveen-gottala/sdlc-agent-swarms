/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'agents-clarifier',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/core/(.*)$': '<rootDir>/../core/src/$1',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^@agentforge/retrieval$': '<rootDir>/../retrieval/src/index.ts',
    '^@agentforge/telemetry$': '<rootDir>/../telemetry/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
