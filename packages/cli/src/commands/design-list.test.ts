/**
 * @module @agentforge/cli/commands/design-list.test
 *
 * Tests for the design:list command.
 * Uses real filesystem (mkdtempSync) per CLAUDE.md rules.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { designListCommand } from './design-list.js';

/** Capture output written to a writable stream. */
function createCapture(): { stream: NodeJS.WritableStream; text: () => string } {
  const chunks: string[] = [];
  const stream = {
    write(chunk: string | Buffer): boolean {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  return { stream, text: () => chunks.join('') };
}

describe('designListCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'design-list-test-'));
  });

  it('shows warning when no previews directory exists', async () => {
    const { stream, text } = createCapture();
    await designListCommand(stream, { projectRoot: tmpDir });
    expect(text()).toContain('No designs found');
  });

  it('shows warning when previews directory is empty', async () => {
    mkdirSync(join(tmpDir, 'agentforge', 'designs'), { recursive: true });
    const { stream, text } = createCapture();
    await designListCommand(stream, { projectRoot: tmpDir });
    expect(text()).toContain('No designs found');
  });

  it('lists a module with all three stages complete (figma)', async () => {
    const previewsDir = join(tmpDir, 'agentforge', 'designs', 'cost-dashboard');
    mkdirSync(previewsDir, { recursive: true });

    // Stage 1: research
    writeFileSync(
      join(previewsDir, 'research-brief.json'),
      JSON.stringify({ briefId: 'test', designConstraints: [], requirementIds: [], accessibilityRequirements: [] }),
    );

    // Stage 2: planning
    writeFileSync(
      join(previewsDir, 'planning-spec.json'),
      JSON.stringify({ componentTree: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }),
    );

    // Stage 3: design
    writeFileSync(
      join(previewsDir, 'figma-design.json'),
      JSON.stringify({
        figmaFileId: 'abc123',
        figmaPageId: 'page1',
        figmaNodeIds: { A: '1:1', B: '1:2', C: '1:3' },
        moduleId: 'cost-dashboard',
        breakpoints: ['desktop', 'mobile'],
      }),
    );

    const { stream, text } = createCapture();
    await designListCommand(stream, { projectRoot: tmpDir });

    const output = text();
    expect(output).toContain('cost-dashboard');
    expect(output).toContain('figma');
    expect(output).toContain('3/3');
    expect(output).toContain('3'); // component count
  });

  it('lists a module with partial stages (penpot, planning only)', async () => {
    const previewsDir = join(tmpDir, 'agentforge', 'designs', 'bookshelf');
    mkdirSync(previewsDir, { recursive: true });

    writeFileSync(
      join(previewsDir, 'research-brief.json'),
      JSON.stringify({ briefId: 'test', designConstraints: [] }),
    );

    writeFileSync(
      join(previewsDir, 'planning-spec.json'),
      JSON.stringify({ componentTree: [{ name: 'X' }, { name: 'Y' }] }),
    );

    const { stream, text } = createCapture();
    await designListCommand(stream, { projectRoot: tmpDir });

    const output = text();
    expect(output).toContain('bookshelf');
    expect(output).toContain('2/3');
    // No design tool detected
  });

  it('lists multiple modules', async () => {
    const previews = join(tmpDir, 'agentforge', 'designs');

    const dirA = join(previews, 'module-a');
    mkdirSync(dirA, { recursive: true });
    writeFileSync(join(dirA, 'research-brief.json'), '{}');

    const dirB = join(previews, 'module-b');
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirB, 'research-brief.json'), '{}');
    writeFileSync(join(dirB, 'planning-spec.json'), '{"componentTree":[]}');

    const { stream, text } = createCapture();
    await designListCommand(stream, { projectRoot: tmpDir });

    const output = text();
    expect(output).toContain('module-a');
    expect(output).toContain('module-b');
    expect(output).toContain('Found 2 design(s)');
  });

  it('detects penpot designs', async () => {
    const previewsDir = join(tmpDir, 'agentforge', 'designs', 'penpot-mod');
    mkdirSync(previewsDir, { recursive: true });

    writeFileSync(join(previewsDir, 'research-brief.json'), '{}');
    writeFileSync(join(previewsDir, 'planning-spec.json'), '{"componentTree":[]}');
    writeFileSync(
      join(previewsDir, 'penpot-design.json'),
      JSON.stringify({
        penpotProjectId: 'proj1',
        penpotPageId: 'page1',
        penpotNodeIds: { Shape1: 'uuid-1', Shape2: 'uuid-2' },
        moduleId: 'penpot-mod',
        breakpoints: [],
      }),
    );

    const { stream, text } = createCapture();
    await designListCommand(stream, { projectRoot: tmpDir });

    const output = text();
    expect(output).toContain('penpot-mod');
    expect(output).toContain('penpot');
    expect(output).toContain('3/3');
  });
});
