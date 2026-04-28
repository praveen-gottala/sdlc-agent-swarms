import { checkVersionBump } from './check-version-bump.js';

describe('checkVersionBump', () => {
  it('returns ok when content changed and version bumped', () => {
    const old = '---\nversion: 1.0.0\n---\n# Old prompt';
    const newer = '---\nversion: 1.1.0\n---\n# Updated prompt';
    const result = checkVersionBump('test.md', old, newer);
    expect(result.status).toBe('ok');
    expect(result.message).toBe('1.0.0 → 1.1.0');
  });

  it('returns fail when content changed but version NOT bumped', () => {
    const old = '---\nversion: 1.0.0\n---\n# Old prompt';
    const newer = '---\nversion: 1.0.0\n---\n# Updated prompt';
    const result = checkVersionBump('test.md', old, newer);
    expect(result.status).toBe('fail');
    expect(result.message).toContain('content changed but version is still 1.0.0');
  });

  it('returns ok when content is unchanged', () => {
    const content = '---\nversion: 1.0.0\n---\n# Same prompt';
    const result = checkVersionBump('test.md', content, content);
    expect(result.status).toBe('ok');
    expect(result.message).toBe('content unchanged');
  });

  it('returns ok for new files (no old content)', () => {
    const newer = '---\nversion: 1.0.0\n---\n# New prompt';
    const result = checkVersionBump('test.md', null, newer);
    expect(result.status).toBe('ok');
    expect(result.message).toBe('new file');
  });

  it('returns warn for files without frontmatter', () => {
    const old = '# Old prompt';
    const newer = '# Updated prompt';
    const result = checkVersionBump('test.md', old, newer);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('no frontmatter version');
  });

  it('returns ok when only frontmatter purpose changed (body same)', () => {
    const old = '---\nversion: 1.0.0\npurpose: old\n---\n# Prompt body';
    const newer = '---\nversion: 1.0.0\npurpose: updated\n---\n# Prompt body';
    const result = checkVersionBump('test.md', old, newer);
    expect(result.status).toBe('ok');
    expect(result.message).toBe('content unchanged');
  });
});
