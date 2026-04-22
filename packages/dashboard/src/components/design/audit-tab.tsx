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

export interface AuditTabProps {
  mechanicalAudit: MechanicalAuditResult | null;
  mechanicalAuditLoading: boolean;
  visionAudit: VisionAuditResult | null;
  visionAuditLoading: boolean;
  onRunVisionAudit: () => void;
  visionAuditAvailable: boolean;
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

function ScoreDisplay({ score, quality }: { score: number; quality: string }) {
  const color =
    score >= 90 ? 'text-green-400' :
    score >= 70 ? 'text-yellow-400' :
    'text-red-400';

  const qualityBadge =
    quality === 'good' ? 'bg-green-500/15 text-green-400' :
    quality === 'needs_fixes' ? 'bg-yellow-500/15 text-yellow-400' :
    'bg-red-500/15 text-red-400';

  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-text-muted text-sm">/100</span>
      <span className={`px-2 py-0.5 rounded text-xs ${qualityBadge}`}>
        {quality.replace('_', ' ')}
      </span>
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
}: AuditTabProps) {
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

        {visionAuditLoading && (
          <div className="flex items-center gap-2 text-text-muted py-4">
            <div className="w-4 h-4 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" />
            Vision analysis with claude-opus-4-7...
          </div>
        )}

        {visionAudit && (
          <>
            <ScoreDisplay score={visionAudit.score} quality={visionAudit.overallQuality} />

            {visionAudit.issues.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {visionAudit.issues.map((issue, i) => (
                  <div
                    key={issue.issueId ?? i}
                    className={`border rounded p-2 text-xs ${SEVERITY_STYLES[issue.severity] ?? ''}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="uppercase text-[10px] font-semibold">{issue.severity}</span>
                      <span className="text-text-secondary font-mono">{issue.component}</span>
                    </div>
                    <p className="text-text-primary mb-1">{issue.description}</p>
                    <p className="text-text-muted italic">Fix: {issue.fix}</p>
                  </div>
                ))}
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
