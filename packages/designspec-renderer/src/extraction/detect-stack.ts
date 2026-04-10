/**
 * @module @agentforge/designspec-renderer/extraction/detect-stack
 *
 * Reads package.json to detect framework, component library, styling
 * approach, and TypeScript usage. Zero LLM cost — pure pattern matching.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { DetectedStack, Framework, ComponentLibraryId, StylingApproach } from './types.js';

interface PackageJson {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

/** Read and parse package.json from the given root directory. */
function readPackageJson(appRoot: string): Result<PackageJson> {
  const pkgPath = join(appRoot, 'package.json');
  if (!existsSync(pkgPath)) {
    return Err({ code: 'FILE_NOT_FOUND', message: `No package.json found at ${pkgPath}` });
  }
  try {
    const raw = readFileSync(pkgPath, 'utf-8');
    return Ok(JSON.parse(raw) as PackageJson);
  } catch (e) {
    return Err({ code: 'PARSE_ERROR', message: `Failed to parse package.json: ${String(e)}` });
  }
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return !!(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

function detectFramework(pkg: PackageJson, appRoot: string): Framework {
  if (hasDep(pkg, 'next')) {
    // Distinguish App Router vs Pages Router
    if (existsSync(join(appRoot, 'src', 'app')) || existsSync(join(appRoot, 'app'))) {
      return 'nextjs-app';
    }
    return 'nextjs-pages';
  }
  if (hasDep(pkg, '@remix-run/react')) return 'remix';
  if (hasDep(pkg, 'vite') || hasDep(pkg, '@vitejs/plugin-react')) return 'vite';
  if (hasDep(pkg, 'react-scripts')) return 'cra';
  return 'unknown';
}

function detectComponentLibrary(pkg: PackageJson, appRoot: string): ComponentLibraryId {
  // shadcn detection: radix primitives + local components/ui directory
  const hasRadix = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    .some(k => k.startsWith('@radix-ui/react-') || k.startsWith('@base-ui/'));
  const hasLocalUi = existsSync(join(appRoot, 'src', 'components', 'ui'))
    || existsSync(join(appRoot, 'components', 'ui'));
  if ((hasRadix || hasDep(pkg, 'shadcn')) && hasLocalUi) return 'shadcn';

  if (hasDep(pkg, '@mui/material')) return 'mui';
  if (hasDep(pkg, '@chakra-ui/react')) return 'chakra';
  if (hasDep(pkg, 'antd')) return 'antd';
  if (hasDep(pkg, '@mantine/core')) return 'mantine';
  if (hasRadix) return 'radix';
  return 'unknown';
}

function detectStyling(pkg: PackageJson, appRoot: string): StylingApproach {
  if (hasDep(pkg, 'tailwindcss')) {
    // Tailwind v4 uses CSS-first config (no tailwind.config.js/ts)
    const hasConfigFile = existsSync(join(appRoot, 'tailwind.config.ts'))
      || existsSync(join(appRoot, 'tailwind.config.js'))
      || existsSync(join(appRoot, 'tailwind.config.mjs'));
    return hasConfigFile ? 'tailwind-v3' : 'tailwind-v4';
  }
  if (hasDep(pkg, 'styled-components') || hasDep(pkg, '@emotion/react')) return 'css-in-js';
  return 'unknown';
}

function detectPackageManager(appRoot: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (existsSync(join(appRoot, 'bun.lockb')) || existsSync(join(appRoot, 'bun.lock'))) return 'bun';
  if (existsSync(join(appRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(appRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Detect the technology stack of a React application from its package.json.
 * Returns framework, component library, styling approach, TS flag, and package manager.
 */
export function detectStack(appRoot: string): Result<DetectedStack> {
  const pkgResult = readPackageJson(appRoot);
  if (!pkgResult.ok) return pkgResult;
  const pkg = pkgResult.value;

  return Ok({
    framework: detectFramework(pkg, appRoot),
    componentLibrary: detectComponentLibrary(pkg, appRoot),
    styling: detectStyling(pkg, appRoot),
    typescript: hasDep(pkg, 'typescript'),
    packageManager: detectPackageManager(appRoot),
  });
}
