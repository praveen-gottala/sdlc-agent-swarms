import { handlePageRequest } from './page-request-handler.js';
import type { EventBus, FileSystem } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import { stringify } from 'yaml';

// ============================================================================
// Helpers
// ============================================================================

const makeEventBus = (): EventBus => ({
  publish: jest.fn(),
  emit: jest.fn(),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
  clear: jest.fn(),
  history: jest.fn().mockReturnValue([]),
});

const makeFs = (): FileSystem => ({
  readFile: jest.fn().mockImplementation((path: string) => {
    if (path.includes('pages.yaml')) {
      return Ok(stringify({ pages: [] }));
    }
    if (path.includes('agentforge.tasks.yaml')) {
      return Ok(stringify({ tasks: [] }));
    }
    return Ok('');
  }),
  writeFile: jest.fn().mockReturnValue(Ok(undefined)),
  writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
  exists: jest.fn().mockReturnValue(true),
  mkdir: jest.fn().mockReturnValue(Ok(undefined)),
  rename: jest.fn().mockReturnValue(Ok(undefined)),
  remove: jest.fn().mockReturnValue(Ok(undefined)),
  listDir: jest.fn().mockReturnValue(Ok([])),
  appendFile: jest.fn().mockReturnValue(Ok(undefined)),
});

// ============================================================================
// Tests
// ============================================================================

describe('handlePageRequest', () => {
  it('creates a page entry and returns pageId and taskId', () => {
    const eventBus = makeEventBus();
    const fs = makeFs();

    const result = handlePageRequest(
      { description: 'User profile dashboard', projectRoot: '/tmp/project' },
      eventBus,
      fs,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pageId).toMatch(/^page_/);
      expect(result.value.taskId).toMatch(/^task_design_/);
    }
  });

  it('writes to pages.yaml', () => {
    const eventBus = makeEventBus();
    const fs = makeFs();

    handlePageRequest(
      { description: 'Landing page', projectRoot: '/tmp/project' },
      eventBus,
      fs,
    );

    const writeFileCalls = (fs.writeFileAtomic as jest.Mock).mock.calls;
    const pagesWrite = writeFileCalls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('pages.yaml'),
    );
    expect(pagesWrite).toBeDefined();
    const content = pagesWrite![1] as string;
    expect(content).toContain('Landing page');
    expect(content).toContain('requested');
  });

  it('creates a task in agentforge.tasks.yaml', () => {
    const eventBus = makeEventBus();
    const fs = makeFs();

    handlePageRequest(
      { description: 'Settings page', projectRoot: '/tmp/project' },
      eventBus,
      fs,
    );

    const writeFileCalls = (fs.writeFileAtomic as jest.Mock).mock.calls;
    const tasksWrite = writeFileCalls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('agentforge.tasks.yaml'),
    );
    expect(tasksWrite).toBeDefined();
  });

  it('publishes a PageRequested event', () => {
    const eventBus = makeEventBus();
    const fs = makeFs();

    const result = handlePageRequest(
      { description: 'Dashboard', projectRoot: '/tmp/project' },
      eventBus,
      fs,
    );

    expect(result.ok).toBe(true);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PageRequested',
        description: 'Dashboard',
      }),
    );
  });

  it('uses provided pageId when given', () => {
    const eventBus = makeEventBus();
    const fs = makeFs();

    const result = handlePageRequest(
      { description: 'Test page', projectRoot: '/tmp/project', pageId: 'custom-page-id' },
      eventBus,
      fs,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.pageId).toBe('custom-page-id');
    }
  });
});
