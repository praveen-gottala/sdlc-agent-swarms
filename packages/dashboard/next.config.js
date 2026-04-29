/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@agentforge/core',
    '@agentforge/agents-ux',
    '@agentforge/designspec-renderer',
    '@agentforge/providers',
    '@agentforge/cli',
  ],
  serverExternalPackages: ['playwright', 'playwright-core', '@agentforge/agents-clarifier'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Tree-shake barrel re-exports — only compile the symbols the dashboard
    // actually imports, not every export from each monorepo package.
    // This dramatically reduces on-demand compilation in dev mode.
    // Note: `@agentforge/agents-ux` is omitted — Next's barrel optimization can miss
    // new named exports (e.g. after Chrome Pass), causing "is not exported" at runtime
    // when the dashboard transpiles @agentforge/cli (which re-exports many UX symbols).
    // Note: `@agentforge/core` and `@agentforge/agents-ux` are omitted — Next's
    // barrel optimization can miss new named exports (e.g. isVisionLLMEnabled),
    // causing "is not exported" at runtime when transitive imports reference them.
    optimizePackageImports: [
      '@agentforge/designspec-renderer',
      '@agentforge/providers',
      '@agentforge/cli',
    ],
  },
  webpack: (config) => {
    // Monorepo packages expose `./src/*.ts` under the `@agentforge/source` export
    // condition and `./dist/*.js` under `default`. Prefer source so stale prebuilt
    // dist (e.g. after removing exports like recordPromptTrace) cannot break the app.
    const prev = config.resolve.conditionNames ?? ['import', 'require', 'default'];
    config.resolve.conditionNames = ['@agentforge/source', ...prev];
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
module.exports = nextConfig;
