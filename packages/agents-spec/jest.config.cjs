/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'agents-spec',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/governance$': '<rootDir>/../governance/src/index.ts',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
