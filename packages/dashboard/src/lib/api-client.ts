/**
 * REST API client for the AgentForge dashboard.
 * Covers all 10 endpoints defined in PRD Section 28.
 */

import type { Result, AgentForgeError, TaskStatus } from '@agentforge/core';
import { Err } from '@agentforge/core';

const NOT_IMPLEMENTED_ERROR: AgentForgeError = {
  code: 'INVALID_STATE',
  message: 'API client not implemented',
  recoverable: false,
};

/** API client for dashboard REST endpoints (PRD Section 28) */
export interface ApiClient {
  /** GET /api/projects — list all projects */
  listProjects(): Promise<Result<unknown[]>>;

  /** GET /api/projects/:id — get project details */
  getProject(id: string): Promise<Result<unknown>>;

  /** GET /api/projects/:id/phases — get phase summaries */
  getPhases(projectId: string): Promise<Result<unknown[]>>;

  /** GET /api/projects/:id/tasks — get tasks for a project */
  getTasks(projectId: string): Promise<Result<unknown[]>>;

  /** PATCH /api/tasks/:id — update task status */
  updateTask(taskId: string, status: TaskStatus): Promise<Result<unknown>>;

  /** GET /api/agents — list active agents */
  listAgents(): Promise<Result<unknown[]>>;

  /** GET /api/agents/:id/trace — get agent execution trace */
  getAgentTrace(agentId: string): Promise<Result<unknown>>;

  /** GET /api/approvals — list pending HITL approvals */
  listApprovals(): Promise<Result<unknown[]>>;

  /** POST /api/approvals/:id — submit approval decision */
  submitApproval(approvalId: string, decision: 'approve' | 'reject', reason?: string): Promise<Result<unknown>>;

  /** GET /api/costs — get cost summary */
  getCosts(): Promise<Result<unknown>>;
}

/** Create an ApiClient instance. TODO: implement fetch-based transport */
export function createApiClient(_baseUrl: string): ApiClient {
  // TODO: implement real HTTP client
  const notImplemented = async () => Err(NOT_IMPLEMENTED_ERROR);

  return {
    listProjects: notImplemented,
    getProject: notImplemented,
    getPhases: notImplemented,
    getTasks: notImplemented,
    updateTask: notImplemented,
    listAgents: notImplemented,
    getAgentTrace: notImplemented,
    listApprovals: notImplemented,
    submitApproval: notImplemented,
    getCosts: notImplemented,
  };
}
