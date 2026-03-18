/** @type {import('jest').Config} */
module.exports = {
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
