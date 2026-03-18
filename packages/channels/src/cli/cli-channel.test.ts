import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCliChannel } from './cli-channel.js';
import type { TaskSummary, ApprovalContext, ChannelMessageRef } from '@agentforge/core';

function createMockOutput(): { write(s: string): boolean; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write(s: string): boolean {
      lines.push(s);
      return true;
    },
  };
}

function makeTempDir(): string {
  const dir = join(tmpdir(), `agentforge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const sampleTask: TaskSummary = {
  id: 'task-001',
  name: 'Implement login',
  status: 'awaiting_approval',
  costUsd: 0.0512,
  assignedAgent: 'coder-agent',
};

const sampleContext: ApprovalContext = {
  title: 'Login feature implementation',
  description: 'Adds OAuth2 login flow with Google provider.',
  changes: { files: 5, additions: 120, deletions: 10 },
  prUrl: 'https://github.com/org/repo/pull/42',
};

describe('createCliChannel', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('has correct type, priority, and capabilities', () => {
    const channel = createCliChannel();
    expect(channel.type).toBe('cli');
    expect(channel.priority).toBe(10);
    expect(channel.capabilities).toBe('basic');
    channel.stopPolling();
  });

  it('uses custom priority from config', () => {
    const channel = createCliChannel({ priority: 5 });
    expect(channel.priority).toBe(5);
    channel.stopPolling();
  });

  it('isAvailable returns true', async () => {
    const channel = createCliChannel();
    const available = await channel.isAvailable();
    expect(available).toBe(true);
    channel.stopPolling();
  });

  describe('sendNotification', () => {
    it('prints info notification with blue color', async () => {
      const output = createMockOutput();
      const channel = createCliChannel({ output });

      const result = await channel.sendNotification('Server started', 'info');

      expect(result.ok).toBe(true);
      expect(output.lines[0]).toContain('[INFO]');
      expect(output.lines[0]).toContain('Server started');
      expect(output.lines[0]).toContain('\x1b[34m');
      channel.stopPolling();
    });

    it('prints warning notification with yellow color', async () => {
      const output = createMockOutput();
      const channel = createCliChannel({ output });

      await channel.sendNotification('Disk space low', 'warning');

      expect(output.lines[0]).toContain('[WARNING]');
      expect(output.lines[0]).toContain('\x1b[33m');
      channel.stopPolling();
    });

    it('prints critical notification with bold red color', async () => {
      const output = createMockOutput();
      const channel = createCliChannel({ output });

      await channel.sendNotification('Build failed', 'critical');

      expect(output.lines[0]).toContain('[CRITICAL]');
      expect(output.lines[0]).toContain('\x1b[1;31m');
      channel.stopPolling();
    });

    it('returns a ChannelMessageRef with cli channel and generated id', async () => {
      const output = createMockOutput();
      const channel = createCliChannel({ output });

      const result = await channel.sendNotification('test', 'info');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('cli');
        expect(result.value.messageId).toMatch(/^cli-msg-\d+$/);
        expect(result.value.timestamp).toBeInstanceOf(Date);
      }
      channel.stopPolling();
    });
  });

  describe('requestApproval', () => {
    it('prints approval request details', async () => {
      const output = createMockOutput();
      const channel = createCliChannel({
        output,
        approvalsDir: join(tempDir, 'approvals'),
      });

      const result = await channel.requestApproval(sampleTask, sampleContext);

      expect(result.ok).toBe(true);
      const printed = output.lines.join('');
      expect(printed).toContain('APPROVAL REQUIRED');
      expect(printed).toContain('task-001');
      expect(printed).toContain('Implement login');
      expect(printed).toContain('Login feature implementation');
      channel.stopPolling();
    });

    it('polls for approval file and fires callback', async () => {
      const approvalsDir = join(tempDir, 'approvals');
      const output = createMockOutput();
      const channel = createCliChannel({
        output,
        approvalsDir,
        pollIntervalMs: 50,
      });

      const decisions: Array<{ taskId: string; decision: string; feedback?: string }> = [];
      channel.onDecision((taskId, decision, feedback) => {
        decisions.push({ taskId, decision, feedback });
      });

      await channel.requestApproval(sampleTask, sampleContext);

      // Write an approval file
      writeFileSync(
        join(approvalsDir, 'task-001.json'),
        JSON.stringify({ decision: 'approved', feedback: 'Looks good!' }),
      );

      // Wait for polling to pick it up
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      expect(decisions.length).toBe(1);
      expect(decisions[0].taskId).toBe('task-001');
      expect(decisions[0].decision).toBe('approved');
      expect(decisions[0].feedback).toBe('Looks good!');

      // File should be deleted after processing
      expect(existsSync(join(approvalsDir, 'task-001.json'))).toBe(false);

      channel.stopPolling();
    });
  });

  describe('onDecision', () => {
    it('multiple callbacks all fire on decision', async () => {
      const approvalsDir = join(tempDir, 'approvals');
      mkdirSync(approvalsDir, { recursive: true });
      const output = createMockOutput();
      const channel = createCliChannel({
        output,
        approvalsDir,
        pollIntervalMs: 50,
      });

      const results1: string[] = [];
      const results2: string[] = [];
      channel.onDecision((taskId) => results1.push(taskId));
      channel.onDecision((taskId) => results2.push(taskId));

      await channel.requestApproval(sampleTask, sampleContext);

      writeFileSync(
        join(approvalsDir, 'task-002.json'),
        JSON.stringify({ decision: 'rejected' }),
      );

      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      expect(results1).toContain('task-002');
      expect(results2).toContain('task-002');

      channel.stopPolling();
    });
  });

  describe('updateStatus', () => {
    it('prints status update to output', async () => {
      const output = createMockOutput();
      const channel = createCliChannel({ output });

      const ref: ChannelMessageRef = {
        channel: 'cli',
        messageId: 'task-xyz',
        timestamp: new Date(),
      };

      const result = await channel.updateStatus(ref, 'completed');

      expect(result.ok).toBe(true);
      expect(output.lines[0]).toContain('[STATUS UPDATE]');
      expect(output.lines[0]).toContain('task-xyz');
      expect(output.lines[0]).toContain('completed');
      channel.stopPolling();
    });
  });

  describe('stopPolling', () => {
    it('clears all intervals', async () => {
      const approvalsDir = join(tempDir, 'approvals');
      const output = createMockOutput();
      const channel = createCliChannel({
        output,
        approvalsDir,
        pollIntervalMs: 50,
      });

      // Start polling by requesting approval
      await channel.requestApproval(sampleTask, sampleContext);
      await channel.requestApproval(sampleTask, sampleContext);

      channel.stopPolling();

      // Write a file after stopping — callback should NOT fire
      const decisions: string[] = [];
      channel.onDecision((taskId) => decisions.push(taskId));

      writeFileSync(
        join(approvalsDir, 'task-stop.json'),
        JSON.stringify({ decision: 'approved' }),
      );

      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      expect(decisions.length).toBe(0);
    });
  });
});
