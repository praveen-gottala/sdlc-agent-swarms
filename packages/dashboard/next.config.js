/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@agentforge/core',
    '@agentforge/agents-ux',
    '@agentforge/designspec-renderer',
    '@agentforge/providers',
    '@agentforge/cli',
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Tree-shake barrel re-exports — only compile the symbols the dashboard
    // actually imports, not every export from each monorepo package.
    // This dramatically reduces on-demand compilation in dev mode.
    optimizePackageImports: [
      '@agentforge/core',
      '@agentforge/agents-ux',
      '@agentforge/designspec-renderer',
      '@agentforge/providers',
      '@agentforge/cli',
    ],
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
module.exports = nextConfig;
