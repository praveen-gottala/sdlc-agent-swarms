/**
 * @module @agentforge/designspec-renderer/renderer/penpot/script-builder
 * Builds a Penpot JavaScript string from accumulated lines.
 */

/** Indentation state and line accumulator for Penpot script generation. */
export class ScriptBuilder {
  private readonly lines: string[] = [];
  private indentLevel = 0;
  private readonly indentStr = '  ';

  /** Add a line at the current indentation level. */
  line(code: string): this {
    this.lines.push(`${this.indentStr.repeat(this.indentLevel)}${code}`);
    return this;
  }

  /** Add an empty line. */
  blank(): this {
    this.lines.push('');
    return this;
  }

  /** Add a comment line. */
  comment(text: string): this {
    return this.line(`// ${text}`);
  }

  /** Increase indentation. */
  indent(): this {
    this.indentLevel++;
    return this;
  }

  /** Decrease indentation. */
  dedent(): this {
    if (this.indentLevel > 0) this.indentLevel--;
    return this;
  }

  /** Open a block (e.g., `{`) and indent. */
  openBlock(prefix?: string): this {
    if (prefix) this.line(`${prefix} {`);
    else this.line('{');
    return this.indent();
  }

  /** Dedent and close a block (e.g., `}`). */
  closeBlock(suffix?: string): this {
    this.dedent();
    this.line(`}${suffix ?? ''}`);
    return this;
  }

  /** Get the total number of lines. */
  get length(): number {
    return this.lines.length;
  }

  /** Build the final script string. */
  build(): string {
    return this.lines.join('\n');
  }
}
