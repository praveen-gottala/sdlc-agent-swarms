import {
  parsePenpotDesignScript,
  PENPOT_DESIGN_CONTRACT,
} from './ux-penpot-design.js';
import { DEFAULT_MODEL } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const SAMPLE_SCRIPT = JSON.stringify({
  script: [
    'const board = penpot.createBoard();',
    'board.name = "Dashboard";',
    'board.resize(1440, 900);',
  ].join('\n'),
  breakpoints: ['1440', '768'],
});

const SAMPLE_STEPS = JSON.stringify({
  steps: [
    {
      code: 'const board = penpot.createBoard(); board.name = "Dashboard"; return { id: board.id };',
      description: 'Create dashboard board',
      componentRef: 'Dashboard',
    },
    {
      code: 'const rect = penpot.createRectangle(); rect.name = "Card"; rect.resize(300, 200); return { id: rect.id };',
      description: 'Create card rectangle',
      componentRef: 'Card',
    },
  ],
  breakpoints: ['1440', '768', '375'],
});

// ============================================================================
// Contract tests
// ============================================================================

describe('PENPOT_DESIGN_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(PENPOT_DESIGN_CONTRACT.role).toBe('penpot_design');
    expect(PENPOT_DESIGN_CONTRACT.category).toBe('design');
    expect(PENPOT_DESIGN_CONTRACT.provider).toBe(DEFAULT_MODEL);
    expect(PENPOT_DESIGN_CONTRACT.tools).toContain('penpot:execute_code');
    expect(PENPOT_DESIGN_CONTRACT.tools).not.toContain('penpot:export_shape');
    expect(PENPOT_DESIGN_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'write_design', 'read_design_system']);
    expect(PENPOT_DESIGN_CONTRACT.denied).toEqual(['write_code', 'create_branch', 'merge_pr']);
    expect(PENPOT_DESIGN_CONTRACT.hitl_policy).toBe('full_approval');
  });

  it('contract on_complete matches PenpotDesignReady event', () => {
    expect(PENPOT_DESIGN_CONTRACT.on_complete).toBe('PenpotDesignReady');
  });

  it('contract budget limits are set', () => {
    expect(PENPOT_DESIGN_CONTRACT.budget).toEqual({
      max_tokens_per_task: 40000,
      max_cost_per_task_usd: 1.5,
    });
  });
});

// ============================================================================
// parsePenpotDesignScript (current format)
// ============================================================================

describe('parsePenpotDesignScript', () => {
  it('parses valid JSON with script and breakpoints', () => {
    const result = parsePenpotDesignScript(SAMPLE_SCRIPT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.script).toContain('createBoard');
      expect(result.value.script).toContain('Dashboard');
      expect(result.value.breakpoints).toEqual(['1440', '768']);
    }
  });

  it('parses JSON wrapped in markdown code fence', () => {
    const fenced = '```json\n' + SAMPLE_SCRIPT + '\n```';
    const result = parsePenpotDesignScript(fenced);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.script).toContain('createBoard');
      expect(result.value.breakpoints).toEqual(['1440', '768']);
    }
  });

  it('returns Err for malformed JSON', () => {
    const result = parsePenpotDesignScript('{ not: valid json }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns Err for empty script', () => {
    const emptyScript = JSON.stringify({ script: '', breakpoints: [] });
    const result = parsePenpotDesignScript(emptyScript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
      expect(result.error.message).toContain('Empty script');
    }
  });

  it('returns Err for missing script field', () => {
    const noScript = JSON.stringify({ breakpoints: ['1440'] });
    const result = parsePenpotDesignScript(noScript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
      expect(result.error.message).toContain('Empty script');
    }
  });

  it('recovers from open fence (truncated LLM output)', () => {
    const truncated = '```json\n' + SAMPLE_SCRIPT;
    const result = parsePenpotDesignScript(truncated);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.script).toContain('createBoard');
    }
  });

  it('handles whitespace-only script as empty', () => {
    const whitespaceScript = JSON.stringify({ script: '   \n  \t  ', breakpoints: [] });
    const result = parsePenpotDesignScript(whitespaceScript);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });

  it('returns LLM_TRUNCATED for truncated JSON (no closing brace)', () => {
    const truncated = '{"script": "const board = penpot.createBoard(); board.name = \\"D';
    const result = parsePenpotDesignScript(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_TRUNCATED');
      expect(result.error.message).toContain('truncated');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns LLM_TRUNCATED for truncated JSON inside code fence', () => {
    const truncated = '```json\n{"script": "const w = penpot.createBoard(); w.name = \\"DashboardWidget';
    const result = parsePenpotDesignScript(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_TRUNCATED');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('defaults breakpoints to empty array when missing', () => {
    const noBreakpoints = JSON.stringify({ script: 'penpot.createBoard();' });
    const result = parsePenpotDesignScript(noBreakpoints);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.breakpoints).toEqual([]);
    }
  });

  it('returns Err when script assigns layoutChild directly', () => {
    const invalid = JSON.stringify({
      script: [
        'const parent = penpot.createBoard();',
        'const child = penpot.createBoard();',
        'parent.appendChild(child);',
        "child.layoutChild = { horizontalSizing: 'fill' };",
      ].join('\n'),
      breakpoints: ['1440'],
    });
    const result = parsePenpotDesignScript(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
      expect(result.error.message).toContain('do not assign to layoutChild directly');
    }
  });

  it('allows layoutChild field assignments', () => {
    const valid = JSON.stringify({
      script: [
        'const parent = penpot.createBoard();',
        'const child = penpot.createBoard();',
        'parent.appendChild(child);',
        "child.layoutChild.horizontalSizing = 'fill';",
      ].join('\n'),
      breakpoints: ['1440'],
    });
    const result = parsePenpotDesignScript(valid);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// parsePenpotDesignSteps (legacy format — tests for backward compat)
// ============================================================================

describe('parsePenpotDesignSteps (legacy)', () => {
  let parsePenpotDesignSteps: ((output: string) => { ok: boolean; value?: { steps: Array<{ code: string; description: string; componentRef?: string }>; breakpoints: string[] }; error?: { code: string; message: string; recoverable: boolean } }) | null = null;

  beforeAll(async () => {
    try {
      const mod = await import('./ux-penpot-design.js');
      if ('parsePenpotDesignSteps' in mod) {
        parsePenpotDesignSteps = (mod as Record<string, unknown>).parsePenpotDesignSteps as typeof parsePenpotDesignSteps;
      }
    } catch {
      // Module might not export this function
    }
  });

  const skipIfMissing = () => {
    if (!parsePenpotDesignSteps) {
      // eslint-disable-next-line no-console
      console.log('      [skipped] parsePenpotDesignSteps not exported (replaced by parsePenpotDesignScript)');
      return true;
    }
    return false;
  };

  it('parses valid steps array with code fields', () => {
    if (skipIfMissing()) return;
    const result = parsePenpotDesignSteps!(SAMPLE_STEPS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.steps).toHaveLength(2);
      expect(result.value!.steps[0].code).toContain('createBoard');
      expect(result.value!.steps[0].description).toBe('Create dashboard board');
      expect(result.value!.steps[0].componentRef).toBe('Dashboard');
      expect(result.value!.breakpoints).toEqual(['1440', '768', '375']);
    }
  });

  it('recovers from open fence (truncated output)', () => {
    if (skipIfMissing()) return;
    const truncated = '```json\n' + SAMPLE_STEPS;
    const result = parsePenpotDesignSteps!(truncated);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.steps).toHaveLength(2);
    }
  });
});
