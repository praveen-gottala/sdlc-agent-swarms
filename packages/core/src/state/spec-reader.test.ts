import { stringify as stringifyYaml } from 'yaml';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { FileSystem } from '../fs/file-system.js';
import { readSpecs, readSpecFile } from './spec-reader.js';

/**
 * Create an in-memory FileSystem backed by a Map for testing.
 */
function createMockFs(files: Record<string, string> = {}): FileSystem {
  const store = new Map<string, string>(Object.entries(files));

  return {
    readFile(filePath: string): Result<string> {
      const content = store.get(filePath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `File not found: ${filePath}`, recoverable: false });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string): Result<void> {
      store.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string): boolean {
      // Check exact match or if it's a "directory" (prefix of stored keys)
      if (store.has(filePath)) return true;
      const dirPrefix = filePath.endsWith('/') ? filePath : filePath + '/';
      for (const key of store.keys()) {
        if (key.startsWith(dirPrefix)) return true;
      }
      return false;
    },
    mkdir(_dirPath: string): Result<void> {
      return Ok(undefined);
    },
    rename(oldPath: string, newPath: string): Result<void> {
      const content = store.get(oldPath);
      if (content === undefined) {
        return Err({ code: 'INVALID_STATE' as const, message: `File not found: ${oldPath}`, recoverable: false });
      }
      store.set(newPath, content);
      store.delete(oldPath);
      return Ok(undefined);
    },
    remove(filePath: string): Result<void> {
      store.delete(filePath);
      return Ok(undefined);
    },
    listDir(dirPath: string): Result<readonly string[]> {
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const entries = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const firstSegment = rest.split('/')[0];
          entries.add(firstSegment);
        }
      }
      return Ok([...entries]);
    },
    appendFile(filePath: string, content: string): Result<void> {
      const existing = store.get(filePath) ?? '';
      store.set(filePath, existing + content);
      return Ok(undefined);
    },
  };
}

describe('spec-reader', () => {
  const specDir = '/project/specs';

  describe('readSpecs', () => {
    it('returns all spec files when present', () => {
      const fs = createMockFs({
        [`${specDir}/project.yaml`]: stringifyYaml({ name: 'my-app' }),
        [`${specDir}/pages.yaml`]: stringifyYaml({ pages: ['home', 'about'] }),
        [`${specDir}/api.yaml`]: stringifyYaml({ endpoints: ['/users'] }),
        [`${specDir}/models.yaml`]: stringifyYaml({ models: ['User'] }),
      });

      const result = readSpecs(specDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.project).toEqual({ name: 'my-app' });
        expect(result.value.pages).toEqual({ pages: ['home', 'about'] });
        expect(result.value.api).toEqual({ endpoints: ['/users'] });
        expect(result.value.models).toEqual({ models: ['User'] });
        expect(result.value.components).toEqual({});
      }
    });

    it('returns undefined for missing individual files (not errors)', () => {
      const fs = createMockFs({
        [`${specDir}/project.yaml`]: stringifyYaml({ name: 'my-app' }),
      });

      const result = readSpecs(specDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.project).toEqual({ name: 'my-app' });
        expect(result.value.pages).toBeUndefined();
        expect(result.value.api).toBeUndefined();
        expect(result.value.models).toBeUndefined();
      }
    });

    it('returns error when spec directory does not exist', () => {
      const fs = createMockFs({});

      const result = readSpecs('/nonexistent', fs);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
        expect(result.error.message).toContain('Spec directory not found');
      }
    });

    it('reads component files from components/ subdirectory', () => {
      const fs = createMockFs({
        [`${specDir}/project.yaml`]: stringifyYaml({ name: 'my-app' }),
        [`${specDir}/components/header.yaml`]: stringifyYaml({ type: 'header', slots: ['logo', 'nav'] }),
        [`${specDir}/components/footer.yaml`]: stringifyYaml({ type: 'footer', slots: ['links'] }),
      });

      const result = readSpecs(specDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.components).toEqual({
          header: { type: 'header', slots: ['logo', 'nav'] },
          footer: { type: 'footer', slots: ['links'] },
        });
      }
    });

    it('handles empty components directory', () => {
      // No component files, just a project file
      const fs = createMockFs({
        [`${specDir}/project.yaml`]: stringifyYaml({ name: 'my-app' }),
      });

      const result = readSpecs(specDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.components).toEqual({});
      }
    });
  });

  describe('pages.yaml format validation', () => {
    it('parses a well-formed pages.yaml with viewports', () => {
      const pagesYaml = {
        version: '1.0',
        pages: [
          {
            id: 'home',
            name: 'Home',
            description: 'Landing page',
            route: '/',
            status: 'approved',
            components: ['HeroSection', 'BookGrid'],
            data_sources: ['Book'],
            viewports: [1440, 768],
          },
        ],
      };
      const fs = createMockFs({
        [`${specDir}/pages.yaml`]: stringifyYaml(pagesYaml),
      });

      const result = readSpecs(specDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pages).toBeDefined();
        const pages = result.value.pages!;
        expect(pages.version).toBe('1.0');
        expect(pages.pages).toHaveLength(1);
        expect(pages.pages[0].id).toBe('home');
        expect(pages.pages[0].name).toBe('Home');
        expect(pages.pages[0].description).toBe('Landing page');
        expect(pages.pages[0].route).toBe('/');
        expect(pages.pages[0].status).toBe('approved');
        expect(pages.pages[0].components).toEqual(['HeroSection', 'BookGrid']);
        expect(pages.pages[0].viewports).toEqual([1440, 768]);
      }
    });

    it('parses pages.yaml without viewports (field is optional)', () => {
      const pagesYaml = {
        version: '1.0',
        pages: [
          {
            id: 'settings',
            name: 'Settings',
            description: 'User settings page',
            route: '/settings',
            status: 'approved',
            components: ['SettingsForm'],
          },
        ],
      };
      const fs = createMockFs({
        [`${specDir}/pages.yaml`]: stringifyYaml(pagesYaml),
      });

      const result = readSpecs(specDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const page = result.value.pages!.pages[0];
        expect(page.viewports).toBeUndefined();
        expect(page.id).toBe('settings');
      }
    });

    it('preserves all required fields on page entries', () => {
      const pagesYaml = {
        version: '1.0',
        pages: [
          {
            id: 'dashboard',
            name: 'Dashboard',
            description: 'Main dashboard view',
            route: '/dashboard',
            status: 'draft',
            components: ['Chart', 'Table'],
            data_sources: ['Analytics'],
            viewports: [1440],
          },
          {
            id: 'profile',
            name: 'Profile',
            description: 'User profile',
            route: '/profile',
            status: 'approved',
            components: ['Avatar', 'Bio'],
          },
        ],
      };
      const fs = createMockFs({
        [`${specDir}/pages.yaml`]: stringifyYaml(pagesYaml),
      });

      const result = readSpecs(specDir, fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const pages = result.value.pages!.pages;
        expect(pages).toHaveLength(2);
        for (const page of pages) {
          expect(page.id).toBeTruthy();
          expect(page.name).toBeTruthy();
          expect(page.description).toBeTruthy();
          expect(page.route).toBeTruthy();
          expect(page.status).toBeTruthy();
          expect(Array.isArray(page.components)).toBe(true);
        }
        expect(pages[0].viewports).toEqual([1440]);
        expect(pages[1].viewports).toBeUndefined();
      }
    });
  });

  describe('readSpecFile', () => {
    it('reads a single spec file', () => {
      const fs = createMockFs({
        [`${specDir}/project.yaml`]: stringifyYaml({ name: 'my-app', version: '1.0' }),
      });

      const result = readSpecFile(specDir, 'project', fs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ name: 'my-app', version: '1.0' });
      }
    });

    it('returns error for missing file', () => {
      const fs = createMockFs({});

      const result = readSpecFile(specDir, 'nonexistent', fs);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_STATE');
      }
    });
  });
});
