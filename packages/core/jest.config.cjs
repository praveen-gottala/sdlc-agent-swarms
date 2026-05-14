/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ["/dist/", "/node_modules/"],
  displayName: 'core',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
