import { chunkMarkdown, chunkYaml, chunkDocument } from './doc-chunker.js';

describe('chunkMarkdown', () => {
  it('splits at heading boundaries', () => {
    const content = `# Introduction
Some intro text.

## Setup
Setup instructions here.

### Prerequisites
Need Node.js 20+.

## Usage
How to use.`;

    const chunks = chunkMarkdown('docs/guide.md', content);

    expect(chunks.length).toBe(4);
    expect(chunks[0]!.heading).toBe('Introduction');
    expect(chunks[0]!.headingLevel).toBe(1);
    expect(chunks[1]!.heading).toBe('Setup');
    expect(chunks[1]!.headingLevel).toBe(2);
    expect(chunks[2]!.heading).toBe('Prerequisites');
    expect(chunks[2]!.headingLevel).toBe(3);
    expect(chunks[3]!.heading).toBe('Usage');
  });

  it('handles document with no headings', () => {
    const chunks = chunkMarkdown('notes.md', 'Just some text\nwith no headings.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.heading).toBeUndefined();
  });

  it('all chunks have content hashes', () => {
    const chunks = chunkMarkdown('test.md', '# A\nfoo\n# B\nbar');
    for (const chunk of chunks) {
      expect(chunk.contentHash).toHaveLength(16);
      expect(chunk.docType).toBe('markdown');
    }
  });
});

describe('chunkYaml', () => {
  it('splits at top-level keys', () => {
    const content = `name: MyApp
version: 1.0.0
dependencies:
  - core
  - utils
scripts:
  build: tsc
  test: jest`;

    const chunks = chunkYaml('config.yaml', content);

    expect(chunks.length).toBe(4);
    expect(chunks[0]!.heading).toBe('name');
    expect(chunks[1]!.heading).toBe('version');
    expect(chunks[2]!.heading).toBe('dependencies');
    expect(chunks[2]!.content).toContain('- core');
    expect(chunks[3]!.heading).toBe('scripts');
  });
});

describe('chunkDocument', () => {
  it('auto-detects markdown', () => {
    const result = chunkDocument('guide.md', '# Hello\nworld');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.docType).toBe('markdown');
  });

  it('auto-detects yaml', () => {
    const result = chunkDocument('config.yaml', 'key: value');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.docType).toBe('yaml');
  });

  it('falls back to text for unknown extensions', () => {
    const result = chunkDocument('readme.txt', 'plain text content');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]!.docType).toBe('text');
  });
});
