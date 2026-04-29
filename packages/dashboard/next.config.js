/** @type {import('next').NextConfig} */
const nextConfig = {
  // All monorepo packages use pre-built dist/ (not raw TypeScript source).
  // Rebuild packages with `nx run-many -t build` after changing their source.
  // Server-only packages are loaded at runtime by Node.js, not compiled by webpack.
  serverExternalPackages: [
    'playwright',
    'playwright-core',
    '@agentforge/agents-clarifier',
    '@agentforge/agents-ux',
    '@agentforge/designspec-renderer',
    '@agentforge/providers',
    '@agentforge/cli',
  ],
  experimental: {
    optimizePackageImports: [
      '@agentforge/core',
    ],
  },
};
module.exports = nextConfig;
