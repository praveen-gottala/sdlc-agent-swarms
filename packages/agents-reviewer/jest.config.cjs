/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  passWithNoTests: true,
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'agents-reviewer',
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
    '^@agentforge/governance$': '<rootDir>/../governance/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
