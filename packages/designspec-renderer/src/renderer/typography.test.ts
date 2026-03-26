import { resolveTypography } from './typography.js';
import { SAMPLE_TOKENS } from '../__fixtures__/design-tokens.js';

describe('typography', () => {
  describe('resolveTypography', () => {
    it('should resolve heading-1', () => {
      expect(resolveTypography('heading-1', SAMPLE_TOKENS)).toEqual({
        fontFamily: 'Nunito',
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 1.2,
      });
    });

    it('should resolve heading-2', () => {
      expect(resolveTypography('heading-2', SAMPLE_TOKENS)).toEqual({
        fontFamily: 'Nunito',
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1.25,
      });
    });

    it('should resolve heading-3', () => {
      expect(resolveTypography('heading-3', SAMPLE_TOKENS)).toEqual({
        fontFamily: 'Nunito',
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 1.3,
      });
    });

    it('should resolve body', () => {
      expect(resolveTypography('body', SAMPLE_TOKENS)).toEqual({
        fontFamily: 'Open Sans',
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.5,
      });
    });

    it('should resolve small', () => {
      expect(resolveTypography('small', SAMPLE_TOKENS)).toEqual({
        fontFamily: 'Open Sans',
        fontSize: 11,
        fontWeight: 400,
        lineHeight: 1.4,
      });
    });

    it('should resolve label', () => {
      expect(resolveTypography('label', SAMPLE_TOKENS)).toEqual({
        fontFamily: 'Open Sans',
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.4,
      });
    });

    it('should return undefined for nonexistent role', () => {
      expect(resolveTypography('nonexistent', SAMPLE_TOKENS)).toBeUndefined();
    });
  });
});
