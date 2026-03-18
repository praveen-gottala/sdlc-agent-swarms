import { specWriterWork, SPEC_WRITER_CONTRACT } from './spec-writer.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const LLM_OUTPUT = `### components
\`\`\`yaml
name: UserProfile
props:
  - name: userId
    type: string
\`\`\`

### api
\`\`\`yaml
endpoints:
  - method: GET
    path: /api/users
\`\`\`

### adrs
\`\`\`yaml
title: "ADR: Use REST over GraphQL"
status: proposed
decided_by: "agent:spec_writer"
\`\`\``;

const makeProvider = (): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: LLM_OUTPUT })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.01,
    confidence: 'medium' as const,
  }),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_001',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('version: "1.0"\ntasks: []')),
    writeFile: jest.fn().mockReturnValue(Ok(undefined)),
    writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
    exists: jest.fn().mockReturnValue(true),
    mkdir: jest.fn().mockReturnValue(Ok(undefined)),
    rename: jest.fn().mockReturnValue(Ok(undefined)),
    remove: jest.fn().mockReturnValue(Ok(undefined)),
    listDir: jest.fn().mockReturnValue(Ok([])),
    appendFile: jest.fn().mockReturnValue(Ok(undefined)),
  },
  mcpClient: {
    callTool: jest.fn().mockResolvedValue(Ok({ code: '<div>Design</div>' })),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

// ============================================================================
// Tests
// ============================================================================

describe('specWriterWork', () => {
  it('writes correct spec files from LLM output', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    const result = await specWriterWork(
      { designRef: 'designs/v1', specRef: 'specs/' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filesWritten).toEqual(
        expect.arrayContaining([
          expect.stringContaining('components.yaml'),
          expect.stringContaining('api.yaml'),
        ]),
      );
    }
  });

  it('produces ADRs with status proposed and decided_by agent:spec_writer', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    const result = await specWriterWork(
      { designRef: 'designs/v1', specRef: 'specs/' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.adrsProposed.length).toBeGreaterThan(0);
    }

    // Verify writeYaml was called with ADR data containing correct fields
    const writeFileCalls = (ctx.fs.writeFileAtomic as jest.Mock).mock.calls;
    const projectWrite = writeFileCalls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('project.yaml'),
    );
    expect(projectWrite).toBeDefined();
    const writtenContent = projectWrite![1] as string;
    expect(writtenContent).toContain('proposed');
    expect(writtenContent).toContain('agent:spec_writer');
  });

  it('calls MCP client for design context when figma IDs present', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    await specWriterWork(
      { designRef: 'designs/v1', specRef: 'specs/', figmaFileId: 'file123', figmaNodeId: 'node456' },
      provider,
      [],
      ctx,
    );

    expect(ctx.mcpClient.callTool).toHaveBeenCalledWith('figma', 'get_code', {
      fileId: 'file123',
      nodeId: 'node456',
    });
  });

  it('emits lock acquire/release events per file', async () => {
    const ctx = makeContext();
    const provider = makeProvider();

    await specWriterWork(
      { designRef: 'designs/v1', specRef: 'specs/' },
      provider,
      [],
      ctx,
    );

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const lockAcquired = publishCalls.filter(
      (call: unknown[]) => (call[0] as { type: string }).type === 'SpecLockAcquired',
    );
    const lockReleased = publishCalls.filter(
      (call: unknown[]) => (call[0] as { type: string }).type === 'SpecLockReleased',
    );
    // At least one file was written (components or api)
    expect(lockAcquired.length).toBeGreaterThan(0);
    expect(lockReleased.length).toBe(lockAcquired.length);
  });
});

describe('SPEC_WRITER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(SPEC_WRITER_CONTRACT.role).toBe('spec_writer');
    expect(SPEC_WRITER_CONTRACT.category).toBe('spec');
  });

  it('uses review_and_override HITL policy', () => {
    expect(SPEC_WRITER_CONTRACT.hitl_policy).toBe('review_and_override');
  });

  it('has required permissions', () => {
    expect(SPEC_WRITER_CONTRACT.permissions).toContain('read_spec');
    expect(SPEC_WRITER_CONTRACT.permissions).toContain('write_spec');
    expect(SPEC_WRITER_CONTRACT.permissions).toContain('read_design');
  });
});
