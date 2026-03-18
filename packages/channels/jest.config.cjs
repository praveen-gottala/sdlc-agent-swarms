/** @type {import('jest').Config} */
module.exports = {
  displayName: 'channels',
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
