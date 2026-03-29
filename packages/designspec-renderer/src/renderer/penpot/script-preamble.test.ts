import { ScriptBuilder } from './script-builder.js';
import { emitTokenMap, emitMakeTextHelper, emitPreamble, emitPostamble } from './script-preamble.js';
import { buildTokenMap, type TokenColorMap } from '../token-resolver.js';
import { SAMPLE_TOKENS } from '../../__fixtures__/design-tokens.js';

describe('script-preamble', () => {
  let colorMap: TokenColorMap;

  beforeAll(() => {
    colorMap = buildTokenMap(SAMPLE_TOKENS);
  });

  describe('emitTokenMap', () => {
    it('should produce a const T = { ... } block', () => {
      const sb = new ScriptBuilder();
      emitTokenMap(sb, colorMap);
      const output = sb.build();
      expect(output).toContain('const T = new Proxy({');
      expect(output).toContain('});');
    });

    it('should convert kebab-case token names to camelCase', () => {
      const sb = new ScriptBuilder();
      emitTokenMap(sb, colorMap);
      const output = sb.build();
      // cta-primary -> ctaPrimary
      expect(output).toContain('ctaPrimary:');
      // text-on-cta -> textOnCta
      expect(output).toContain('textOnCta:');
      // background-primary -> backgroundPrimary
      expect(output).toContain('backgroundPrimary:');
    });

    it('should include all primitive colors in the map', () => {
      const sb = new ScriptBuilder();
      emitTokenMap(sb, colorMap);
      const output = sb.build();
      // warm-cream -> warmCream
      expect(output).toContain("warmCream: '#FFF8E7'");
      // deep-teal -> deepTeal
      expect(output).toContain("deepTeal: '#0F6E56'");
      // coral-accent -> coralAccent
      expect(output).toContain("coralAccent: '#E8593C'");
    });

    it('should include all semantic colors resolved to hex', () => {
      const sb = new ScriptBuilder();
      emitTokenMap(sb, colorMap);
      const output = sb.build();
      // text-primary resolves to warm-gray -> #444441
      expect(output).toContain("textPrimary: '#444441'");
      // surface-elevated resolves to soft-white -> #FAFAF8
      expect(output).toContain("surfaceElevated: '#FAFAF8'");
      // overlay resolves to rgba pass-through
      expect(output).toContain("overlay: 'rgba(0,0,0,0.5)'");
    });
  });

  describe('emitMakeTextHelper', () => {
    it('should produce a function makeText(...) block', () => {
      const sb = new ScriptBuilder();
      emitMakeTextHelper(sb);
      const output = sb.build();
      expect(output).toContain('function makeText(content, fontSize, fontWeight, fillColor, opacity, wrapWidth)');
      expect(output).toContain("String(content) || ' '");
      expect(output).toContain('penpot.createText(textContent)');
      expect(output).toContain('t.fontSize = fontSize;');
      expect(output).toContain('return t;');
    });

    it('should include auto-height logic for long text', () => {
      const sb = new ScriptBuilder();
      emitMakeTextHelper(sb);
      const output = sb.build();
      expect(output).toContain("t.growType = 'auto-height'");
      expect(output).toContain('String(content).length > 18');
    });
  });

  describe('emitPreamble', () => {
    it('should start with try {', () => {
      const sb = new ScriptBuilder();
      emitPreamble(sb, colorMap);
      const output = sb.build();
      expect(output.startsWith('try {')).toBe(true);
    });

    it('should contain the token map and makeText helper', () => {
      const sb = new ScriptBuilder();
      emitPreamble(sb, colorMap);
      const output = sb.build();
      expect(output).toContain('const T = new Proxy({');
      expect(output).toContain('function makeText(');
    });
  });

  describe('emitPostamble', () => {
    it('should produce return statement with rootId and nodeIds', () => {
      const sb = new ScriptBuilder();
      emitPostamble(sb, 'root', [
        { varName: 'n1', nodeId: 'header' },
        { varName: 'n2', nodeId: 'content' },
      ]);
      const output = sb.build();
      expect(output).toContain('rootId: root.id,');
      expect(output).toContain("'header': n1.id,");
      expect(output).toContain("'content': n2.id,");
    });

    it('should produce a catch block', () => {
      const sb = new ScriptBuilder();
      emitPostamble(sb, 'root', []);
      const output = sb.build();
      expect(output).toContain('} catch (e) {');
      expect(output).toContain('__error: true');
      expect(output).toContain('e.message || String(e)');
    });
  });
});
