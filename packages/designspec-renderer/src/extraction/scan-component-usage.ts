/**
 * @module @agentforge/designspec-renderer/extraction/scan-component-usage
 *
 * Scans .tsx/.jsx files for import statements from the detected component
 * library. Builds a usage map: component name → file count + file list.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { ComponentLibraryId, ComponentUsage } from './types.js';

/** Named import extractor: import { Button, Card } from "..." */
const NAMED_IMPORT_PATTERN = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;

/** Find all .tsx/.jsx files in a directory tree (skips node_modules, .next). */
function findSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', 'dist', 'build', '.git'].includes(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      results.push(...findSourceFiles(fullPath));
    } else {
      const ext = extname(entry.name);
      if (['.tsx', '.jsx', '.ts', '.js'].includes(ext) && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.test.ts')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/** Check if an import path matches the component library. */
function isLibraryImport(importPath: string, library: ComponentLibraryId): boolean {
  switch (library) {
    case 'shadcn':
      return importPath.includes('/components/ui/') || importPath.startsWith('@/components/ui/');
    case 'mui':
      return importPath.startsWith('@mui/');
    case 'chakra':
      return importPath.startsWith('@chakra-ui/');
    case 'antd':
      return importPath === 'antd' || importPath.startsWith('antd/');
    case 'mantine':
      return importPath.startsWith('@mantine/');
    case 'radix':
      return importPath.startsWith('@radix-ui/');
    default:
      return false;
  }
}

/**
 * Scan source files for component imports from the detected library.
 * Returns a deduplicated list of components with usage counts.
 */
export function scanComponentUsage(
  appRoot: string,
  library: ComponentLibraryId,
): Result<readonly ComponentUsage[]> {
  if (library === 'unknown') {
    return Err({
      code: 'NO_LIBRARY',
      message: 'Cannot scan component usage without a detected component library',
      recoverable: true,
    });
  }

  const srcDir = existsSync(join(appRoot, 'src')) ? join(appRoot, 'src') : appRoot;
  const sourceFiles = findSourceFiles(srcDir);

  if (sourceFiles.length === 0) {
    return Err({
      code: 'NO_SOURCE_FILES',
      message: `No source files found in ${srcDir}`,
    });
  }

  // Map: componentName → Set of files that import it
  const usageMap = new Map<string, { importPath: string; files: Set<string> }>();

  for (const filePath of sourceFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    // Find all named imports
    let match: RegExpExecArray | null;
    const importPattern = new RegExp(NAMED_IMPORT_PATTERN.source, 'g');
    while ((match = importPattern.exec(content)) !== null) {
      const namedImports = match[1];
      const importPath = match[2];

      if (!isLibraryImport(importPath, library)) continue;

      // Parse individual component names from the destructured import
      const components = namedImports
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => {
          // Handle aliased imports: Card as MyCard
          const parts = s.split(/\s+as\s+/);
          return parts[0].trim();
        })
        .filter(s => /^[A-Z]/.test(s)); // Only PascalCase (components, not utils)

      for (const comp of components) {
        const existing = usageMap.get(comp);
        const relPath = relative(appRoot, filePath);
        if (existing) {
          existing.files.add(relPath);
        } else {
          usageMap.set(comp, { importPath, files: new Set([relPath]) });
        }
      }
    }
  }

  const usage: ComponentUsage[] = Array.from(usageMap.entries())
    .map(([componentName, data]) => ({
      componentName,
      importPath: data.importPath,
      fileCount: data.files.size,
      files: Array.from(data.files).sort(),
    }))
    .sort((a, b) => b.fileCount - a.fileCount); // Most-used first

  return Ok(usage);
}
