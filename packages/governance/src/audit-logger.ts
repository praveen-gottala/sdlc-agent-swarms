/**
 * @module @agentforge/governance/audit-logger
 *
 * Records immutable audit trail entries for all agent actions.
 * Stores entries in memory and optionally appends JSON lines to a file.
 * Fire-and-forget — audit recording never throws or blocks execution.
 */

import type { AuditEntry, AuditFilter } from './types.js';

/**
 * Minimal file system interface for audit log persistence.
 * Avoids hard dependency on core's FileSystem module.
 */
interface AppendableFs {
  /** Append content to a file. */
  appendFile(filePath: string, content: string): { ok: boolean };
  /** Check if a path exists. */
  exists(filePath: string): boolean;
  /** Create a directory (recursively). */
  mkdir(dirPath: string): { ok: boolean };
}

/**
 * Interface for recording and querying audit trail entries.
 */
export interface AuditLogger {
  /** Record an audit entry. Fire-and-forget — never throws. */
  recordAudit(entry: AuditEntry): void;
  /** Query audit entries with filters. */
  queryAudit(filter: AuditFilter): AuditEntry[];
}

/**
 * Create an audit logger that stores entries in memory and optionally persists to file.
 *
 * @param fs - Optional file system for persisting audit entries as JSON lines
 * @param auditFilePath - Path to the audit log file (required if fs is provided)
 * @returns An AuditLogger instance
 */
export const createAuditLogger = (
  fs?: AppendableFs,
  auditFilePath?: string,
): AuditLogger => {
  const entries: AuditEntry[] = [];

  return {
    recordAudit(entry: AuditEntry): void {
      try {
        entries.push(entry);

        if (fs && auditFilePath) {
          try {
            const dir = auditFilePath.substring(0, auditFilePath.lastIndexOf('/'));
            if (dir && !fs.exists(dir)) {
              fs.mkdir(dir);
            }
            fs.appendFile(auditFilePath, JSON.stringify(entry) + '\n');
          } catch {
            // Fire-and-forget: silently ignore file write errors
          }
        }
      } catch {
        // Fire-and-forget: never throw from audit recording
      }
    },

    queryAudit(filter: AuditFilter): AuditEntry[] {
      let result = entries;

      if (filter.agentId !== undefined) {
        result = result.filter((e) => e.agentId === filter.agentId);
      }
      if (filter.taskId !== undefined) {
        result = result.filter((e) => e.taskId === filter.taskId);
      }
      if (filter.phase !== undefined) {
        result = result.filter((e) => e.phase === filter.phase);
      }
      if (filter.actionType !== undefined) {
        result = result.filter((e) => e.action.type === filter.actionType);
      }
      if (filter.outcome !== undefined) {
        result = result.filter((e) => e.outcome === filter.outcome);
      }
      if (filter.from !== undefined) {
        const fromDate = filter.from;
        result = result.filter((e) => e.timestamp >= fromDate);
      }
      if (filter.to !== undefined) {
        const toDate = filter.to;
        result = result.filter((e) => e.timestamp <= toDate);
      }

      if (filter.offset !== undefined && filter.offset > 0) {
        result = result.slice(filter.offset);
      }
      if (filter.limit !== undefined && filter.limit > 0) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },
  };
};
