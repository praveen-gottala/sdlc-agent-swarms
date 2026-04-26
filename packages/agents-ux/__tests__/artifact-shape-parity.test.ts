/**
 * @jest-environment node
 *
 * Artifact Shape Parity Test
 *
 * Validates that typed agent outputs round-trip through Zod schemas,
 * that old dashboard shapes ({ brief: string }, { spec: string })
 * are rejected by the canonical schemas, and that both CLI and dashboard
 * callers use the shared runDesignPipeline entry point.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UXResearchOutputSchema, UXPlanningOutputSchema } from '../src/schemas';

const MONOREPO_ROOT = join(__dirname, '..', '..', '..');
const FIXTURE_DESIGNS = join(
  MONOREPO_ROOT,
  'fixtures/personal-expense-tracker/agentforge/designs',
);

describe('artifact shape parity', () => {
  describe('UXResearchOutput round-trip', () => {
    it('accepts a well-formed research output', () => {
      const validResearch = {
        briefId: 'page-001',
        moduleId: 'page-001',
        requirementIds: ['REQ-1', 'REQ-2'],
        designConstraints: ['Must use 1440px viewport'],
        referencePatterns: ['Dashboard layout with sidebar'],
        accessibilityRequirements: ['WCAG 2.1 AA compliance'],
        dataModelDependencies: ['User model', 'Transaction model'],
      };

      const result = UXResearchOutputSchema.safeParse(validResearch);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.briefId).toBe('page-001');
        expect(result.data.requirementIds).toEqual(['REQ-1', 'REQ-2']);
      }
    });

    it('accepts minimal research output with defaults', () => {
      const result = UXResearchOutputSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.briefId).toBe('');
        expect(result.data.requirementIds).toEqual([]);
        expect(result.data.designConstraints).toEqual([]);
      }
    });
  });

  describe('UXPlanningOutput round-trip', () => {
    it('accepts a well-formed planning output', () => {
      const validPlanning = {
        specRef: 'page-001',
        moduleId: 'page-001',
        componentTree: [{ name: 'Header', props: ['title'], children: ['NavBar'] }],
        tokenBindings: { primary: 'deep-teal' },
        responsiveRules: [{ breakpoint: 'desktop', behavior: 'fixed', width: 1440 }],
      };

      const result = UXPlanningOutputSchema.safeParse(validPlanning);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.specRef).toBe('page-001');
        expect(result.data.componentTree).toHaveLength(1);
      }
    });
  });

  describe('old dashboard shapes are rejected', () => {
    it('rejects { brief: string } as UXResearchOutput', () => {
      const oldDashboardShape = { brief: '# Research Brief\n\nSome markdown content...' };
      const result = UXResearchOutputSchema.safeParse(oldDashboardShape);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.briefId).toBe('');
        expect(result.data.designConstraints).toEqual([]);
        expect('brief' in result.data).toBe(false);
      }
    });

    it('rejects { spec: string } as UXPlanningOutput', () => {
      const oldDashboardShape = { spec: '# Planning Spec\n\nSome markdown content...' };
      const result = UXPlanningOutputSchema.safeParse(oldDashboardShape);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.specRef).toBe('');
        expect(result.data.componentTree).toEqual([]);
        expect('spec' in result.data).toBe(false);
      }
    });

    it('old dashboard research shape loses the brief field through strict parsing', () => {
      const oldShape = { brief: 'Some markdown' };
      const result = UXResearchOutputSchema.safeParse(oldShape);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('brief');
      }
    });

    it('old dashboard planning shape loses the spec field through strict parsing', () => {
      const oldShape = { spec: 'Some markdown' };
      const result = UXPlanningOutputSchema.safeParse(oldShape);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('spec');
      }
    });
  });

  describe('[Phase 3+] pipeline produces canonical artifact shapes', () => {
    it('research fixture parses against UXResearchOutputSchema without _migrated', () => {
      const raw = readFileSync(
        join(FIXTURE_DESIGNS, 'add-expense/research-brief.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      const result = UXResearchOutputSchema.safeParse(data);

      expect(result.success).toBe(true);
      expect(data).not.toHaveProperty('_migrated');
      expect(data).not.toHaveProperty('_rawMarkdown');
      expect(data).toHaveProperty('briefId');
    });

    it('planning fixture parses against UXPlanningOutputSchema without _migrated', () => {
      const raw = readFileSync(
        join(FIXTURE_DESIGNS, 'add-expense/planning-spec.json'),
        'utf-8',
      );
      const data = JSON.parse(raw);
      const result = UXPlanningOutputSchema.safeParse(data);

      expect(result.success).toBe(true);
      expect(data).not.toHaveProperty('_migrated');
      expect(data).not.toHaveProperty('_rawMarkdown');
      expect(data).toHaveProperty('specRef');
    });

    it('CLI and dashboard both use runDesignPipeline, not parallel paths', () => {
      const cliSource = readFileSync(
        join(MONOREPO_ROOT, 'packages/cli/src/commands/design-page.ts'),
        'utf-8',
      );
      const dashboardSource = readFileSync(
        join(
          MONOREPO_ROOT,
          'packages/dashboard/src/app/api/pages/[pageId]/design/route.ts',
        ),
        'utf-8',
      );

      expect(cliSource).toContain('runDesignPipeline(');
      expect(dashboardSource).toContain('runDesignPipeline(');

      expect(cliSource).not.toContain('callPipelineStage(');
      expect(dashboardSource).not.toContain('callPipelineStage(');
      expect(dashboardSource).not.toContain('callClaudeDesignAPI(');
    });
  });
});
