import { isVisionLLMEnabled, ENV_VISION_LLM } from './constants.js';
import { withEnv } from './test-utils/with-env.js';

describe('isVisionLLMEnabled', () => {
  it('returns true when env var is unset or empty (default-on)', async () => {
    await withEnv({ [ENV_VISION_LLM]: undefined }, () => {
      expect(isVisionLLMEnabled()).toBe(true);
    });
    await withEnv({ [ENV_VISION_LLM]: '' }, () => {
      expect(isVisionLLMEnabled()).toBe(true);
    });
  });

  it('returns true when env var is "true"', async () => {
    await withEnv({ [ENV_VISION_LLM]: 'true' }, () => {
      expect(isVisionLLMEnabled()).toBe(true);
    });
  });

  it('returns false for opt-out values "false" and "0"', async () => {
    await withEnv({ [ENV_VISION_LLM]: 'false' }, () => {
      expect(isVisionLLMEnabled()).toBe(false);
    });
    await withEnv({ [ENV_VISION_LLM]: '0' }, () => {
      expect(isVisionLLMEnabled()).toBe(false);
    });
  });
});
