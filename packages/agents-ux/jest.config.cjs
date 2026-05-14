/** @type {import('jest').Config} */

// Integration tests (e2e-*) call the live Anthropic API (~$1-3 per run).
// They are excluded by default. Opt in with: RUN_E2E_PROOF=true
const ignorePatterns = ["/dist/", "/node_modules/"];
if (process.env.RUN_E2E_PROOF !== 'true') {
  ignorePatterns.push("__tests__/e2e-");
}

module.exports = {
  forceExit: true,
  testPathIgnorePatterns: ignorePatterns,
  displayName: 'agents-ux',
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  globalSetup: '<rootDir>/jest.integration-guard.cjs',
  moduleNameMapper: {
    '^@agentforge/core$': '<rootDir>/../core/src/index.ts',
    '^@agentforge/agents-design$': '<rootDir>/../agents-design/src/index.ts',
    '^@agentforge/providers$': '<rootDir>/../providers/src/index.ts',
    '^@agentforge/designspec-renderer$': '<rootDir>/../designspec-renderer/src/index.ts',
    '^(\\..*)\\.js$': '$1',
  },
};
