/**
 * @module @agentforge/cli/commands/setup.test
 *
 * Tests for the `agentforge setup` command.
 */

import { setupCommand } from './setup.js';

jest.mock('../engine-setup.js', () => ({
  checkPrerequisites: jest.fn(),
  setupEngine: jest.fn(),
  isSetupComplete: jest.fn(),
}));

import { checkPrerequisites, setupEngine } from '../engine-setup.js';

const mockCheckPrerequisites = checkPrerequisites as jest.MockedFunction<typeof checkPrerequisites>;
const mockSetupEngine = setupEngine as jest.MockedFunction<typeof setupEngine>;

function createOutput(): { stream: NodeJS.WritableStream; text: () => string } {
  let buf = '';
  const stream = {
    write(chunk: string) {
      buf += chunk;
      return true;
    },
  } as NodeJS.WritableStream;
  return { stream, text: () => buf };
}

describe('setupCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
  });

  it('reports success when already set up', async () => {
    mockCheckPrerequisites.mockReturnValue({
      ready: true,
      checks: [
        { name: 'Python', status: 'pass', message: 'Python 3.12.1' },
        { name: 'pip', status: 'pass', message: 'pip 24.0' },
        { name: 'Engine source', status: 'pass', message: '/repo/services/engine' },
        { name: 'Virtual environment', status: 'pass', message: 'Dependencies installed' },
      ],
      engineDir: '/repo/services/engine',
      venvDir: '/repo/services/engine/.venv',
    });

    const { stream, text } = createOutput();
    await setupCommand('/project', stream);

    expect(text()).toContain('already set up');
    expect(process.exitCode).toBeUndefined();
  });

  it('fails when Python is not available', async () => {
    mockCheckPrerequisites.mockReturnValue({
      ready: false,
      checks: [
        { name: 'Python', status: 'fail', message: 'Not found', fixHint: 'Install Python' },
        { name: 'pip', status: 'fail', message: 'Not available' },
        { name: 'Engine source', status: 'pass', message: '/repo/services/engine' },
        { name: 'Virtual environment', status: 'fail', message: 'Not created' },
      ],
      engineDir: '/repo/services/engine',
      venvDir: '/repo/services/engine/.venv',
    });

    const { stream, text } = createOutput();
    await setupCommand('/project', stream);

    expect(text()).toContain('Python 3.10+');
    expect(process.exitCode).toBe(1);
  });

  it('fails when engine source is missing', async () => {
    mockCheckPrerequisites.mockReturnValue({
      ready: false,
      checks: [
        { name: 'Python', status: 'pass', message: 'Python 3.12.1' },
        { name: 'pip', status: 'pass', message: 'pip 24.0' },
        { name: 'Engine source', status: 'fail', message: 'Not found' },
        { name: 'Virtual environment', status: 'fail', message: 'Not created' },
      ],
      engineDir: '/repo/services/engine',
      venvDir: '/repo/services/engine/.venv',
    });

    const { stream, text } = createOutput();
    await setupCommand('/project', stream);

    expect(text()).toContain('Engine source not found');
    expect(process.exitCode).toBe(1);
  });

  it('runs setup and reports success', async () => {
    mockCheckPrerequisites.mockReturnValue({
      ready: false,
      checks: [
        { name: 'Python', status: 'pass', message: 'Python 3.12.1' },
        { name: 'pip', status: 'pass', message: 'pip 24.0' },
        { name: 'Engine source', status: 'pass', message: '/repo/services/engine' },
        { name: 'Virtual environment', status: 'fail', message: 'Not created' },
      ],
      engineDir: '/repo/services/engine',
      venvDir: '/repo/services/engine/.venv',
    });

    mockSetupEngine.mockResolvedValue({
      ok: true,
      value: { engineDir: '/repo/services/engine', venvDir: '/repo/services/engine/.venv' },
    });

    const { stream, text } = createOutput();
    await setupCommand('/project', stream);

    expect(text()).toContain('setup complete');
    expect(mockSetupEngine).toHaveBeenCalledWith('/project', expect.any(Function));
    expect(process.exitCode).toBeUndefined();
  });

  it('reports setup failure', async () => {
    mockCheckPrerequisites.mockReturnValue({
      ready: false,
      checks: [
        { name: 'Python', status: 'pass', message: 'Python 3.12.1' },
        { name: 'pip', status: 'pass', message: 'pip 24.0' },
        { name: 'Engine source', status: 'pass', message: '/repo/services/engine' },
        { name: 'Virtual environment', status: 'fail', message: 'Not created' },
      ],
      engineDir: '/repo/services/engine',
      venvDir: '/repo/services/engine/.venv',
    });

    mockSetupEngine.mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_STATE' as const, message: 'pip install failed', recoverable: true },
    });

    const { stream, text } = createOutput();
    await setupCommand('/project', stream);

    expect(text()).toContain('Setup failed');
    expect(text()).toContain('pip install failed');
    expect(process.exitCode).toBe(1);
  });
});
