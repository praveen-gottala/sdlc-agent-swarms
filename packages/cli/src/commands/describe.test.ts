import { describeCommand, generatePRDPreviewHtml } from './describe.js';
import type { FileSystem } from '../fs-utils.js';
import { PassThrough } from 'node:stream';

function createMockFs(): FileSystem & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true as const, value: content };
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    exists(filePath: string) {
      return files.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return { ok: true as const, value: undefined };
    },
    rename() {
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Not implemented', recoverable: false } };
    },
    remove(filePath: string) {
      files.delete(filePath);
      return { ok: true as const, value: undefined };
    },
    listDir() {
      return { ok: true as const, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return { ok: true as const, value: undefined };
    },
  };
}

/** No-op browser config for tests. */
const noOpConfig = { openBrowser: async () => false };

describe('describeCommand', () => {
  it('returns error when agentforge.yaml missing', async () => {
    const fs = createMockFs();
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });
    const input = new PassThrough();

    const origExitCode = process.exitCode;
    await describeCommand('/project', fs, input, output, noOpConfig);

    expect(process.exitCode).toBe(1);
    expect(outputStr).toContain('agentforge init');
    process.exitCode = origExitCode;
  });

  it('detects existing prd.md and asks to replace', async () => {
    const fs = createMockFs();
    fs.files.set('/project/agentforge.yaml', 'version: "1.0"\nproject:\n  name: MyApp');
    fs.files.set('/project/docs/prd.md', '# Existing PRD\n\nSome content here for the PRD document.');
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });

    // Answer 'n' to replace question
    const input = new PassThrough();
    setTimeout(() => input.write('n\n'), 50);

    await describeCommand('/project', fs, input, output, noOpConfig);

    expect(outputStr).toContain('already exists');
    expect(outputStr).toContain('Keeping existing PRD');
  }, 5000);

  it('loads manually placed PRD and shows word count', async () => {
    const fs = createMockFs();
    fs.files.set('/project/agentforge.yaml', 'version: "1.0"\nproject:\n  name: MyApp');
    const prdContent = 'This is a test PRD with some words in it for counting purposes.';
    fs.files.set('/project/docs/prd.md', prdContent);

    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });

    // Answer 'y' to replace existing, then 'y' to has PRD, then Enter to confirm placement
    const input = new PassThrough();
    setTimeout(() => input.write('y\n'), 50);
    setTimeout(() => input.write('y\n'), 150);
    setTimeout(() => input.write('\n'), 250);

    await describeCommand('/project', fs, input, output, noOpConfig);

    expect(outputStr).toContain('PRD loaded');
    expect(outputStr).toContain('words');
  }, 5000);
});

describe('generatePRDPreviewHtml', () => {
  it('generates valid HTML with app name', () => {
    const html = generatePRDPreviewHtml('# My App\n\nA great app.', 'TestApp');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('TestApp');
    expect(html).toContain('PRD Preview');
  });

  it('converts markdown headers to HTML', () => {
    const html = generatePRDPreviewHtml('# Title\n## Section\n### Subsection', 'App');

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<h2>Section</h2>');
    expect(html).toContain('<h3>Subsection</h3>');
  });

  it('converts markdown bold to HTML', () => {
    const html = generatePRDPreviewHtml('This is **bold** text.', 'App');

    expect(html).toContain('<strong>bold</strong>');
  });
});
