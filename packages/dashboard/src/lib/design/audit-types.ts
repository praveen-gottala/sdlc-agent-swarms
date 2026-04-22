/**
 * Types for the two-tier design audit feature.
 * Used by AuditTab component and design page state.
 */

export type Verdict = 'PASS' | 'FAIL' | 'DROP' | 'SKIP' | 'DATA-PASS' | 'DATA-FAIL' | 'DATA-SKIP';

export interface PropertyCheck {
  property: string;
  specValue: string;
  computedValue: string;
  verdict: Verdict;
  note?: string;
}

export interface NodeReport {
  nodeId: string;
  nodeType: string;
  checks: PropertyCheck[];
}

export interface AuditSummary {
  totalChecks: number;
  pass: number;
  fail: number;
  drop: number;
  skip: number;
  dataPass: number;
  dataFail: number;
  dataSkip: number;
  specNodeCount: number;
  domNodeCount: number;
}

export interface MechanicalAuditResult {
  reports: NodeReport[];
  mechanicalIssues: Array<{
    nodeId: string;
    rule: string;
    autoFixable: boolean;
    description: string;
  }>;
  summary: AuditSummary;
}

export interface VisionIssue {
  severity: 'critical' | 'major' | 'minor';
  component: string;
  description: string;
  fix: string;
  issueId?: string;
}

export interface VisionAuditResult {
  score: number;
  overallQuality: 'good' | 'needs_fixes' | 'poor';
  issues: VisionIssue[];
}
