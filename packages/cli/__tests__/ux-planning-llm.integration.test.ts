/**
 * @module @agentforge/cli/__tests__/ux-planning-llm.integration
 *
 * Live LLM integration tests for UX Planning (Stage 2).
 * Validates whether navigateTo survives PLANNING_OUTPUT_SCHEMA,
 * and how the LLM handles NavigationBar components.
 *
 * Run with: RUN_LLM_TESTS=true npx nx test cli -- --testPathPattern=ux-planning-llm
 */

import { createClaudeProvider } from '@agentforge/providers';
import type { ProviderConfig } from '@agentforge/providers';

function getProviderConfig(): ProviderConfig | null {
  if (process.env['ANTHROPIC_API_KEY']) {
    return { provider: 'anthropic', auth: { type: 'api_key', api_key: process.env['ANTHROPIC_API_KEY'] } };
  }
  if (process.env['ANTHROPIC_VERTEX_PROJECT_ID'] || process.env['CLAUDE_CODE_USE_VERTEX']) {
    return { provider: 'vertex', auth: { type: 'adc' } };
  }
  return null;
}

const PLANNING_SYSTEM_PROMPT = `You are a UX planning agent. Given a design brief and page context, generate a component tree with token bindings.

## Navigation Binding

When the target page has navigates_to entries in its page context, bind them to specific components in your componentTree by adding "navigateTo": "target-page-id" to the component node that triggers that navigation.

Rules:
- Only add navigateTo to leaf-level interactive components (buttons, tabs, links, nav items), not containers
- Match the trigger description to the most appropriate component

Example:
{
  "name": "ViewAllClaimsButton",
  "props": ["label"],
  "navigateTo": "claims-list",
  "children": []
}

Respond with ONLY valid JSON.`;

const PLANNING_USER_PROMPT = `Module ID: dashboard

Design Brief:
{
  "briefId": "dashboard-brief",
  "designConstraints": ["desktop-only at 1440px"],
  "referencePatterns": ["card-based dashboard layout"]
}

## Target Page: Dashboard (/)
Required Components: NavigationHeader, ExpenseSummaryCard, BudgetProgressList, RecentTransactions
Data Sources: Expense, Budget
Description: Main dashboard showing spending overview, budget progress, and recent transactions

Navigation from this page:
  - "Click 'View All Transactions' link" → expenses
  - "Click QuickAddExpenseButton" → add-expense
  - "Click on a BudgetProgressList item" → budgets
  - "Click 'Reports' in NavigationHeader" → reports

## All App Screens
1. dashboard (/) — Dashboard: Main dashboard [4 components]
2. expenses (/expenses) — Expenses: Transaction list [3 components]
3. add-expense (/expenses/new) — Add Expense: Expense form [2 components]
4. budgets (/budgets) — Budgets: Budget management [3 components]
5. reports (/reports) — Reports: Analytics [3 components]`;

// The EXACT schema from ux-planning.ts — with additionalProperties: false, NO navigateTo
const PLANNING_OUTPUT_SCHEMA_CURRENT = {
  schema: {
    type: 'object' as const,
    properties: {
      specRef: { type: 'string' },
      moduleId: { type: 'string' },
      componentTree: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            props: { type: 'array', items: { type: 'string' } },
            children: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
      tokenBindings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['key', 'value'],
          additionalProperties: false,
        },
      },
      responsiveRules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            breakpoint: { type: 'string' },
            behavior: { type: 'string' },
            width: { type: 'number' },
            layout: { type: 'string' },
            changes: { type: 'array', items: { type: 'string' } },
          },
          required: ['breakpoint', 'behavior'],
          additionalProperties: false,
        },
      },
      screens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            components: { type: 'array', items: { type: 'string' } },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    required: ['specRef', 'moduleId', 'componentTree', 'tokenBindings', 'responsiveRules'],
    additionalProperties: false,
  },
};

// Same schema but WITH navigateTo added — to see what the LLM would produce
const PLANNING_OUTPUT_SCHEMA_WITH_NAV = {
  schema: {
    ...PLANNING_OUTPUT_SCHEMA_CURRENT.schema,
    properties: {
      ...PLANNING_OUTPUT_SCHEMA_CURRENT.schema.properties,
      componentTree: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' },
            props: { type: 'array', items: { type: 'string' } },
            children: { type: 'array', items: { type: 'string' } },
            navigateTo: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
  },
};

interface PlanningComponent {
  name: string;
  props?: string[];
  children?: string[];
  navigateTo?: string;
}

interface PlanningOutput {
  specRef: string;
  moduleId: string;
  componentTree: PlanningComponent[];
  tokenBindings: { key: string; value: string }[];
  responsiveRules: { breakpoint: string; behavior: string }[];
  screens?: { name: string; components: string[] }[];
}

const providerConfig = getProviderConfig();
const describeIfLLM = (providerConfig && process.env.RUN_LLM_TESTS === 'true') ? describe : describe.skip;

describeIfLLM('UX Planning LLM integration (CRITICAL-1 schema gap validation)', () => {
  let resultWithoutNav: PlanningOutput | null = null;
  let resultWithNav: PlanningOutput | null = null;

  beforeAll(async () => {
    const provider = createClaudeProvider('claude-sonnet-4-6', providerConfig!);

    // Run 1: Current schema (WITHOUT navigateTo) — confirms the gap
    const result1 = await provider.complete(
      {
        system: PLANNING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: PLANNING_USER_PROMPT }],
      },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 4096,
        temperature: 0,
        responseSchema: PLANNING_OUTPUT_SCHEMA_CURRENT,
      },
    );

    if (result1.ok) {
      const parsed = (result1.value as { structured?: Record<string, unknown> }).structured;
      resultWithoutNav = (parsed ?? JSON.parse((result1.value as { content: string }).content)) as PlanningOutput;
    }

    // Run 2: Fixed schema (WITH navigateTo) — shows what the LLM would produce
    const result2 = await provider.complete(
      {
        system: PLANNING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: PLANNING_USER_PROMPT }],
      },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 4096,
        temperature: 0,
        responseSchema: PLANNING_OUTPUT_SCHEMA_WITH_NAV,
      },
    );

    if (result2.ok) {
      const parsed = (result2.value as { structured?: Record<string, unknown> }).structured;
      resultWithNav = (parsed ?? JSON.parse((result2.value as { content: string }).content)) as PlanningOutput;
    }
  }, 180_000);

  describe('Current schema (WITHOUT navigateTo)', () => {
    it('produces valid component tree', () => {
      expect(resultWithoutNav).not.toBeNull();
      expect(resultWithoutNav!.componentTree.length).toBeGreaterThan(0);
    });

    it('reports navigateTo presence despite schema lacking the field', () => {
      const componentsWithNav = resultWithoutNav!.componentTree.filter(
        c => 'navigateTo' in c,
      );

      console.log('\n=== CURRENT SCHEMA (no navigateTo field) ===');
      console.log(`Components: ${resultWithoutNav!.componentTree.length}`);
      console.log(`Components with navigateTo: ${componentsWithNav.length}`);
      for (const c of resultWithoutNav!.componentTree) {
        const nav = (c as Record<string, unknown>)['navigateTo'];
        console.log(`  ${c.name}: navigateTo=${nav ?? 'ABSENT'}`);
      }

      // Log finding: whether additionalProperties:false actually strips navigateTo
      if (componentsWithNav.length > 0) {
        console.log('\n  FINDING: navigateTo survives despite additionalProperties:false');
        console.log('  The schema gap is less severe than originally claimed.');
      } else {
        console.log('\n  FINDING: navigateTo IS stripped by additionalProperties:false');
        console.log('  The schema gap is confirmed.');
      }
    });

    it('LLM may put navigateTo as a prop name instead (workaround)', () => {
      const componentsWithNavProp = resultWithoutNav!.componentTree.filter(
        c => c.props?.includes('navigateTo'),
      );

      console.log(`\n  Components with "navigateTo" in props array: ${componentsWithNavProp.length}`);
      for (const c of componentsWithNavProp) {
        console.log(`    ${c.name}: props=${JSON.stringify(c.props)}`);
      }
    });
  });

  describe('Fixed schema (WITH navigateTo)', () => {
    it('produces valid component tree', () => {
      expect(resultWithNav).not.toBeNull();
      expect(resultWithNav!.componentTree.length).toBeGreaterThan(0);
    });

    it('navigateTo is PRESENT on interactive components (confirms fix works)', () => {
      const componentsWithNav = resultWithNav!.componentTree.filter(
        c => c.navigateTo,
      );

      console.log('\n=== FIXED SCHEMA (navigateTo field added) ===');
      console.log(`Components: ${resultWithNav!.componentTree.length}`);
      console.log(`Components with navigateTo: ${componentsWithNav.length}`);
      for (const c of resultWithNav!.componentTree) {
        console.log(`  ${c.name}: navigateTo=${c.navigateTo ?? 'none'}`);
      }

      expect(componentsWithNav.length).toBeGreaterThan(0);
    });

    it('navigateTo targets match the page IDs from context', () => {
      const validTargets = new Set(['dashboard', 'expenses', 'add-expense', 'budgets', 'reports']);
      const componentsWithNav = resultWithNav!.componentTree.filter(c => c.navigateTo);

      for (const c of componentsWithNav) {
        expect(validTargets.has(c.navigateTo!)).toBe(true);
      }
    });
  });

  describe('NavigationBar handling (CRITICAL-3)', () => {
    it('reports how NavigationHeader is structured', () => {
      const navHeader = resultWithNav!.componentTree.find(
        c => c.name.toLowerCase().includes('navigation') || c.name.toLowerCase().includes('navbar'),
      );

      console.log('\n=== CRITICAL-3: NavigationBar structure ===');
      if (navHeader) {
        console.log(`  Component: ${navHeader.name}`);
        console.log(`  Props: ${JSON.stringify(navHeader.props)}`);
        console.log(`  Children: ${JSON.stringify(navHeader.children)}`);
        console.log(`  navigateTo: ${navHeader.navigateTo ?? 'none'}`);

        const childNames = navHeader.children ?? [];
        const childComponents = resultWithNav!.componentTree.filter(
          c => childNames.includes(c.name),
        );
        console.log(`  Child components with navigateTo:`);
        for (const child of childComponents) {
          console.log(`    ${child.name}: navigateTo=${child.navigateTo ?? 'none'}`);
        }
      } else {
        console.log('  No NavigationHeader/NavBar component found');
      }
    });
  });
});
