/** @type {import('jest').Config} */
module.exports = {
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'providers',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
