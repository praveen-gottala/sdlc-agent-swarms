/**
 * @module @agentforge/retrieval/repo-map/parser
 *
 * Extracts symbols (functions, classes, interfaces, types, enums) and imports
 * from TypeScript/JavaScript source files. Uses regex-based extraction for the
 * repo map use case (declaration-level, not full AST). Full AST parsing via
 * web-tree-sitter is deferred to the code chunker (Task 2.2) where statement-
 * level boundary precision matters.
 */

import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { RetrievalError } from '../types.js';

export type SymbolKind = 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'enum';

export interface ParsedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly signature: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly exported: boolean;
}

export interface ParsedImport {
  readonly source: string;
  readonly specifiers: readonly string[];
  readonly line: number;
}

export interface ParsedFile {
  readonly filePath: string;
  readonly language: string;
  readonly symbols: readonly ParsedSymbol[];
  readonly imports: readonly ParsedImport[];
}

const PATTERNS = {
  functionDecl: /^(\s*)(export\s+)?(?:async\s+)?function\s+(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+(?:<[^>]+>)?))?/,
  arrowFn: /^(\s*)(export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]+)\s*=>/,
  classDecl: /^(\s*)(export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+(?:extends|implements)\s+[^{]+)?/,
  interfaceDecl: /^(\s*)(export\s+)?interface\s+(\w+)(?:\s*<[^>]*>)?(?:\s+extends\s+[^{]+)?/,
  typeDecl: /^(\s*)(export\s+)?type\s+(\w+)(?:\s*<[^>]*>)?\s*=/,
  enumDecl: /^(\s*)(export\s+)?(?:const\s+)?enum\s+(\w+)/,
  methodDecl: /^(\s+)(?:readonly\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{;]+(?:<[^>]+>)?))?/,
  importDecl: /^import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/,
  importStar: /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/,
};

function findBlockEnd(lines: readonly string[], startLine: number, startIndent: number): number {
  let braceDepth = 0;
  let foundOpen = false;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === '{') { braceDepth++; foundOpen = true; }
      if (ch === '}') { braceDepth--; }
    }
    if (foundOpen && braceDepth <= 0) return i;
    if (!foundOpen && i > startLine && line.trim().length > 0) {
      const indent = line.length - line.trimStart().length;
      if (indent <= startIndent && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        return i - 1;
      }
    }
  }
  return lines.length - 1;
}

/** Parse a TypeScript/JavaScript file and extract symbols + imports. */
export function parseFile(filePath: string, content: string, language: string): Result<ParsedFile, RetrievalError> {
  if (language !== 'typescript' && language !== 'javascript') {
    return Err({ code: 'TREESITTER_PARSE_ERROR', message: `Unsupported language: ${language}`, recoverable: false });
  }

  const lines = content.split('\n');
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  let insideClass = false;
  let classEndLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    if (i > classEndLine) insideClass = false;

    // Imports
    const importMatch = line.match(PATTERNS.importDecl);
    if (importMatch) {
      const specifiers = importMatch[1]
        ? importMatch[1].split(',').map(s => s.trim().replace(/\s+as\s+\w+/, '')).filter(Boolean)
        : importMatch[2] ? [importMatch[2]] : [];
      imports.push({ source: importMatch[3]!, specifiers, line: i + 1 });
      continue;
    }

    const importStarMatch = line.match(PATTERNS.importStar);
    if (importStarMatch) {
      imports.push({ source: importStarMatch[2]!, specifiers: [`* as ${importStarMatch[1]}`], line: i + 1 });
      continue;
    }

    // Class
    const classMatch = line.match(PATTERNS.classDecl);
    if (classMatch) {
      const indent = classMatch[1]!.length;
      const endLine = findBlockEnd(lines, i, indent);
      symbols.push({
        name: classMatch[3]!,
        kind: 'class',
        signature: trimmed.replace(/\s*\{.*/, ''),
        startLine: i + 1,
        endLine: endLine + 1,
        exported: !!classMatch[2],
      });
      insideClass = true;
      classEndLine = endLine;
      continue;
    }

    // Interface
    const ifaceMatch = line.match(PATTERNS.interfaceDecl);
    if (ifaceMatch) {
      const indent = ifaceMatch[1]!.length;
      const endLine = findBlockEnd(lines, i, indent);
      symbols.push({
        name: ifaceMatch[3]!,
        kind: 'interface',
        signature: trimmed.replace(/\s*\{.*/, ''),
        startLine: i + 1,
        endLine: endLine + 1,
        exported: !!ifaceMatch[2],
      });
      continue;
    }

    // Type alias
    const typeMatch = line.match(PATTERNS.typeDecl);
    if (typeMatch) {
      const endLine = line.includes(';') ? i : findBlockEnd(lines, i, typeMatch[1]!.length);
      symbols.push({
        name: typeMatch[3]!,
        kind: 'type',
        signature: trimmed.replace(/\s*=.*/, ''),
        startLine: i + 1,
        endLine: endLine + 1,
        exported: !!typeMatch[2],
      });
      continue;
    }

    // Enum
    const enumMatch = line.match(PATTERNS.enumDecl);
    if (enumMatch) {
      const indent = enumMatch[1]!.length;
      const endLine = findBlockEnd(lines, i, indent);
      symbols.push({
        name: enumMatch[3]!,
        kind: 'enum',
        signature: trimmed.replace(/\s*\{.*/, ''),
        startLine: i + 1,
        endLine: endLine + 1,
        exported: !!enumMatch[2],
      });
      continue;
    }

    // Function declaration
    const fnMatch = line.match(PATTERNS.functionDecl);
    if (fnMatch && !insideClass) {
      const indent = fnMatch[1]!.length;
      const endLine = findBlockEnd(lines, i, indent);
      const params = fnMatch[5] ?? '';
      const returnType = fnMatch[6] ?? '';
      symbols.push({
        name: fnMatch[3]!,
        kind: 'function',
        signature: `function ${fnMatch[3]}(${params})${returnType ? `: ${returnType}` : ''}`,
        startLine: i + 1,
        endLine: endLine + 1,
        exported: !!fnMatch[2],
      });
      continue;
    }

    // Arrow function
    const arrowMatch = line.match(PATTERNS.arrowFn);
    if (arrowMatch && !insideClass) {
      const indent = arrowMatch[1]!.length;
      const endLine = findBlockEnd(lines, i, indent);
      symbols.push({
        name: arrowMatch[3]!,
        kind: 'function',
        signature: trimmed.replace(/\s*=\s*(?:async\s+)?\(.*/, ''),
        startLine: i + 1,
        endLine: endLine + 1,
        exported: !!arrowMatch[2],
      });
      continue;
    }

    // Method (inside class)
    if (insideClass) {
      const methodMatch = line.match(PATTERNS.methodDecl);
      if (methodMatch && methodMatch[2] !== 'if' && methodMatch[2] !== 'for' && methodMatch[2] !== 'while' && methodMatch[2] !== 'switch' && methodMatch[2] !== 'return' && methodMatch[2] !== 'throw' && methodMatch[2] !== 'catch') {
        const indent = methodMatch[1]!.length;
        const endLine = findBlockEnd(lines, i, indent);
        const params = methodMatch[4] ?? '';
        const returnType = methodMatch[5] ?? '';
        symbols.push({
          name: methodMatch[2]!,
          kind: 'method',
          signature: `${methodMatch[2]}(${params})${returnType ? `: ${returnType}` : ''}`,
          startLine: i + 1,
          endLine: endLine + 1,
          exported: false,
        });
      }
    }
  }

  return Ok({ filePath, language, symbols, imports });
}

/** Detect language from file extension. */
export function detectLanguage(filePath: string): string | undefined {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'javascript';
  return undefined;
}
