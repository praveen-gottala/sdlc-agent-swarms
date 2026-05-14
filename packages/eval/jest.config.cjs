/** @type {import('jest').Config} */
module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ['/dist/', '/node_modules/'],
  displayName: 'eval',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/core/(.*)\\.js$': '<rootDir>/../core/src/$1',
    '^@agentforge/core/(.*)$': '<rootDir>/../core/src/$1',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^@agentforge/providers/(.*)\\.js$': '<rootDir>/../providers/src/$1',
    '^@agentforge/providers/(.*)$': '<rootDir>/../providers/src/$1',
    '^@agentforge/agents-clarifier$': '<rootDir>/../agents-clarifier/src/index.ts',
    '^@agentforge/agents-clarifier/(.*)\\.js$': '<rootDir>/../agents-clarifier/src/$1',
    '^@agentforge/agents-clarifier/(.*)$': '<rootDir>/../agents-clarifier/src/$1',
    '^(\\..*)\\.js$': '$1',
  },
};
