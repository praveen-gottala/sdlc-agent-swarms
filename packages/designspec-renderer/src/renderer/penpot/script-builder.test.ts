import { ScriptBuilder } from './script-builder.js';

describe('ScriptBuilder', () => {
  let sb: ScriptBuilder;

  beforeEach(() => {
    sb = new ScriptBuilder();
  });

  describe('line()', () => {
    it('should add a line with no indentation at level 0', () => {
      sb.line('const x = 1;');
      expect(sb.build()).toBe('const x = 1;');
    });

    it('should add lines with correct indentation after indent()', () => {
      sb.line('if (true) {');
      sb.indent();
      sb.line('doStuff();');
      expect(sb.build()).toBe('if (true) {\n  doStuff();');
    });

    it('should return this for chaining', () => {
      const result = sb.line('a');
      expect(result).toBe(sb);
    });
  });

  describe('indent() / dedent()', () => {
    it('should increase indentation level', () => {
      sb.indent();
      sb.line('indented');
      expect(sb.build()).toBe('  indented');
    });

    it('should decrease indentation level', () => {
      sb.indent();
      sb.indent();
      sb.dedent();
      sb.line('one level');
      expect(sb.build()).toBe('  one level');
    });

    it('should not go below level 0 on dedent', () => {
      sb.dedent();
      sb.dedent();
      sb.line('still level 0');
      expect(sb.build()).toBe('still level 0');
    });
  });

  describe('openBlock() / closeBlock()', () => {
    it('should open a block with prefix and indent', () => {
      sb.openBlock('if (x)');
      sb.line('return;');
      sb.closeBlock();
      expect(sb.build()).toBe('if (x) {\n  return;\n}');
    });

    it('should open a block without prefix', () => {
      sb.openBlock();
      sb.line('inner');
      sb.closeBlock();
      expect(sb.build()).toBe('{\n  inner\n}');
    });

    it('should close with a suffix', () => {
      sb.openBlock('try');
      sb.line('something();');
      sb.closeBlock(' catch (e) {');
      expect(sb.build()).toBe('try {\n  something();\n} catch (e) {');
    });
  });

  describe('comment()', () => {
    it('should add a // prefixed comment at current indentation', () => {
      sb.comment('hello');
      expect(sb.build()).toBe('// hello');
    });

    it('should respect indentation', () => {
      sb.indent();
      sb.comment('indented comment');
      expect(sb.build()).toBe('  // indented comment');
    });
  });

  describe('blank()', () => {
    it('should add an empty line', () => {
      sb.line('before');
      sb.blank();
      sb.line('after');
      expect(sb.build()).toBe('before\n\nafter');
    });
  });

  describe('build()', () => {
    it('should join all lines with newlines', () => {
      sb.line('a');
      sb.line('b');
      sb.line('c');
      expect(sb.build()).toBe('a\nb\nc');
    });

    it('should return empty string when no lines added', () => {
      expect(sb.build()).toBe('');
    });
  });

  describe('length', () => {
    it('should return the number of lines', () => {
      expect(sb.length).toBe(0);
      sb.line('one');
      sb.blank();
      sb.line('three');
      expect(sb.length).toBe(3);
    });
  });

  describe('multiple levels of nesting', () => {
    it('should handle 3 levels of nesting correctly', () => {
      sb.line('function foo() {');
      sb.indent();
      sb.line('if (x) {');
      sb.indent();
      sb.line('for (const i of arr) {');
      sb.indent();
      sb.line('console.log(i);');
      sb.dedent();
      sb.line('}');
      sb.dedent();
      sb.line('}');
      sb.dedent();
      sb.line('}');

      const expected = [
        'function foo() {',
        '  if (x) {',
        '    for (const i of arr) {',
        '      console.log(i);',
        '    }',
        '  }',
        '}',
      ].join('\n');
      expect(sb.build()).toBe(expected);
    });
  });
});
