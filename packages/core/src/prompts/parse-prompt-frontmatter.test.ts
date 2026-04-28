import { parsePromptFrontmatter } from './parse-prompt-frontmatter.js';

describe('parsePromptFrontmatter', () => {
  it('parses valid frontmatter with version and purpose', () => {
    const raw = '---\nversion: 2.1.0\npurpose: UX planning agent\n---\n# Heading\n\nBody text.';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBe('2.1.0');
    expect(result.frontmatter.purpose).toBe('UX planning agent');
    expect(result.body).toBe('# Heading\n\nBody text.');
  });

  it('returns undefined fields when no frontmatter is present', () => {
    const raw = '# Just markdown\n\nNo frontmatter here.';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBeUndefined();
    expect(result.frontmatter.purpose).toBeUndefined();
    expect(result.body).toBe(raw);
  });

  it('handles version-only frontmatter', () => {
    const raw = '---\nversion: 1.0.0\n---\nBody content';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBe('1.0.0');
    expect(result.frontmatter.purpose).toBeUndefined();
    expect(result.body).toBe('Body content');
  });

  it('handles empty frontmatter block', () => {
    const raw = '---\n---\nBody content';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBeUndefined();
    expect(result.frontmatter.purpose).toBeUndefined();
    expect(result.body).toBe('Body content');
  });

  it('does not match mid-file --- as frontmatter', () => {
    const raw = '# Title\n---\nnot frontmatter\n---\nBody';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBeUndefined();
    expect(result.body).toBe(raw);
  });

  it('preserves body whitespace after frontmatter', () => {
    const raw = '---\nversion: 1.0.0\n---\n\n# H1\n\nParagraph';
    const result = parsePromptFrontmatter(raw);
    expect(result.body).toBe('\n# H1\n\nParagraph');
  });

  it('handles Windows line endings', () => {
    const raw = '---\r\nversion: 1.0.0\r\npurpose: test\r\n---\r\nBody';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBe('1.0.0');
    expect(result.frontmatter.purpose).toBe('test');
    expect(result.body).toBe('Body');
  });

  it('coerces numeric version to string', () => {
    const raw = '---\nversion: 2\n---\nBody';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBe('2');
  });

  it('ignores non-string, non-number version values', () => {
    const raw = '---\nversion:\n  - 1\n  - 2\n---\nBody';
    const result = parsePromptFrontmatter(raw);
    expect(result.frontmatter.version).toBeUndefined();
  });
});
