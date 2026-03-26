/**
 * @module @agentforge/designspec-renderer/renderer/react/jsx-builder
 * Builds a JSX/TSX string from accumulated tags with proper indentation and import collection.
 */

/** A collected import: component name + import path. */
export interface ImportEntry {
  readonly component: string;
  readonly path: string;
}

/**
 * JSX string builder — accumulates JSX tags with indentation,
 * collects imports, and produces a complete TSX component file.
 */
export class JsxBuilder {
  private readonly lines: string[] = [];
  private indentLevel = 0;
  private readonly indentStr = '  ';
  /** path → Set<component> for deduplication. */
  private readonly importMap = new Map<string, Set<string>>();

  /** Emit a self-closing tag: `<hr className="..." />` */
  selfClosing(tag: string, attrs?: string): this {
    const attrStr = attrs ? ` ${attrs}` : '';
    this.lines.push(`${this.pad()}<${tag}${attrStr} />`);
    return this;
  }

  /** Open a tag and increase indentation. */
  open(tag: string, attrs?: string): this {
    const attrStr = attrs ? ` ${attrs}` : '';
    this.lines.push(`${this.pad()}<${tag}${attrStr}>`);
    this.indentLevel++;
    return this;
  }

  /** Close a tag and decrease indentation. */
  close(tag: string): this {
    if (this.indentLevel > 0) this.indentLevel--;
    this.lines.push(`${this.pad()}</${tag}>`);
    return this;
  }

  /** Emit raw text content at current indentation. */
  text(content: string): this {
    this.lines.push(`${this.pad()}${content}`);
    return this;
  }

  /** Emit a JSX expression (e.g., a JSX comment or interpolation). */
  expr(content: string): this {
    this.lines.push(`${this.pad()}${content}`);
    return this;
  }

  /** Register a shadcn/ui import to collect. Deduplicates automatically. */
  addImport(component: string, path: string): this {
    const set = this.importMap.get(path) ?? new Set<string>();
    set.add(component);
    this.importMap.set(path, set);
    return this;
  }

  /** Get all collected imports, deduplicated. */
  getImports(): readonly ImportEntry[] {
    const result: ImportEntry[] = [];
    for (const [path, components] of this.importMap) {
      for (const component of components) {
        result.push({ component, path });
      }
    }
    return result;
  }

  /**
   * Build the complete TSX file: imports + exported component function.
   * @param componentName — PascalCase function name (e.g., 'SettingsFormScreen')
   */
  build(componentName: string): string {
    const parts: string[] = [];

    // Emit imports grouped by path
    const sortedPaths = [...this.importMap.keys()].sort();
    for (const path of sortedPaths) {
      const components = [...this.importMap.get(path)!].sort();
      parts.push(`import { ${components.join(', ')} } from '${path}';`);
    }

    if (sortedPaths.length > 0) {
      parts.push('');
    }

    // Emit component function
    parts.push(`export function ${componentName}() {`);
    parts.push('  return (');

    // Indent the JSX body by 4 spaces (2 for function body + 2 for return parens)
    for (const line of this.lines) {
      parts.push(line.length > 0 ? `    ${line}` : '');
    }

    parts.push('  );');
    parts.push('}');

    return parts.join('\n');
  }

  /** Current indentation string. */
  private pad(): string {
    return this.indentStr.repeat(this.indentLevel);
  }
}
