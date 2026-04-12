import { PassThrough } from 'node:stream';
import { runDesignFeedbackLoop } from './design-feedback-loop.js';
import type { FeedbackLoopOptions, ReviewCallback, ImplementCallback } from './design-feedback-loop.js';
import type { DesignCollaborationSession } from './design-collaboration.js';
import type { UXDesignOutput } from '../types.js';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const makeDesign = (overrides?: Partial<UXDesignOutput>): UXDesignOutput => ({
  penpotProjectId: 'proj-test',
  penpotPageId: 'page-test',
  penpotNodeIds: { root: '1:1' },
  moduleId: 'test-module',
  breakpoints: ['desktop'],
  ...overrides,
});

const makeSession = (overrides?: Partial<DesignCollaborationSession>): DesignCollaborationSession => ({
  startWatching: jest.fn(),
  stopWatching: jest.fn(),
  applyFeedback: jest.fn().mockResolvedValue(Ok(makeDesign())),
  getChangeHistory: jest.fn().mockReturnValue([]),
  ...overrides,
});

/** Create a TTY-like PassThrough stream. */
const createTTYInput = (): PassThrough & { isTTY: boolean } => {
  const stream = new PassThrough() as PassThrough & { isTTY: boolean };
  stream.isTTY = true;
  return stream;
};

const makeOptions = (
  input: NodeJS.ReadableStream,
  session?: DesignCollaborationSession,
  design?: UXDesignOutput,
): FeedbackLoopOptions => ({
  session: session ?? makeSession(),
  initialDesign: design ?? makeDesign(),
  input,
  output: new PassThrough(),
  designTool: 'Figma',
});

// ============================================================================
// Tests
// ============================================================================

describe('runDesignFeedbackLoop', () => {
  it('returns approved=true when user types "approve"', async () => {
    const input = createTTYInput();
    const opts = makeOptions(input);

    const promise = runDesignFeedbackLoop(opts);
    // Give readline time to initialize
    await new Promise((r) => setTimeout(r, 50));
    input.write('approve\n');

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(result.changeCount).toBe(0);
  });

  it('returns approved=true when user types "y"', async () => {
    const input = createTTYInput();
    const opts = makeOptions(input);

    const promise = runDesignFeedbackLoop(opts);
    await new Promise((r) => setTimeout(r, 50));
    input.write('y\n');

    const result = await promise;
    expect(result.approved).toBe(true);
  });

  it('returns approved=false when user types "quit"', async () => {
    const input = createTTYInput();
    const opts = makeOptions(input);

    const promise = runDesignFeedbackLoop(opts);
    await new Promise((r) => setTimeout(r, 50));
    input.write('quit\n');

    const result = await promise;
    expect(result.approved).toBe(false);
  });

  it('returns approved=false when user types "q"', async () => {
    const input = createTTYInput();
    const opts = makeOptions(input);

    const promise = runDesignFeedbackLoop(opts);
    await new Promise((r) => setTimeout(r, 50));
    input.write('q\n');

    const result = await promise;
    expect(result.approved).toBe(false);
  });

  it('calls session.applyFeedback on arbitrary text', async () => {
    const input = createTTYInput();
    const updatedDesign = makeDesign({ penpotNodeIds: { root: '1:1', card: '2:2' } });
    const session = makeSession({
      applyFeedback: jest.fn().mockResolvedValue(Ok(updatedDesign)),
    });
    const opts = makeOptions(input, session);

    const promise = runDesignFeedbackLoop(opts);
    await new Promise((r) => setTimeout(r, 50));
    input.write('make the header blue\n');
    await new Promise((r) => setTimeout(r, 50));
    input.write('approve\n');

    const result = await promise;
    expect(session.applyFeedback).toHaveBeenCalledWith('make the header blue');
    expect(result.approved).toBe(true);
    expect(result.changeCount).toBe(1);
    expect(result.finalDesign).toEqual(updatedDesign);
  });

  it('handles feedback errors gracefully and continues', async () => {
    const input = createTTYInput();
    const session = makeSession({
      applyFeedback: jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'API down', recoverable: true }),
      ),
    });
    const opts = makeOptions(input, session);

    const promise = runDesignFeedbackLoop(opts);
    await new Promise((r) => setTimeout(r, 50));
    input.write('bad feedback\n');
    await new Promise((r) => setTimeout(r, 50));
    input.write('approve\n');

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(result.changeCount).toBe(0); // failed feedback doesn't count
  });

  it('auto-approves on non-TTY input', async () => {
    const input = new PassThrough(); // no isTTY
    const opts = makeOptions(input);

    const result = await runDesignFeedbackLoop(opts);
    expect(result.approved).toBe(true);
    expect(result.changeCount).toBe(0);
  });

  it('returns approved=false on EOF (stream end)', async () => {
    const input = createTTYInput();
    const opts = makeOptions(input);

    const promise = runDesignFeedbackLoop(opts);
    await new Promise((r) => setTimeout(r, 50));
    input.end();

    const result = await promise;
    expect(result.approved).toBe(false);
  });

  describe('review', () => {
    it('runs review on explicit "review" command', async () => {
      const input = createTTYInput();
      const outputStream = new PassThrough();
      const reviewFn: ReviewCallback = jest.fn().mockResolvedValue(
        Ok({ score: 85, overallQuality: 'good', issues: [] }),
      );
      const opts: FeedbackLoopOptions = {
        ...makeOptions(input),
        output: outputStream,
        reviewFn,
      };

      const promise = runDesignFeedbackLoop(opts);
      await new Promise((r) => setTimeout(r, 50));
      input.write('review\n');
      await new Promise((r) => setTimeout(r, 50));
      input.write('approve\n');

      const result = await promise;
      expect(reviewFn).toHaveBeenCalledTimes(1);
      expect(result.approved).toBe(true);
    });

    it('runs auto-review after successful feedback', async () => {
      const input = createTTYInput();
      const outputStream = new PassThrough();
      const updatedDesign = makeDesign({ penpotNodeIds: { root: '1:1', card: '2:2' } });
      const session = makeSession({
        applyFeedback: jest.fn().mockResolvedValue(Ok(updatedDesign)),
      });
      const reviewFn: ReviewCallback = jest.fn().mockResolvedValue(
        Ok({ score: 72, overallQuality: 'needs_fixes', issues: [
          { severity: 'major', component: 'Header', description: 'Missing bg', fix: 'Add fill' },
        ] }),
      );
      const opts: FeedbackLoopOptions = {
        session,
        initialDesign: makeDesign(),
        input,
        output: outputStream,
        reviewFn,
        designTool: 'Figma',
      };

      const promise = runDesignFeedbackLoop(opts);
      await new Promise((r) => setTimeout(r, 50));
      input.write('make header blue\n');
      await new Promise((r) => setTimeout(r, 100));
      input.write('approve\n');

      const result = await promise;
      expect(reviewFn).toHaveBeenCalledTimes(1); // auto-review after feedback
      expect(result.changeCount).toBe(1);
    });

    it('does not auto-review after failed feedback', async () => {
      const input = createTTYInput();
      const session = makeSession({
        applyFeedback: jest.fn().mockResolvedValue(
          Err({ code: 'LLM_API_ERROR', message: 'fail', recoverable: true }),
        ),
      });
      const reviewFn: ReviewCallback = jest.fn().mockResolvedValue(
        Ok({ score: 90, overallQuality: 'good', issues: [] }),
      );
      const opts: FeedbackLoopOptions = {
        session,
        initialDesign: makeDesign(),
        input,
        output: new PassThrough(),
        reviewFn,
        designTool: 'Figma',
      };

      const promise = runDesignFeedbackLoop(opts);
      await new Promise((r) => setTimeout(r, 50));
      input.write('bad feedback\n');
      await new Promise((r) => setTimeout(r, 50));
      input.write('approve\n');

      await promise;
      expect(reviewFn).not.toHaveBeenCalled(); // no review on failure
    });

    it('shows unavailable message when reviewFn not provided', async () => {
      const input = createTTYInput();
      const outputStream = new PassThrough();
      let outputText = '';
      outputStream.on('data', (chunk: Buffer) => { outputText += chunk.toString(); });

      const opts: FeedbackLoopOptions = {
        ...makeOptions(input),
        output: outputStream,
        // no reviewFn
      };

      const promise = runDesignFeedbackLoop(opts);
      await new Promise((r) => setTimeout(r, 50));
      input.write('review\n');
      await new Promise((r) => setTimeout(r, 50));
      input.write('approve\n');

      await promise;
      expect(outputText).toContain('Unavailable');
    });
  });

  describe('implement', () => {
    it('calls implementFn and returns approved=true with implementedFiles', async () => {
      const input = createTTYInput();
      const outputStream = new PassThrough();
      const implementFn: ImplementCallback = jest.fn().mockResolvedValue(
        Ok({
          files: [
            { filePath: 'src/components/Dashboard.tsx', content: '<div/>' },
            { filePath: 'src/components/Dashboard.css', content: '.dashboard {}' },
          ],
          writtenPaths: [
            'packages/dashboard/src/components/dashboard/Dashboard.tsx',
            'packages/dashboard/src/components/dashboard/Dashboard.css',
          ],
        }),
      );
      const opts: FeedbackLoopOptions = {
        ...makeOptions(input),
        output: outputStream,
        implementFn,
      };

      const promise = runDesignFeedbackLoop(opts);
      await new Promise((r) => setTimeout(r, 50));
      input.write('implement\n');

      const result = await promise;
      expect(implementFn).toHaveBeenCalledTimes(1);
      expect(implementFn).toHaveBeenCalledWith(makeDesign());
      expect(result.approved).toBe(true);
      expect(result.implementedFiles).toEqual([
        'packages/dashboard/src/components/dashboard/Dashboard.tsx',
        'packages/dashboard/src/components/dashboard/Dashboard.css',
      ]);
    });

    it('shows unavailable message when implementFn not provided', async () => {
      const input = createTTYInput();
      const outputStream = new PassThrough();
      let outputText = '';
      outputStream.on('data', (chunk: Buffer) => { outputText += chunk.toString(); });

      const opts: FeedbackLoopOptions = {
        ...makeOptions(input),
        output: outputStream,
        // no implementFn
      };

      const promise = runDesignFeedbackLoop(opts);
      await new Promise((r) => setTimeout(r, 50));
      input.write('impl\n');
      await new Promise((r) => setTimeout(r, 50));
      input.write('approve\n');

      await promise;
      expect(outputText).toContain('Unavailable');
      expect(outputText).toContain('implement');
    });

    it('shows error message when implementation fails', async () => {
      const input = createTTYInput();
      const outputStream = new PassThrough();
      let outputText = '';
      outputStream.on('data', (chunk: Buffer) => { outputText += chunk.toString(); });

      const implementFn: ImplementCallback = jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'Code generation failed', recoverable: true }),
      );
      const opts: FeedbackLoopOptions = {
        ...makeOptions(input),
        output: outputStream,
        implementFn,
      };

      const promise = runDesignFeedbackLoop(opts);
      await new Promise((r) => setTimeout(r, 50));
      input.write('implement\n');
      await new Promise((r) => setTimeout(r, 50));
      input.write('approve\n');

      const result = await promise;
      expect(implementFn).toHaveBeenCalledTimes(1);
      expect(outputText).toContain('Failed');
      expect(outputText).toContain('Code generation failed');
      // Should NOT return implementedFiles or auto-approve on failure
      expect(result.approved).toBe(true); // approved via manual 'approve' after failure
      expect(result.implementedFiles).toBeUndefined();
    });
  });
});
