import { createEnvSecretProvider } from './secret-manager.js';

describe('SecretManager', () => {
  describe('createEnvSecretProvider', () => {
    it('should return secret from environment variable', () => {
      const env = { AGENTFORGE_MCP_FIGMA_TOKEN: 'fig_secret_123' };
      const provider = createEnvSecretProvider(env);

      const result = provider.getSecret('figma', 'TOKEN');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('fig_secret_123');
      }
    });

    it('should normalize server names to uppercase', () => {
      const env = { AGENTFORGE_MCP_GITHUB_TOKEN: 'gh_token_456' };
      const provider = createEnvSecretProvider(env);

      const result = provider.getSecret('github', 'token');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('gh_token_456');
      }
    });

    it('should handle server names with special characters', () => {
      const env = { AGENTFORGE_MCP_MY_SERVER_API_KEY: 'key_789' };
      const provider = createEnvSecretProvider(env);

      const result = provider.getSecret('my-server', 'api-key');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('key_789');
      }
    });

    it('should return error when secret is not configured', () => {
      const provider = createEnvSecretProvider({});

      const result = provider.getSecret('figma', 'TOKEN');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MCP_UNAVAILABLE');
        expect(result.error.message).toContain('AGENTFORGE_MCP_FIGMA_TOKEN');
      }
    });

    it('should return error when secret is empty string', () => {
      const env = { AGENTFORGE_MCP_FIGMA_TOKEN: '' };
      const provider = createEnvSecretProvider(env);

      const result = provider.getSecret('figma', 'TOKEN');
      expect(result.ok).toBe(false);
    });

    it('should never include secret value in error messages', () => {
      const env = { AGENTFORGE_MCP_FIGMA_TOKEN: 'super_secret_value' };
      const provider = createEnvSecretProvider(env);

      // Getting a missing secret — error should not leak any secret values
      const result = provider.getSecret('other', 'TOKEN');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).not.toContain('super_secret_value');
        expect(JSON.stringify(result.error)).not.toContain('super_secret_value');
      }
    });

    it('should report hasSecret correctly', () => {
      const env = { AGENTFORGE_MCP_GITHUB_TOKEN: 'gh_123' };
      const provider = createEnvSecretProvider(env);

      expect(provider.hasSecret('github', 'TOKEN')).toBe(true);
      expect(provider.hasSecret('figma', 'TOKEN')).toBe(false);
      expect(provider.hasSecret('github', 'API_KEY')).toBe(false);
    });

    it('should report hasSecret false for empty string', () => {
      const env = { AGENTFORGE_MCP_GITHUB_TOKEN: '' };
      const provider = createEnvSecretProvider(env);

      expect(provider.hasSecret('github', 'TOKEN')).toBe(false);
    });
  });
});
