module.exports = {
  displayName: 'dashboard',
  testEnvironment: 'jsdom',
  transform: { '^.+\\.tsx?$': ['@swc/jest'] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
