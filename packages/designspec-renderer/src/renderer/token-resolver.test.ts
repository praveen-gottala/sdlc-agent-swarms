import { buildTokenMap, resolveColor, type TokenColorMap } from './token-resolver.js';
import { SAMPLE_TOKENS, SAMPLE_RESOLVED_COLORS } from '../__fixtures__/design-tokens.js';

describe('token-resolver', () => {
  let colorMap: TokenColorMap;

  beforeAll(() => {
    colorMap = buildTokenMap(SAMPLE_TOKENS);
  });

  describe('buildTokenMap', () => {
    it('should produce a map matching SAMPLE_RESOLVED_COLORS', () => {
      expect(colorMap).toEqual(SAMPLE_RESOLVED_COLORS);
    });

    it('should include all primitive colors', () => {
      expect(colorMap['warm-cream']).toBe('#FFF8E7');
      expect(colorMap['deep-teal']).toBe('#0F6E56');
      expect(colorMap['warm-gray']).toBe('#444441');
      expect(colorMap['warm-gray-light']).toBe('#9C9C97');
      expect(colorMap['soft-white']).toBe('#FAFAF8');
      expect(colorMap['coral-accent']).toBe('#E8593C');
    });

    it('should resolve all semantic colors to hex', () => {
      expect(colorMap['background-primary']).toBe('#FFF8E7');
      expect(colorMap['cta-primary']).toBe('#0F6E56');
      expect(colorMap['text-primary']).toBe('#444441');
      expect(colorMap['text-secondary']).toBe('#9C9C97');
      expect(colorMap['surface-elevated']).toBe('#FAFAF8');
      expect(colorMap['error']).toBe('#E8593C');
      expect(colorMap['success']).toBe('#0F6E56');
    });
  });

  describe('resolveColor', () => {
    it('should resolve semantic token names', () => {
      expect(resolveColor('cta-primary', colorMap)).toBe('#0F6E56');
      expect(resolveColor('text-secondary', colorMap)).toBe('#9C9C97');
      expect(resolveColor('surface-elevated', colorMap)).toBe('#FAFAF8');
      expect(resolveColor('background-primary', colorMap)).toBe('#FFF8E7');
    });

    it('should pass through raw hex values', () => {
      expect(resolveColor('#FF0000', colorMap)).toBe('#FF0000');
      expect(resolveColor('#ABC', colorMap)).toBe('#ABC');
    });

    it('should return undefined for nonexistent tokens', () => {
      expect(resolveColor('nonexistent', colorMap)).toBeUndefined();
    });

    it('should pass through transparent', () => {
      expect(resolveColor('transparent', colorMap)).toBe('transparent');
    });

    it('should pass through none', () => {
      expect(resolveColor('none', colorMap)).toBe('none');
    });
  });
});
