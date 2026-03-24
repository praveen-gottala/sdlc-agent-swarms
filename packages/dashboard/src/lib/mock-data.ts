/**
 * Mock data for dashboard development.
 * Models a React + Node + Prisma full-stack project.
 */

import type { TaskStatus } from '@agentforge/core';

// ─── Pipeline Phases ────────────────────────────────────────────────

/** Status of a pipeline phase */
export type PhaseStatus = 'completed' | 'active' | 'pending' | 'failed';

/** A phase in the SDLC pipeline */
export interface MockPhase {
  readonly id: string;
  readonly name: string;
  readonly status: PhaseStatus;
  readonly progress: number;
  readonly taskCount: number;
  readonly completedTasks: number;
  readonly costUsd: number;
  readonly budgetUsd: number;
  readonly elapsedMinutes: number;
}

export const MOCK_PHASES: readonly MockPhase[] = [
  {
    id: 'phase-design',
    name: 'Design',
    status: 'completed',
    progress: 100,
    taskCount: 4,
    completedTasks: 4,
    costUsd: 3.45,
    budgetUsd: 5.0,
    elapsedMinutes: 18,
  },
  {
    id: 'phase-spec',
    name: 'Specification',
    status: 'completed',
    progress: 100,
    taskCount: 3,
    completedTasks: 3,
    costUsd: 2.10,
    budgetUsd: 4.0,
    elapsedMinutes: 12,
  },
  {
    id: 'phase-implementation',
    name: 'Implementation',
    status: 'active',
    progress: 60,
    taskCount: 5,
    completedTasks: 3,
    costUsd: 4.80,
    budgetUsd: 10.0,
    elapsedMinutes: 35,
  },
  {
    id: 'phase-testing',
    name: 'Testing',
    status: 'pending',
    progress: 0,
    taskCount: 2,
    completedTasks: 0,
    costUsd: 0,
    budgetUsd: 3.0,
    elapsedMinutes: 0,
  },
  {
    id: 'phase-deployment',
    name: 'Deployment',
    status: 'pending',
    progress: 0,
    taskCount: 1,
    completedTasks: 0,
    costUsd: 0,
    budgetUsd: 2.0,
    elapsedMinutes: 0,
  },
] as const;

// ─── Tasks ──────────────────────────────────────────────────────────

/** A task displayed in the task board or list */
export interface MockTask {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly assignedAgent: string | null;
  readonly phaseId: string;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
  readonly costUsd: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const MOCK_TASKS: readonly MockTask[] = [
  // Design phase (completed)
  {
    id: 'task-001',
    name: 'UX research: user flows',
    description: 'Research and document primary user flows for the application',
    status: 'completed',
    assignedAgent: 'ux-researcher',
    phaseId: 'phase-design',
    priority: 'high',
    costUsd: 0.85,
    createdAt: '2026-03-22T08:00:00Z',
    updatedAt: '2026-03-22T08:12:00Z',
  },
  {
    id: 'task-002',
    name: 'Wireframe: Dashboard layout',
    description: 'Create wireframe for the main dashboard page with navigation',
    status: 'completed',
    assignedAgent: 'ux-designer',
    phaseId: 'phase-design',
    priority: 'high',
    costUsd: 1.20,
    createdAt: '2026-03-22T08:15:00Z',
    updatedAt: '2026-03-22T08:25:00Z',
  },
  {
    id: 'task-003',
    name: 'Wireframe: User management pages',
    description: 'Create wireframes for user list, profile, and settings pages',
    status: 'completed',
    assignedAgent: 'ux-designer',
    phaseId: 'phase-design',
    priority: 'medium',
    costUsd: 0.95,
    createdAt: '2026-03-22T08:25:00Z',
    updatedAt: '2026-03-22T08:35:00Z',
  },
  {
    id: 'task-004',
    name: 'Design review: all wireframes',
    description: 'Review all wireframes for accessibility and consistency',
    status: 'completed',
    assignedAgent: 'ux-reviewer',
    phaseId: 'phase-design',
    priority: 'medium',
    costUsd: 0.45,
    createdAt: '2026-03-22T08:35:00Z',
    updatedAt: '2026-03-22T08:40:00Z',
  },
  // Specification phase (completed)
  {
    id: 'task-005',
    name: 'Define Prisma schema',
    description: 'Create Prisma schema with User, Post, and Comment models',
    status: 'completed',
    assignedAgent: 'spec-writer',
    phaseId: 'phase-spec',
    priority: 'critical',
    costUsd: 0.90,
    createdAt: '2026-03-22T08:45:00Z',
    updatedAt: '2026-03-22T08:55:00Z',
  },
  {
    id: 'task-006',
    name: 'Define REST API endpoints',
    description: 'Specify all REST endpoints for users, posts, and auth',
    status: 'completed',
    assignedAgent: 'api-designer',
    phaseId: 'phase-spec',
    priority: 'high',
    costUsd: 0.75,
    createdAt: '2026-03-22T08:55:00Z',
    updatedAt: '2026-03-22T09:05:00Z',
  },
  {
    id: 'task-007',
    name: 'Define React component tree',
    description: 'Specify component hierarchy and props for all pages',
    status: 'completed',
    assignedAgent: 'spec-writer',
    phaseId: 'phase-spec',
    priority: 'high',
    costUsd: 0.45,
    createdAt: '2026-03-22T09:05:00Z',
    updatedAt: '2026-03-22T09:10:00Z',
  },
  // Implementation phase (active)
  {
    id: 'task-008',
    name: 'Implement auth endpoints',
    description: 'Build login, register, and JWT refresh endpoints with Prisma',
    status: 'completed',
    assignedAgent: 'backend-coder',
    phaseId: 'phase-implementation',
    priority: 'critical',
    costUsd: 1.80,
    createdAt: '2026-03-22T09:15:00Z',
    updatedAt: '2026-03-22T09:35:00Z',
  },
  {
    id: 'task-009',
    name: 'Implement user CRUD API',
    description: 'Build user list, create, update, delete endpoints',
    status: 'completed',
    assignedAgent: 'backend-coder',
    phaseId: 'phase-implementation',
    priority: 'high',
    costUsd: 1.50,
    createdAt: '2026-03-22T09:35:00Z',
    updatedAt: '2026-03-22T09:50:00Z',
  },
  {
    id: 'task-010',
    name: 'Implement post CRUD API',
    description: 'Build post list, create, update, delete endpoints with pagination',
    status: 'completed',
    assignedAgent: 'backend-coder',
    phaseId: 'phase-implementation',
    priority: 'high',
    costUsd: 1.50,
    createdAt: '2026-03-22T09:50:00Z',
    updatedAt: '2026-03-22T10:05:00Z',
  },
  {
    id: 'task-011',
    name: 'Build UserProfile React component',
    description: 'Create UserProfile page with avatar, bio, and edit form',
    status: 'in_progress',
    assignedAgent: 'frontend-coder',
    phaseId: 'phase-implementation',
    priority: 'medium',
    costUsd: 0.60,
    createdAt: '2026-03-22T10:05:00Z',
    updatedAt: '2026-03-22T10:15:00Z',
  },
  {
    id: 'task-012',
    name: 'Build PostFeed React component',
    description: 'Create infinite-scroll post feed with comment threads',
    status: 'awaiting_approval',
    assignedAgent: 'frontend-coder',
    phaseId: 'phase-implementation',
    priority: 'medium',
    costUsd: 0.40,
    createdAt: '2026-03-22T10:10:00Z',
    updatedAt: '2026-03-22T10:20:00Z',
  },
  // Testing phase (pending)
  {
    id: 'task-013',
    name: 'Write integration tests for auth',
    description: 'Jest + Supertest integration tests for all auth endpoints',
    status: 'pending',
    assignedAgent: null,
    phaseId: 'phase-testing',
    priority: 'high',
    costUsd: 0,
    createdAt: '2026-03-22T10:00:00Z',
    updatedAt: '2026-03-22T10:00:00Z',
  },
  {
    id: 'task-014',
    name: 'Write React component tests',
    description: 'React Testing Library tests for all page components',
    status: 'pending',
    assignedAgent: null,
    phaseId: 'phase-testing',
    priority: 'medium',
    costUsd: 0,
    createdAt: '2026-03-22T10:00:00Z',
    updatedAt: '2026-03-22T10:00:00Z',
  },
  // Deployment phase (pending)
  {
    id: 'task-015',
    name: 'Deploy to staging',
    description: 'Build Docker images and deploy to staging environment',
    status: 'pending',
    assignedAgent: null,
    phaseId: 'phase-deployment',
    priority: 'high',
    costUsd: 0,
    createdAt: '2026-03-22T10:00:00Z',
    updatedAt: '2026-03-22T10:00:00Z',
  },
] as const;

// ─── Agents ─────────────────────────────────────────────────────────

/** State of an agent in the system */
export type AgentState = 'idle' | 'running' | 'waiting' | 'errored' | 'completed';

/** An agent displayed in the agent panel */
export interface MockAgent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly state: AgentState;
  readonly currentTaskId: string | null;
  readonly completedTaskCount: number;
  readonly totalCostUsd: number;
  readonly trustLevel: 'low' | 'medium' | 'high';
  readonly lastActiveAt: string;
}

export const MOCK_AGENTS: readonly MockAgent[] = [
  {
    id: 'backend-coder',
    name: 'Backend Coder',
    role: 'Implements Node.js/Express endpoints and Prisma queries',
    state: 'idle',
    currentTaskId: null,
    completedTaskCount: 3,
    totalCostUsd: 4.80,
    trustLevel: 'high',
    lastActiveAt: '2026-03-22T10:05:00Z',
  },
  {
    id: 'frontend-coder',
    name: 'Frontend Coder',
    role: 'Implements React components with TypeScript and Tailwind',
    state: 'running',
    currentTaskId: 'task-011',
    completedTaskCount: 1,
    totalCostUsd: 1.00,
    trustLevel: 'medium',
    lastActiveAt: '2026-03-22T10:15:00Z',
  },
  {
    id: 'spec-writer',
    name: 'Spec Writer',
    role: 'Generates Prisma schemas, API specs, and component trees',
    state: 'completed',
    currentTaskId: null,
    completedTaskCount: 2,
    totalCostUsd: 1.35,
    trustLevel: 'high',
    lastActiveAt: '2026-03-22T09:10:00Z',
  },
  {
    id: 'ux-designer',
    name: 'UX Designer',
    role: 'Creates wireframes and visual designs in Figma',
    state: 'completed',
    currentTaskId: null,
    completedTaskCount: 2,
    totalCostUsd: 2.15,
    trustLevel: 'medium',
    lastActiveAt: '2026-03-22T08:35:00Z',
  },
  {
    id: 'test-writer',
    name: 'Test Writer',
    role: 'Writes Jest tests, integration tests, and E2E specs',
    state: 'waiting',
    currentTaskId: null,
    completedTaskCount: 0,
    totalCostUsd: 0,
    trustLevel: 'low',
    lastActiveAt: '2026-03-22T08:00:00Z',
  },
] as const;

// ─── Approvals ──────────────────────────────────────────────────────

/** A pending HITL approval */
export interface MockApproval {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly agentId: string;
  readonly taskId: string;
  readonly requestedAt: string;
  readonly changes: {
    readonly files: number;
    readonly additions: number;
    readonly deletions: number;
  };
  readonly costUsd: number;
  readonly priority: 'low' | 'medium' | 'high' | 'critical';
}

export const MOCK_APPROVALS: readonly MockApproval[] = [
  {
    id: 'approval-001',
    title: 'Prisma schema migration',
    description: 'Adds User, Post, and Comment models with relations and indexes',
    agentId: 'backend-coder',
    taskId: 'task-005',
    requestedAt: '2026-03-22T09:00:00Z',
    changes: { files: 2, additions: 85, deletions: 0 },
    costUsd: 0.90,
    priority: 'critical',
  },
  {
    id: 'approval-002',
    title: 'PostFeed component implementation',
    description: 'Infinite-scroll feed with optimistic updates and comment threading',
    agentId: 'frontend-coder',
    taskId: 'task-012',
    requestedAt: '2026-03-22T10:20:00Z',
    changes: { files: 4, additions: 320, deletions: 12 },
    costUsd: 0.40,
    priority: 'high',
  },
  {
    id: 'approval-003',
    title: 'Auth middleware configuration',
    description: 'JWT verification middleware with refresh token rotation',
    agentId: 'backend-coder',
    taskId: 'task-008',
    requestedAt: '2026-03-22T09:30:00Z',
    changes: { files: 3, additions: 142, deletions: 5 },
    costUsd: 0.55,
    priority: 'high',
  },
  {
    id: 'approval-004',
    title: 'API route definitions',
    description: 'Express router setup for /api/users and /api/posts',
    agentId: 'backend-coder',
    taskId: 'task-009',
    requestedAt: '2026-03-22T09:45:00Z',
    changes: { files: 5, additions: 210, deletions: 0 },
    costUsd: 0.35,
    priority: 'medium',
  },
  {
    id: 'approval-005',
    title: 'Design system tokens update',
    description: 'Updated color palette and spacing scale based on wireframe review',
    agentId: 'ux-designer',
    taskId: 'task-004',
    requestedAt: '2026-03-22T08:38:00Z',
    changes: { files: 1, additions: 28, deletions: 15 },
    costUsd: 0.10,
    priority: 'low',
  },
] as const;

// ─── Audit Log ──────────────────────────────────────────────────────

/** A single audit log entry */
export interface MockAuditEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly action: string;
  readonly actor: string;
  readonly target: string;
  readonly details: string;
  readonly severity: 'info' | 'warning' | 'error';
}

export const MOCK_AUDIT_LOG: readonly MockAuditEntry[] = [
  {
    id: 'audit-001',
    timestamp: '2026-03-22T10:15:00Z',
    action: 'agent.started',
    actor: 'orchestrator',
    target: 'frontend-coder',
    details: 'Agent started working on task-011 (Build UserProfile React component)',
    severity: 'info',
  },
  {
    id: 'audit-002',
    timestamp: '2026-03-22T10:05:00Z',
    action: 'task.status_changed',
    actor: 'backend-coder',
    target: 'task-010',
    details: 'Task "Implement post CRUD API" moved from in_progress to completed',
    severity: 'info',
  },
  {
    id: 'audit-003',
    timestamp: '2026-03-22T09:50:00Z',
    action: 'budget.alert',
    actor: 'governance',
    target: 'phase-implementation',
    details: 'Implementation phase at 48% of budget ($4.80 / $10.00)',
    severity: 'warning',
  },
  {
    id: 'audit-004',
    timestamp: '2026-03-22T09:35:00Z',
    action: 'approval.requested',
    actor: 'backend-coder',
    target: 'approval-003',
    details: 'Approval requested for auth middleware configuration',
    severity: 'info',
  },
  {
    id: 'audit-005',
    timestamp: '2026-03-22T09:10:00Z',
    action: 'trust.escalated',
    actor: 'governance',
    target: 'backend-coder',
    details: 'Trust level escalated from medium to high after 5 consecutive approvals',
    severity: 'info',
  },
  {
    id: 'audit-006',
    timestamp: '2026-03-22T09:00:00Z',
    action: 'phase.completed',
    actor: 'orchestrator',
    target: 'phase-spec',
    details: 'Specification phase completed: 3/3 tasks done, $2.10 spent',
    severity: 'info',
  },
  {
    id: 'audit-007',
    timestamp: '2026-03-22T08:55:00Z',
    action: 'agent.failed',
    actor: 'orchestrator',
    target: 'build-fixer',
    details: 'Build Fixer failed: TS2307 — Cannot find module @prisma/client',
    severity: 'error',
  },
  {
    id: 'audit-008',
    timestamp: '2026-03-22T08:40:00Z',
    action: 'approval.approved',
    actor: 'human:admin',
    target: 'approval-005',
    details: 'Design system tokens update approved with no changes requested',
    severity: 'info',
  },
  {
    id: 'audit-009',
    timestamp: '2026-03-22T08:25:00Z',
    action: 'spec.lock_acquired',
    actor: 'spec-writer',
    target: 'agentforge/spec/api.yaml',
    details: 'Lock acquired on API spec file for endpoint definition',
    severity: 'info',
  },
  {
    id: 'audit-010',
    timestamp: '2026-03-22T08:12:00Z',
    action: 'phase.completed',
    actor: 'orchestrator',
    target: 'phase-design',
    details: 'Design phase completed: 4/4 tasks done, $3.45 spent',
    severity: 'info',
  },
] as const;

// ─── Trust Records ──────────────────────────────────────────────────

/** Agent trust record for governance display */
export interface MockTrustRecord {
  readonly agentId: string;
  readonly agentName: string;
  readonly trustLevel: 'low' | 'medium' | 'high';
  readonly consecutiveApprovals: number;
  readonly totalApprovals: number;
  readonly totalRejections: number;
  readonly lastEscalation: string | null;
  readonly approvalRate: number;
}

export const MOCK_TRUST_RECORDS: readonly MockTrustRecord[] = [
  {
    agentId: 'backend-coder',
    agentName: 'Backend Coder',
    trustLevel: 'high',
    consecutiveApprovals: 5,
    totalApprovals: 8,
    totalRejections: 1,
    lastEscalation: '2026-03-22T09:10:00Z',
    approvalRate: 0.89,
  },
  {
    agentId: 'frontend-coder',
    agentName: 'Frontend Coder',
    trustLevel: 'medium',
    consecutiveApprovals: 2,
    totalApprovals: 3,
    totalRejections: 1,
    lastEscalation: null,
    approvalRate: 0.75,
  },
  {
    agentId: 'spec-writer',
    agentName: 'Spec Writer',
    trustLevel: 'high',
    consecutiveApprovals: 4,
    totalApprovals: 6,
    totalRejections: 0,
    lastEscalation: '2026-03-22T08:50:00Z',
    approvalRate: 1.0,
  },
  {
    agentId: 'ux-designer',
    agentName: 'UX Designer',
    trustLevel: 'medium',
    consecutiveApprovals: 3,
    totalApprovals: 4,
    totalRejections: 1,
    lastEscalation: null,
    approvalRate: 0.80,
  },
  {
    agentId: 'test-writer',
    agentName: 'Test Writer',
    trustLevel: 'low',
    consecutiveApprovals: 0,
    totalApprovals: 0,
    totalRejections: 0,
    lastEscalation: null,
    approvalRate: 0,
  },
] as const;

// ─── Cost Data ──────────────────────────────────────────────────────

/** Cost breakdown by phase */
export interface MockPhaseCost {
  readonly phase: string;
  readonly totalCostUsd: number;
  readonly budgetUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly recordCount: number;
}

/** Cost breakdown by agent */
export interface MockAgentCost {
  readonly agentId: string;
  readonly agentName: string;
  readonly totalCostUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly recordCount: number;
}

/** Aggregate cost summary */
export interface MockCostSummary {
  readonly totalCostUsd: number;
  readonly totalBudgetUsd: number;
  readonly byPhase: readonly MockPhaseCost[];
  readonly byAgent: readonly MockAgentCost[];
}

export const MOCK_COST_SUMMARY: MockCostSummary = {
  totalCostUsd: 10.35,
  totalBudgetUsd: 24.0,
  byPhase: [
    {
      phase: 'Design',
      totalCostUsd: 3.45,
      budgetUsd: 5.0,
      inputTokens: 45_000,
      outputTokens: 12_000,
      recordCount: 8,
    },
    {
      phase: 'Specification',
      totalCostUsd: 2.10,
      budgetUsd: 4.0,
      inputTokens: 28_000,
      outputTokens: 9_500,
      recordCount: 5,
    },
    {
      phase: 'Implementation',
      totalCostUsd: 4.80,
      budgetUsd: 10.0,
      inputTokens: 62_000,
      outputTokens: 24_000,
      recordCount: 12,
    },
    {
      phase: 'Testing',
      totalCostUsd: 0,
      budgetUsd: 3.0,
      inputTokens: 0,
      outputTokens: 0,
      recordCount: 0,
    },
    {
      phase: 'Deployment',
      totalCostUsd: 0,
      budgetUsd: 2.0,
      inputTokens: 0,
      outputTokens: 0,
      recordCount: 0,
    },
  ],
  byAgent: [
    {
      agentId: 'backend-coder',
      agentName: 'Backend Coder',
      totalCostUsd: 4.80,
      inputTokens: 58_000,
      outputTokens: 22_000,
      recordCount: 10,
    },
    {
      agentId: 'ux-designer',
      agentName: 'UX Designer',
      totalCostUsd: 2.15,
      inputTokens: 30_000,
      outputTokens: 8_000,
      recordCount: 5,
    },
    {
      agentId: 'spec-writer',
      agentName: 'Spec Writer',
      totalCostUsd: 1.35,
      inputTokens: 18_000,
      outputTokens: 7_500,
      recordCount: 4,
    },
    {
      agentId: 'frontend-coder',
      agentName: 'Frontend Coder',
      totalCostUsd: 1.00,
      inputTokens: 14_000,
      outputTokens: 5_000,
      recordCount: 3,
    },
    {
      agentId: 'test-writer',
      agentName: 'Test Writer',
      totalCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      recordCount: 0,
    },
  ],
} as const;
