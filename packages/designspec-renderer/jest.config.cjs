/** @type {import('jest').Config} */
module.exports = {
  testPathIgnorePatterns: ["/dist/", "/node_modules/", "/__tests__/output/"],
  displayName: 'designspec-renderer',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
