/**
 * @module @agentforge/governance/permission-checker
 *
 * Validates that an agent has the required permission for an action.
 * Checks the agent's `permissions` (allow-list) and `denied` (deny-list).
 * Deny-list takes precedence over allow-list.
 */

import type { AgentContract, AgentForgeError } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { AgentAction, PermissionCheckResult, PermissionDenialReason } from './types.js';

/**
 * Build an AgentForgeError for a permission denial.
 */
const buildDenialError = (
  action: AgentAction,
  reason: PermissionDenialReason,
): AgentForgeError => ({
  code: 'PERMISSION_DENIED',
  message: reason.message,
  context: {
    requiredPermission: reason.requiredPermission,
    explicitlyDenied: reason.explicitlyDenied,
    target: action.target,
  },
  recoverable: false,
  agentId: action.agentId,
  taskId: action.taskId,
});

/**
 * Check whether an agent's contract grants the permission required
 * by the given action.
 *
 * Rules:
 * 1. If `action.type` appears in `agent.denied`, deny (explicitly denied).
 * 2. If `agent.permissions` contains a wildcard (`"*"`), allow.
 * 3. If `action.type` appears in `agent.permissions`, allow.
 * 4. Otherwise, deny (not granted).
 *
 * @param agent - The agent contract containing permissions and denied lists
 * @param action - The action being attempted
 * @returns Ok(void) if permitted, Err(AgentForgeError) with PERMISSION_DENIED if not
 */
export const checkPermission = (
  agent: AgentContract,
  action: AgentAction,
): PermissionCheckResult => {
  // 1. Deny-list takes precedence
  if (agent.denied.includes(action.type)) {
    const reason: PermissionDenialReason = {
      requiredPermission: action.type,
      explicitlyDenied: true,
      message: `Agent "${agent.role}" is explicitly denied permission "${action.type}"`,
    };
    return Err(buildDenialError(action, reason));
  }

  // 2. Wildcard grant
  if (agent.permissions.includes('*')) {
    return Ok(undefined);
  }

  // 3. Explicit grant
  if (agent.permissions.includes(action.type)) {
    return Ok(undefined);
  }

  // 4. Not granted
  const reason: PermissionDenialReason = {
    requiredPermission: action.type,
    explicitlyDenied: false,
    message: `Agent "${agent.role}" does not have permission "${action.type}"`,
  };
  return Err(buildDenialError(action, reason));
};
