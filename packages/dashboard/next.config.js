/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@agentforge/core',
    '@agentforge/agents-ux',
    '@agentforge/designspec-renderer',
    '@agentforge/cli',
  ],
  eslint: {
    // Next 14's build-integrated lint runner still passes removed ESLint 9 options.
    // Linting is verified separately in CI/editor tooling, so skip it here to keep
    // `next build` focused on production compilation.
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // Resolve .js extensions to .ts source when transpiling monorepo packages.
    // @agentforge/core uses ESM-style .js imports in .ts files (e.g. './types/index.js')
    // which webpack can't resolve from source without this alias.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
module.exports = nextConfig;
