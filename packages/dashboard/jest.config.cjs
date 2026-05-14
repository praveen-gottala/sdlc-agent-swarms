module.exports = {
  forceExit: true,
  displayName: 'dashboard',
  testEnvironment: 'jsdom',
  transform: { '^.+\\.tsx?$': ['@swc/jest'] },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@agentforge/agents-ux/schemas$': '<rootDir>/../agents-ux/src/schemas.ts',
    '^@agentforge/agents-ux$': '<rootDir>/../agents-ux/src/index.ts',
    '^@agentforge/telemetry$': '<rootDir>/../telemetry/src/index.ts',
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
