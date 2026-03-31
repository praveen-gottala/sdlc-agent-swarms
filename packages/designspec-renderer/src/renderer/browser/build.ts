/**
 * Ensures the browser app is built. Caches across calls.
 */
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// When imported from dist/, the app directory is under src/ not dist/.
// Detect by checking if the expected app/package.json exists.
const candidateAppDir = path.resolve(currentDir, 'app');
const srcAppDir = path.resolve(currentDir, '..', '..', '..', 'src', 'renderer', 'browser', 'app');
const APP_DIR = existsSync(path.join(candidateAppDir, 'package.json'))
  ? candidateAppDir
  : existsSync(path.join(srcAppDir, 'package.json'))
    ? srcAppDir
    : candidateAppDir; // fallback
const DIST_DIR = path.resolve(APP_DIR, 'dist');

let builtOnce = false;

/**
 * Check for dist/, run `vite build` if missing, return dist path.
 * Caches across calls within the same process.
 */
export async function ensureBrowserAppBuilt(): Promise<string> {
  if (builtOnce && existsSync(path.join(DIST_DIR, 'index.html'))) {
    return DIST_DIR;
  }

  if (!existsSync(path.join(DIST_DIR, 'index.html'))) {
    // Ensure dependencies are installed
    if (!existsSync(path.join(APP_DIR, 'node_modules'))) {
      execSync('npm install', { cwd: APP_DIR, stdio: 'pipe' });
    }
    execSync('npx vite build', { cwd: APP_DIR, stdio: 'pipe' });
  }

  builtOnce = true;
  return DIST_DIR;
}
