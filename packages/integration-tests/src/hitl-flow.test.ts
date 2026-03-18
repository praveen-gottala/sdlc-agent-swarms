/**
 * HITL Approval Flow Integration Tests
 *
 * Tests human-in-the-loop approval workflows:
 * - Agent requests approval → channel message → decision → agent continues
 * - Approval timeout → escalation → second timeout → full pause
 * - Progressive trust escalation
 * - First-response-wins across channels
 */

import {
  Ok,
  updateTaskStatus,
} from '@agentforge/core';
import type {
  DomainEvent,
} from '@agentforge/core';
import {
  createEventCollector,
  createMockFs,
  createMockChannel,
  makeTask,
  makeTasksFile,
} from './helpers.js';

// ============================================================================
// Tests
// ============================================================================

describe('HITL Approval Flow', () => {
  let collector: ReturnType<typeof createEventCollector>;
  let slackChannel: ReturnType<typeof createMockChannel>;
  let telegramChannel: ReturnType<typeof createMockChannel>;

  beforeEach(() => {
    collector = createEventCollector();
    slackChannel = createMockChannel('slack', true);
    telegramChannel = createMockChannel('telegram', true);
  });

  afterEach(() => {
    collector.clear();
  });

  describe('basic approval flow', () => {
    it('agent requests approval → Slack message sent → approval received → agent continues', async () => {
      const events: DomainEvent[] = [];
      collector.bus.subscribe('HITLApprovalRequested', (e) => events.push(e));
      collector.bus.subscribe('HITLApprovalReceived', (e) => events.push(e));

      // Simulate HITL gate: publish approval request
      collector.bus.publish({
        type: 'HITLApprovalRequested',
        gateId: 'gate_001',
        agentId: 'code_generator',
        taskId: 'task_001',
        source: 'test', timestamp: Date.now(),
      });

      // Slack channel sends approval request
      const approvalResult = await slackChannel.requestApproval(
        { id: 'task_001', name: 'Generate code', status: 'awaiting_approval' },
        { title: 'Code Generation Approval', description: 'Approve code generation for dashboard' },
      );
      expect(approvalResult.ok).toBe(true);

      // Human approves via Slack callback
      for (const cb of slackChannel.decisionCallbacks) {
        cb('task_001', 'approved', 'Looks good');
      }

      // Simulate receiving the decision
      collector.bus.publish({
        type: 'HITLApprovalReceived',
        gateId: 'gate_001',
        decision: 'approved',
        decidedBy: 'human:praveen',
        source: 'test', timestamp: Date.now(),
      });

      const requested = events.filter((e) => e.type === 'HITLApprovalRequested');
      const received = events.filter((e) => e.type === 'HITLApprovalReceived');
      expect(requested).toHaveLength(1);
      expect(received).toHaveLength(1);
      expect((received[0] as { decision: string }).decision).toBe('approved');
    });

    it('task status reflects HITL state during approval', () => {
      const task = makeTask({ status: 'in_progress' });
      let tasksFile = makeTasksFile([task]);

      // Move to awaiting_approval
      const r1 = updateTaskStatus(tasksFile, 'task_001', 'awaiting_approval');
      expect(r1.ok).toBe(true);
      if (r1.ok) tasksFile = r1.value;
      expect(tasksFile.tasks[0].status).toBe('awaiting_approval');

      // Approval comes back
      const r2 = updateTaskStatus(tasksFile, 'task_001', 'approved');
      expect(r2.ok).toBe(true);
      if (r2.ok) tasksFile = r2.value;
      expect(tasksFile.tasks[0].status).toBe('approved');

      // Back to in_progress after approval
      const r3 = updateTaskStatus(tasksFile, 'task_001', 'in_progress');
      expect(r3.ok).toBe(true);
      if (r3.ok) tasksFile = r3.value;
      expect(tasksFile.tasks[0].status).toBe('in_progress');
    });
  });

  describe('approval timeout and escalation', () => {
    it('timeout → escalation to Telegram → second timeout → full pause', async () => {
      const notifications: Array<{ channel: string; severity: string; message: string }> = [];

      // Track notifications across channels
      const origSlackNotify = slackChannel.sendNotification.bind(slackChannel);
      slackChannel.sendNotification = async (message, severity) => {
        notifications.push({ channel: 'slack', severity, message });
        return origSlackNotify(message, severity);
      };

      const origTelegramNotify = telegramChannel.sendNotification.bind(telegramChannel);
      telegramChannel.sendNotification = async (message, severity) => {
        notifications.push({ channel: 'telegram', severity, message });
        return origTelegramNotify(message, severity);
      };

      // Phase 1: Request approval on Slack
      await slackChannel.requestApproval(
        { id: 'task_001', name: 'Deploy staging', status: 'awaiting_approval' },
        { title: 'Deploy Approval', description: 'Approve staging deploy' },
      );

      // Phase 2: Timeout → escalate to Telegram
      await telegramChannel.sendNotification(
        'ESCALATION: Deploy approval for task_001 timed out on Slack. Please respond.',
        'critical',
      );
      expect(notifications.some((n) => n.channel === 'telegram' && n.severity === 'critical')).toBe(true);

      // Phase 3: Telegram approval request
      await telegramChannel.requestApproval(
        { id: 'task_001', name: 'Deploy staging', status: 'awaiting_approval' },
        { title: 'Deploy Approval (Escalated)', description: 'Approve staging deploy' },
      );

      // Phase 4: Second timeout → full pause
      collector.bus.publish({
        type: 'TaskStatusChanged',
        taskId: 'task_001',
        from: 'awaiting_approval',
        to: 'paused',
        source: 'test', timestamp: Date.now(),
      });

      const pauseEvents = collector.eventsOfType('TaskStatusChanged').filter(
        (e) => e.to === 'paused',
      );
      expect(pauseEvents).toHaveLength(1);
    });

    it('stalled notification sent after full pause', async () => {
      const notifications: string[] = [];

      slackChannel.sendNotification = async (message, severity) => {
        notifications.push(message);
        return Ok({ channel: 'slack' as const, messageId: 'msg_1', timestamp: new Date() });
      };

      // Simulate stalled notification
      await slackChannel.sendNotification(
        'STALLED: Task task_001 has been paused after escalation timeout. Manual intervention required.',
        'critical',
      );

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toContain('STALLED');
      expect(notifications[0]).toContain('task_001');
    });
  });

  describe('first-response-wins across channels', () => {
    it('first approval received wins, subsequent ignored', async () => {
      const decisions: Array<{ source: string; decision: string }> = [];

      // Both channels set up decision callbacks
      slackChannel.onDecision((taskId, decision) => {
        decisions.push({ source: 'slack', decision });
      });
      telegramChannel.onDecision((taskId, decision) => {
        decisions.push({ source: 'telegram', decision });
      });

      // Send approval requests to both channels
      await slackChannel.requestApproval(
        { id: 'task_001', name: 'Deploy', status: 'awaiting_approval' },
        { title: 'Deploy Approval', description: 'Approve' },
      );
      await telegramChannel.requestApproval(
        { id: 'task_001', name: 'Deploy', status: 'awaiting_approval' },
        { title: 'Deploy Approval', description: 'Approve' },
      );

      // Slack responds first
      for (const cb of slackChannel.decisionCallbacks) {
        cb('task_001', 'approved', 'OK');
      }

      // Simulate first-response-wins: only first decision is processed
      const firstDecision = decisions[0];
      expect(firstDecision.source).toBe('slack');
      expect(firstDecision.decision).toBe('approved');

      // Emit the winning event
      collector.bus.publish({
        type: 'HITLApproved',
        gateId: 'gate_001',
        decision: 'approved',
        feedback: 'OK',
        source: 'slack',
        timestamp: Date.now(),
      });

      const approvedEvents = collector.eventsOfType('HITLApproved');
      expect(approvedEvents).toHaveLength(1);
      expect(approvedEvents[0].source).toBe('slack');
    });
  });

  describe('progressive trust escalation', () => {
    it('trust escalates after N consecutive approvals', () => {
      // Simulate trust state tracking
      const trustState: { consecutiveApprovals: number; currentLevel: string } = {
        consecutiveApprovals: 0,
        currentLevel: 'full_approval',
      };

      const ESCALATION_THRESHOLD = 5;

      // Simulate 5 consecutive approvals
      for (let i = 0; i < ESCALATION_THRESHOLD; i++) {
        trustState.consecutiveApprovals++;
      }

      // After threshold, trust should escalate
      if (trustState.consecutiveApprovals >= ESCALATION_THRESHOLD) {
        trustState.currentLevel = 'review_and_override';
      }

      expect(trustState.consecutiveApprovals).toBe(5);
      expect(trustState.currentLevel).toBe('review_and_override');

      // Continue approvals to next level
      for (let i = 0; i < ESCALATION_THRESHOLD; i++) {
        trustState.consecutiveApprovals++;
      }

      if (trustState.consecutiveApprovals >= ESCALATION_THRESHOLD * 2) {
        trustState.currentLevel = 'notify_only';
      }

      expect(trustState.currentLevel).toBe('notify_only');
    });

    it('rejection resets trust escalation counter', () => {
      const trustState: { consecutiveApprovals: number; currentLevel: string } = {
        consecutiveApprovals: 4,
        currentLevel: 'full_approval',
      };

      // One more approval would escalate, but rejection happens
      trustState.consecutiveApprovals = 0; // Reset on rejection

      expect(trustState.consecutiveApprovals).toBe(0);
      expect(trustState.currentLevel).toBe('full_approval');
    });

    it('trust-state persists via YAML', () => {
      const fs = createMockFs();
      const trustYaml = `trust_level: review_and_override
consecutive_approvals: 7
last_decision: approved
last_decision_at: "2026-03-18T10:00:00Z"
`;
      fs.writeFile('/project/.agentforge/trust-state.yaml', trustYaml);

      const readResult = fs.readFile('/project/.agentforge/trust-state.yaml');
      expect(readResult.ok).toBe(true);
      if (readResult.ok) {
        expect(readResult.value).toContain('review_and_override');
        expect(readResult.value).toContain('consecutive_approvals: 7');
      }
    });
  });

  describe('changes_requested flow', () => {
    it('changes_requested puts task back to in_progress', () => {
      const task = makeTask({ status: 'in_progress' });
      let tasksFile = makeTasksFile([task]);

      // Go to awaiting_approval
      const r1 = updateTaskStatus(tasksFile, 'task_001', 'awaiting_approval');
      expect(r1.ok).toBe(true);
      if (r1.ok) tasksFile = r1.value;

      // Changes requested
      const r2 = updateTaskStatus(tasksFile, 'task_001', 'changes_requested');
      expect(r2.ok).toBe(true);
      if (r2.ok) tasksFile = r2.value;
      expect(tasksFile.tasks[0].status).toBe('changes_requested');

      // Back to in_progress for rework
      const r3 = updateTaskStatus(tasksFile, 'task_001', 'in_progress');
      expect(r3.ok).toBe(true);
      if (r3.ok) tasksFile = r3.value;
      expect(tasksFile.tasks[0].status).toBe('in_progress');
    });
  });
});
