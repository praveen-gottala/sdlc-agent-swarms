/**
 * @module @agentforge/designspec-renderer/extraction/discover-routes
 *
 * Discovers page routes from a React application's file system.
 * Supports Next.js App Router, Next.js Pages Router, and falls back
 * to scanning for common routing patterns.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { Framework, RouteInfo } from './types.js';

/** Recursively find files matching a predicate. */
function findFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden dirs, node_modules, and special Next.js dirs
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...findFiles(fullPath, predicate));
    } else if (predicate(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Convert a file path segment to a route segment. */
function segmentToRoute(segment: string): string {
  // Next.js dynamic routes: [id] → :id, [...slug] → *slug
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return `*${segment.slice(4, -1)}`;
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment;
}

/** Convert a kebab-case or camelCase string to a readable name. */
function toReadableName(s: string): string {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Home';
}

/** Discover routes from Next.js App Router (app/ directory with page.tsx files). */
function discoverAppRouterRoutes(appRoot: string): RouteInfo[] {
  const appDir = existsSync(join(appRoot, 'src', 'app'))
    ? join(appRoot, 'src', 'app')
    : join(appRoot, 'app');

  if (!existsSync(appDir)) return [];

  const pageFiles = findFiles(appDir, name =>
    /^page\.(tsx?|jsx?)$/.test(name)
  );

  return pageFiles.map(filePath => {
    const relDir = relative(appDir, dirname(filePath));
    const segments = relDir
      .split('/')
      .filter(s => s && !s.startsWith('('));  // Strip route groups like (dashboard)

    const route = '/' + segments.map(segmentToRoute).join('/');
    const id = segments.length === 0
      ? 'home'
      : segments.filter(s => !s.startsWith('[')).join('-') || 'home';
    const name = segments.length === 0
      ? 'Home'
      : toReadableName(segments[segments.length - 1]);

    return { id, route, filePath: relative(appRoot, filePath), name };
  });
}

/** Discover routes from Next.js Pages Router (pages/ directory). */
function discoverPagesRouterRoutes(appRoot: string): RouteInfo[] {
  const pagesDir = existsSync(join(appRoot, 'src', 'pages'))
    ? join(appRoot, 'src', 'pages')
    : join(appRoot, 'pages');

  if (!existsSync(pagesDir)) return [];

  const pageFiles = findFiles(pagesDir, name =>
    /\.(tsx?|jsx?)$/.test(name) && !name.startsWith('_')
  );

  return pageFiles.map(filePath => {
    const relPath = relative(pagesDir, filePath);
    const withoutExt = relPath.replace(/\.(tsx?|jsx?)$/, '');
    const segments = withoutExt.split('/');

    // index files map to the parent route
    if (segments[segments.length - 1] === 'index') segments.pop();

    const route = '/' + segments.map(segmentToRoute).join('/');
    const id = segments.length === 0 ? 'home' : segments.join('-');
    const name = segments.length === 0
      ? 'Home'
      : toReadableName(segments[segments.length - 1]);

    return { id, route, filePath: relative(appRoot, filePath), name };
  });
}

/**
 * Discover page routes from a React application's file system.
 * Uses the detected framework to determine the routing convention.
 */
export function discoverRoutes(appRoot: string, framework: Framework): Result<readonly RouteInfo[]> {
  let routes: RouteInfo[];

  switch (framework) {
    case 'nextjs-app':
      routes = discoverAppRouterRoutes(appRoot);
      break;
    case 'nextjs-pages':
      routes = discoverPagesRouterRoutes(appRoot);
      break;
    default:
      // For Vite/CRA/Remix, try App Router pattern first, then Pages Router
      routes = discoverAppRouterRoutes(appRoot);
      if (routes.length === 0) {
        routes = discoverPagesRouterRoutes(appRoot);
      }
      break;
  }

  if (routes.length === 0) {
    return Err({
      code: 'NO_ROUTES',
      message: `No page routes found in ${appRoot}. Expected app/**/page.tsx or pages/**/*.tsx`,
      recoverable: true,
    });
  }

  // Sort by route for deterministic output
  routes.sort((a, b) => a.route.localeCompare(b.route));
  return Ok(routes);
}
