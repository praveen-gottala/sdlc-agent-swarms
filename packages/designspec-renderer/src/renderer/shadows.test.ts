import { resolveShadow } from './shadows.js';
import { SAMPLE_TOKENS } from '../__fixtures__/design-tokens.js';

describe('shadows', () => {
  describe('resolveShadow', () => {
    it('should resolve "none" to "none"', () => {
      expect(resolveShadow('none', SAMPLE_TOKENS)).toBe('none');
    });

    it('should resolve "sm" to level 1 shadow', () => {
      expect(resolveShadow('sm', SAMPLE_TOKENS)).toBe('0 2px 8px rgba(15,110,86,0.06)');
    });

    it('should resolve "md" to level 2 shadow', () => {
      expect(resolveShadow('md', SAMPLE_TOKENS)).toBe('0 4px 16px rgba(15,110,86,0.10)');
    });

    it('should resolve "lg" to level 3 shadow', () => {
      expect(resolveShadow('lg', SAMPLE_TOKENS)).toBe('0 8px 32px rgba(15,110,86,0.14)');
    });

    it('should resolve numeric level "0" to "none"', () => {
      expect(resolveShadow('0', SAMPLE_TOKENS)).toBe('none');
    });

    it('should resolve numeric level "1" to level 1 shadow', () => {
      expect(resolveShadow('1', SAMPLE_TOKENS)).toBe('0 2px 8px rgba(15,110,86,0.06)');
    });

    it('should return "none" for unknown alias', () => {
      expect(resolveShadow('unknown', SAMPLE_TOKENS)).toBe('none');
    });

    it('should pass through raw CSS shadow values', () => {
      const raw = '0 2px 4px rgba(0,0,0,0.1)';
      expect(resolveShadow(raw, SAMPLE_TOKENS)).toBe(raw);
    });
  });
});
