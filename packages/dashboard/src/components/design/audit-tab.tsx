'use client';

import React, { useState } from 'react';
import type {
  MechanicalAuditResult,
  VisionAuditResult,
  NodeReport,
  Verdict,
} from '@/lib/design/audit-types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface VisionIssueAction {
  severity: string;
  component: string;
  description: string;
  fix: string;
  issueId?: string;
}

export type FixPhase = 'idle' | 'fixing' | 'verifying' | 'retrying';

export interface AuditTabProps {
  mechanicalAudit: MechanicalAuditResult | null;
  mechanicalAuditLoading: boolean;
  visionAudit: VisionAuditResult | null;
  visionAuditLoading: boolean;
  onRunVisionAudit: () => void;
  visionAuditAvailable: boolean;
  onFixIssue?: (issue: VisionIssueAction, feedback?: string) => Promise<void>;
  onFixAll?: (issues: VisionIssueAction[], feedback?: string) => Promise<void>;
  onFixMechanical?: () => Promise<void>;
  mechanicalFixLoading?: boolean;
  fixPhase?: FixPhase;
  fixingIssueId?: string | null;
  /** Score before the last fix round — used to show improvement delta. */
  previousScore?: number | null;
  /** Issues from the previous audit that are no longer in the current audit (addressed). */
  addressedIssues?: VisionIssueAction[];
}

/* ------------------------------------------------------------------ */
/*  Verdict colors                                                     */
/* ------------------------------------------------------------------ */

const VERDICT_STYLES: Record<Verdict, string> = {
  'PASS': 'bg-green-500/15 text-green-400',
  'FAIL': 'bg-red-500/15 text-red-400',
  'DROP': 'bg-yellow-500/15 text-yellow-400',
  'SKIP': 'bg-gray-500/15 text-gray-400',
  'DATA-PASS': 'bg-green-500/15 text-green-400',
  'DATA-FAIL': 'bg-red-500/15 text-red-400',
  'DATA-SKIP': 'bg-gray-500/15 text-gray-400',
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  major: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  minor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono ${VERDICT_STYLES[verdict]}`}>
      {verdict}
    </span>
  );
}

function SummaryPill({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span data-testid={`verdict-${label.toLowerCase()}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {count} {label}
    </span>
  );
}

function NodeReportCard({ report }: { report: NodeReport }) {
  const [expanded, setExpanded] = useState(false);
  const failCount = report.checks.filter(c =>
    c.verdict === 'FAIL' || c.verdict === 'DROP' || c.verdict === 'DATA-FAIL',
  ).length;

  return (
    <div data-testid="audit-node" className="border border-border rounded mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-left hover:bg-surface-secondary/50"
      >
        <span className="font-mono truncate">{report.nodeId}</span>
        <span className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <span className="text-text-muted">{report.nodeType}</span>
          {failCount > 0 && (
            <span className="bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded text-[10px]">
              {failCount}
            </span>
          )}
          <span className="text-text-muted">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-2 py-1 space-y-0.5">
          {report.checks.map((check, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5 text-[11px]">
              <VerdictBadge verdict={check.verdict} />
              <span className="font-mono text-text-secondary flex-shrink-0">{check.property}</span>
              <span className="text-text-muted truncate">
                {check.specValue} → {check.computedValue}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreDisplay({ score, quality, previousScore, addressedCount }: {
  score: number; quality: string; previousScore?: number | null; addressedCount?: number;
}) {
  const color =
    score >= 90 ? 'text-green-400' :
    score >= 70 ? 'text-yellow-400' :
    'text-red-400';

  const qualityBadge =
    quality === 'good' ? 'bg-green-500/15 text-green-400' :
    quality === 'needs_fixes' ? 'bg-yellow-500/15 text-yellow-400' :
    'bg-red-500/15 text-red-400';

  const delta = previousScore != null && previousScore >= 0 ? score - previousScore : null;

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
        <span className="text-text-muted text-sm">/100</span>
        <span className={`px-2 py-0.5 rounded text-xs ${qualityBadge}`}>
          {quality.replace('_', ' ')}
        </span>
      </div>
      {(delta !== null || (addressedCount != null && addressedCount > 0)) && (
        <div className="flex items-center gap-2 mt-1 text-[11px]">
          {delta !== null && (
            <span className={delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-text-muted'}>
              {delta > 0 ? '+' : ''}{delta} from {previousScore}
            </span>
          )}
          {addressedCount != null && addressedCount > 0 && (
            <span className="text-green-400">{addressedCount} issues addressed</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AuditTab({
  mechanicalAudit,
  mechanicalAuditLoading,
  visionAudit,
  visionAuditLoading,
  onRunVisionAudit,
  visionAuditAvailable,
  onFixIssue,
  onFixAll,
  onFixMechanical,
  mechanicalFixLoading = false,
  fixPhase = 'idle',
  fixingIssueId,
  previousScore,
  addressedIssues = [],
}: AuditTabProps) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState('');
  const [addressedExpanded, setAddressedExpanded] = useState(false);

  const unresolvedIssues = (visionAudit?.issues ?? []).filter(
    (issue) => !resolvedIds.has(issue.issueId ?? issue.component),
  );

  const toggleResolved = (issue: VisionIssueAction) => {
    const id = issue.issueId ?? issue.component;
    setResolvedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4 text-sm">
      {/* ── Mechanical Audit ──────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Mechanical Audit
        </h3>

        {mechanicalAuditLoading && (
          <div className="flex items-center gap-2 text-text-muted py-4">
            <div className="w-4 h-4 border-2 border-accent-blue/30 border-t-accent-blue rounded-full animate-spin" />
            Extracting DOM layout...
          </div>
        )}

        {!mechanicalAudit && !mechanicalAuditLoading && (
          <p className="text-text-muted text-xs py-4">
            Click <strong>Audit</strong> in the toolbar to analyze spec vs. rendered output.
          </p>
        )}

        {mechanicalAudit && (
          <>
            {/* Summary */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <SummaryPill label="Pass" count={mechanicalAudit.summary.pass} color="bg-green-500/15 text-green-400" />
              <SummaryPill label="Fail" count={mechanicalAudit.summary.fail} color="bg-red-500/15 text-red-400" />
              <SummaryPill label="Drop" count={mechanicalAudit.summary.drop} color="bg-yellow-500/15 text-yellow-400" />
              <SummaryPill label="Data-Fail" count={mechanicalAudit.summary.dataFail} color="bg-red-500/15 text-red-400" />
            </div>

            <p className="text-[11px] text-text-muted mb-2">
              {mechanicalAudit.summary.domNodeCount}/{mechanicalAudit.summary.specNodeCount} spec nodes found in DOM
            </p>

            {/* Fix button for mechanical failures and drops */}
            {onFixMechanical && (mechanicalAudit.summary.fail + mechanicalAudit.summary.drop) > 0 && (
              <button
                onClick={onFixMechanical}
                disabled={mechanicalFixLoading}
                className="w-full mb-2 px-3 py-1.5 rounded text-xs font-medium bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {mechanicalFixLoading ? 'Fixing spec mismatches...' : `Fix Spec Mismatches (${mechanicalAudit.summary.fail + mechanicalAudit.summary.drop})`}
              </button>
            )}

            {/* Node list — failures first */}
            <div className="space-y-0.5">
              {[...mechanicalAudit.reports]
                .sort((a, b) => {
                  const af = a.checks.filter(c => c.verdict === 'FAIL' || c.verdict === 'DROP' || c.verdict === 'DATA-FAIL').length;
                  const bf = b.checks.filter(c => c.verdict === 'FAIL' || c.verdict === 'DROP' || c.verdict === 'DATA-FAIL').length;
                  return bf - af;
                })
                .map(report => (
                  <NodeReportCard key={report.nodeId} report={report} />
                ))}
            </div>

            {/* Mechanical issues */}
            {mechanicalAudit.mechanicalIssues.length > 0 && (
              <div className="mt-3">
                <h4 className="text-[11px] font-semibold text-text-secondary mb-1">
                  Layout Issues ({mechanicalAudit.mechanicalIssues.length})
                </h4>
                {mechanicalAudit.mechanicalIssues.map((issue, i) => (
                  <div key={i} className="text-[11px] text-text-muted py-0.5">
                    <span className="font-mono text-text-secondary">{issue.nodeId}</span>
                    {' — '}
                    <span className={issue.autoFixable ? 'text-yellow-400' : 'text-red-400'}>
                      {issue.rule}
                    </span>
                    {': '}{issue.description}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Vision Audit ──────────────────────────────────── */}
      <section className="border-t border-border pt-3">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Deep Audit (Vision)
        </h3>

        {!visionAudit && !visionAuditLoading && (
          <div className="space-y-2">
            <button
              onClick={onRunVisionAudit}
              disabled={!mechanicalAudit || !visionAuditAvailable || visionAuditLoading}
              className="w-full px-3 py-2 rounded text-xs font-medium bg-accent-purple/15 text-accent-purple hover:bg-accent-purple/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={!visionAuditAvailable ? 'API key required — set ANTHROPIC_API_KEY' : !mechanicalAudit ? 'Run mechanical audit first' : undefined}
            >
              Run Deep Audit
            </button>
            <p className="text-[10px] text-text-muted text-center">
              {!visionAuditAvailable
                ? 'Requires ANTHROPIC_API_KEY'
                : '~$0.05-0.10 per page • claude-opus-4-7'}
            </p>
          </div>
        )}

        {(visionAuditLoading || fixPhase !== 'idle') && (
          <div className="flex items-center gap-2 text-text-muted py-4">
            <div className="w-4 h-4 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" />
            {fixPhase === 'fixing' ? 'Applying fixes...' :
             fixPhase === 'retrying' ? 'Retrying remaining issues...' :
             fixPhase === 'verifying' ? 'Verifying fixes...' :
             'Vision analysis with claude-opus-4-7...'}
          </div>
        )}

        {visionAudit?.error && (
          <div className="border border-yellow-500/30 bg-yellow-500/10 rounded p-2.5 text-xs text-yellow-300">
            {visionAudit.error}
          </div>
        )}

        {visionAudit && !visionAudit.error && fixPhase === 'idle' && (
          <>
            <ScoreDisplay
              score={visionAudit.score}
              quality={visionAudit.overallQuality}
              previousScore={previousScore}
              addressedCount={addressedIssues.length}
            />

            {/* Addressed issues (green, collapsed) */}
            {addressedIssues.length > 0 && (
              <button
                onClick={() => setAddressedExpanded(!addressedExpanded)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs bg-green-500/10 border border-green-500/20 text-green-400 mb-2"
              >
                <span>Issues Addressed ({addressedIssues.length})</span>
                <span>{addressedExpanded ? '▲' : '▼'}</span>
              </button>
            )}
            {addressedExpanded && addressedIssues.map((issue, i) => (
              <div
                key={`addr-${i}`}
                className="border border-green-500/20 bg-green-500/5 rounded p-2 text-xs text-green-400/70 mb-1"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-green-400">&#10003;</span>
                  <span className="font-mono">{issue.component}</span>
                </div>
                <p className="line-through mt-0.5">{issue.description}</p>
              </div>
            ))}

            {visionAudit.issues.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {visionAudit.issues.map((issue, i) => {
                  const id = issue.issueId ?? issue.component;
                  const isResolved = resolvedIds.has(id);
                  const isFixing = fixingIssueId === id;

                  return (
                    <div
                      key={id + '-' + String(i)}
                      className={`border rounded p-2 text-xs transition-opacity ${
                        isResolved ? 'opacity-40 border-border' : (SEVERITY_STYLES[issue.severity] ?? '')
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <input
                          type="checkbox"
                          checked={isResolved}
                          onChange={() => toggleResolved(issue)}
                          className="w-3 h-3 rounded accent-green-500 cursor-pointer"
                          title={isResolved ? 'Mark as unresolved' : 'Mark as resolved'}
                        />
                        <span className="uppercase text-[10px] font-semibold">{issue.severity}</span>
                        <span className="text-text-secondary font-mono">{issue.component}</span>
                        {!isResolved && onFixIssue && (
                          <button
                            onClick={() => onFixIssue(issue, feedback || undefined)}
                            disabled={!!fixingIssueId}
                            className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 disabled:opacity-40 transition-colors"
                          >
                            {isFixing ? 'Fixing...' : 'Fix'}
                          </button>
                        )}
                      </div>
                      <p className={`mb-1 ${isResolved ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                        {issue.description}
                      </p>
                      {!isResolved && (
                        <p className="text-text-muted italic">Fix: {issue.fix}</p>
                      )}
                    </div>
                  );
                })}

                {/* Feedback input + action buttons */}
                {onFixAll && unresolvedIssues.length > 0 && (
                  <div className="mt-3 space-y-2 pt-2 border-t border-border">
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Additional feedback for the fix (optional)..."
                      className="w-full px-2 py-1.5 rounded text-xs bg-surface-secondary border border-border text-text-primary placeholder:text-text-muted resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => onFixAll(unresolvedIssues, feedback || undefined)}
                        disabled={!!fixingIssueId}
                        className="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-accent-purple/15 text-accent-purple hover:bg-accent-purple/25 disabled:opacity-40 transition-colors"
                      >
                        {fixingIssueId ? 'Fixing...' : `Fix All (${unresolvedIssues.length})`}
                      </button>
                      <button
                        onClick={onRunVisionAudit}
                        disabled={visionAuditLoading}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80 disabled:opacity-40 transition-colors"
                      >
                        Re-Audit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {visionAudit.issues.length === 0 && (
              <p className="text-text-muted text-xs">No issues found.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
