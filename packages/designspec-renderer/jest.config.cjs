/** @type {import('jest').Config} */
module.exports = {
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'designspec-renderer',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
