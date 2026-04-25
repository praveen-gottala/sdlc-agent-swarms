/**
 * callClaudeDesignAPI existence + Chrome-Pass-absence pin.
 *
 * PLAN DEVIATION: The carry-on plan (carry-on-with-phase-frolicking-peach.md:133)
 * promised a character-identical prompt comparison between browserDesignWork and
 * callClaudeDesignAPI. This could not be implemented because dashboard's Jest env
 * cannot resolve the @agentforge/agents-ux → @agentforge/core ESM import chain
 * (moduleNameMapper's .js rewrite only fires for same-package relative imports;
 * core's internal .js imports in scaffolding/scaffold-project.ts are never rewritten).
 * See docs/lessons-learned.md § "Cross-package ESM imports break Dashboard Jest".
 *
 * What we test instead:
 *   - callClaudeDesignAPI still exists (Phase 3.2 deletes it)
 *   - callClaudeDesignAPI source has no Chrome Pass parameters
 *   - Structural differences documented for Phase 3 implementer
 *
 * What Phase 3 must do before deleting callClaudeDesignAPI:
 *   Manually run browserDesignWork with chromePass: undefined against the same
 *   fixture and diff the user message against callClaudeDesignAPI's output.
 *
 * The real prompt-content assertions (9 tests) live in agents-ux:
 *   packages/agents-ux/src/design-pipeline/__tests__/browser-design-work.test.ts
 */

describe('callClaudeDesignAPI existence + Chrome-Pass-absence pin (Phase 3.2 deletes this)', () => {
  it('pipeline-helpers.ts exports callClaudeDesignAPI', () => {
    // Use requireActual to inspect exports without triggering the ESM chain
    // jest.requireActual resolves the module but may fail on ESM — if so,
    // fall back to verifying the file exists on disk.
    const { existsSync } = require('fs');
    const { join } = require('path');

    const helpersPath = join(__dirname, '..', 'pipeline-helpers.ts');
    expect(existsSync(helpersPath)).toBe(true);

    // Verify callClaudeDesignAPI is defined in the source
    const source = require('fs').readFileSync(helpersPath, 'utf-8');
    expect(source).toContain('export async function callClaudeDesignAPI');
    expect(source).toContain('MAX_EMPTY_NODES_RETRIES');
  });

  it('callClaudeDesignAPI has NO Chrome Pass support in source', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'pipeline-helpers.ts'),
      'utf-8',
    );

    // Extract only callClaudeDesignAPI function body
    const fnStart = source.indexOf('export async function callClaudeDesignAPI');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, fnStart + 2000);

    // No Chrome Pass parameters
    expect(fnBody).not.toContain('chromeOnly');
    expect(fnBody).not.toContain('frozenChromeSpec');
    expect(fnBody).not.toContain('frozenChromePageId');

    // Uses temperature 0.7 (vs browserDesignWork's 0)
    expect(fnBody).toContain('temperature: 0.7');

    // Uses maxTokens 64000 (vs browserDesignWork's 32000)
    expect(fnBody).toContain('64000');
  });

  // Structural differences for Phase 3 implementer:
  //   callClaudeDesignAPI: temperature=0.7, maxTokens=64000, simple system prompt
  //   browserDesignWork:   temperature=0,   maxTokens=32000, richer template prompt
  // Content verification: agents-ux/src/design-pipeline/__tests__/browser-design-work.test.ts
});
