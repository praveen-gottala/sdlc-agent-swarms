/**
 * @jest-environment node
 */
import {
  wrapResearchShallow,
  wrapPlanningShallow,
  migrateResearchArtifact,
  migratePlanningArtifact,
} from '../../_lib/shallow-wrappers';

import {
  UXResearchOutputSchema,
  UXPlanningOutputSchema,
} from '@agentforge/agents-ux/schemas';

describe('shallow-wrappers', () => {
  const PAGE_ID = 'test-page-001';
  const RAW_MD = '# Research Brief\n\nSome markdown content about the design.';

  describe('wrapResearchShallow', () => {
    it('passes UXResearchOutputSchema.passthrough().safeParse()', () => {
      const wrapped = wrapResearchShallow(PAGE_ID, RAW_MD);
      const result = UXResearchOutputSchema.passthrough().safeParse(wrapped);
      expect(result.success).toBe(true);
    });

    it('has _migrated: true marker', () => {
      const wrapped = wrapResearchShallow(PAGE_ID, RAW_MD);
      expect(wrapped._migrated).toBe(true);
    });

    it('has empty semantic arrays', () => {
      const wrapped = wrapResearchShallow(PAGE_ID, RAW_MD);
      expect(wrapped.requirementIds).toEqual([]);
      expect(wrapped.designConstraints).toEqual([]);
      expect(wrapped.referencePatterns).toEqual([]);
      expect(wrapped.accessibilityRequirements).toEqual([]);
      expect(wrapped.dataModelDependencies).toEqual([]);
    });

    it('preserves the original markdown in _rawMarkdown', () => {
      const wrapped = wrapResearchShallow(PAGE_ID, RAW_MD);
      expect(wrapped._rawMarkdown).toBe(RAW_MD);
    });

    it('sets briefId and moduleId to pageId', () => {
      const wrapped = wrapResearchShallow(PAGE_ID, RAW_MD);
      expect(wrapped.briefId).toBe(PAGE_ID);
      expect(wrapped.moduleId).toBe(PAGE_ID);
    });
  });

  describe('wrapPlanningShallow', () => {
    it('passes UXPlanningOutputSchema.passthrough().safeParse()', () => {
      const wrapped = wrapPlanningShallow(PAGE_ID, RAW_MD);
      const result = UXPlanningOutputSchema.passthrough().safeParse(wrapped);
      expect(result.success).toBe(true);
    });

    it('has _migrated: true marker', () => {
      const wrapped = wrapPlanningShallow(PAGE_ID, RAW_MD);
      expect(wrapped._migrated).toBe(true);
    });

    it('has empty semantic fields', () => {
      const wrapped = wrapPlanningShallow(PAGE_ID, RAW_MD);
      expect(wrapped.componentTree).toEqual([]);
      expect(wrapped.tokenBindings).toEqual({});
      expect(wrapped.responsiveRules).toEqual([]);
    });

    it('preserves the original markdown in _rawMarkdown', () => {
      const wrapped = wrapPlanningShallow(PAGE_ID, RAW_MD);
      expect(wrapped._rawMarkdown).toBe(RAW_MD);
    });
  });

  describe('migrateResearchArtifact', () => {
    it('wraps old { brief: string } shape', () => {
      const old = { brief: 'Some research markdown' };
      const result = migrateResearchArtifact(PAGE_ID, old) as ReturnType<typeof wrapResearchShallow>;
      expect(result._migrated).toBe(true);
      expect(result._rawMarkdown).toBe('Some research markdown');
      expect(result.briefId).toBe(PAGE_ID);
    });

    it('passes through already-typed objects', () => {
      const typed = {
        briefId: 'page-001',
        moduleId: 'page-001',
        requirementIds: ['REQ-1'],
        designConstraints: [],
        referencePatterns: [],
        accessibilityRequirements: [],
        dataModelDependencies: [],
      };
      const result = migrateResearchArtifact(PAGE_ID, typed);
      expect(result).toBe(typed);
    });

    it('passes through null', () => {
      expect(migrateResearchArtifact(PAGE_ID, null)).toBeNull();
    });
  });

  describe('migratePlanningArtifact', () => {
    it('wraps old { spec: string } shape', () => {
      const old = { spec: 'Some planning markdown' };
      const result = migratePlanningArtifact(PAGE_ID, old) as ReturnType<typeof wrapPlanningShallow>;
      expect(result._migrated).toBe(true);
      expect(result._rawMarkdown).toBe('Some planning markdown');
      expect(result.specRef).toBe(PAGE_ID);
    });

    it('passes through already-typed objects', () => {
      const typed = {
        specRef: 'page-001',
        moduleId: 'page-001',
        componentTree: [],
        tokenBindings: {},
        responsiveRules: [],
      };
      const result = migratePlanningArtifact(PAGE_ID, typed);
      expect(result).toBe(typed);
    });
  });
});
