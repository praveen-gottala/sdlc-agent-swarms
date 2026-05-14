/**
 * @module single-shot-spike
 *
 * Task 1.1s: Validate single-shot structured patch approach.
 * Sends 3 representative chat messages + real DesignSpec to the LLM,
 * checks if valid patches are returned.
 *
 * Requires Vertex AI ADC or ANTHROPIC_API_KEY. Skipped in CI.
 * Run manually: RUN_LLM_TESTS=true npx jest --testPathPattern=single-shot-spike --no-cache
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DesignSpecPatchSchema } from '../types.js';
import { sanitizePatches } from '../../ux-design/browser-correction-adapter.js';
import { createClaudeProvider, resolveClaudeAuth, authResultToProviderConfig } from '@agentforge/providers';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';

const FIXTURE_PATH = join(__dirname, '..', '..', '..', '..', '..', 'fixtures', 'claim-filling-sample', 'agentforge', 'designs', 'dashboard.json');

const SYSTEM_PROMPT = `You are a design patch generator. Given a DesignSpec JSON and a user's change request,
return a JSON object with exactly two fields: "patches" and "reasoning".

RULES:
- "patches" is an object map: { "<nodeId>": { /* partial NodeSpec fields */ } }
- Each patch is shallow-merged into the existing NodeSpec for that node
- ONLY include fields you want to CHANGE — omit fields you don't want to touch
- Use exact node IDs from the spec — do NOT invent new ones
- Dimensions: positive numbers or "fill" for width
- Colors: use semantic token names (e.g., "cta-primary") not hex values
- Layout changes: include "dir" field when setting layout
- Include "reasoning" explaining your changes

Respond ONLY with the JSON object. No markdown fences, no extra text.`;

const TEST_MESSAGES = [
  'Change the header background color to blue',
  'Add a search bar below the navigation',
  'Make the card grid use 3 columns instead of 2',
];

const hasAuth = (): boolean => {
  const auth = resolveClaudeAuth();
  return auth !== null;
};

const describeIfAuth = (hasAuth() && process.env.RUN_LLM_TESTS === 'true') ? describe : describe.skip;

describeIfAuth('Task 1.1s — single-shot patch spike (@spike)', () => {
  let spec: DesignSpecV2;
  let nodeIds: string[];

  beforeAll(() => {
    const raw = readFileSync(FIXTURE_PATH, 'utf-8');
    spec = JSON.parse(raw) as DesignSpecV2;
    nodeIds = Object.keys(spec.nodes);
  });

  const results: Array<{ message: string; passed: boolean; detail: string }> = [];

  afterAll(() => {
    console.log('\n=== SPIKE RESULTS ===');
    for (const r of results) {
      console.log(`  ${r.passed ? '✓' : '✗'} "${r.message}" — ${r.detail}`);
    }
    const passCount = results.filter(r => r.passed).length;
    console.log(`\n  ${passCount}/${results.length} passed (threshold: 2/${results.length})`);
    console.log(`  Verdict: ${passCount >= 2 ? 'PASS — proceed with single-shot FeedbackAdapter' : 'FAIL — consider multi-turn'}`);
    console.log('=====================\n');
  });

  for (let i = 0; i < TEST_MESSAGES.length; i++) {
    const message = TEST_MESSAGES[i];

    it(`message ${i + 1}: "${message}"`, async () => {
      const auth = resolveClaudeAuth()!;
      const config = authResultToProviderConfig(auth);
      const provider = createClaudeProvider('claude-sonnet-4-6', config);

      const specJson = JSON.stringify(spec, null, 2);
      const userMessage = `Current DesignSpec (${nodeIds.length} nodes):\n\n${specJson}\n\nUser request: ${message}`;

      const result = await provider.complete(
        { system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }] },
        { model: 'claude-sonnet-4-6', maxTokens: 4096, temperature: 0 },
      );

      if (!result.ok) {
        results.push({ message, passed: false, detail: `LLM error: ${(result.error as { code?: string }).code}` });
        expect(result.ok).toBe(true);
        return;
      }

      const content = result.value.content.trim();
      let parsed: unknown;
      try {
        const cleaned = content.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
        parsed = JSON.parse(cleaned);
      } catch {
        results.push({ message, passed: false, detail: `JSON parse failed: ${content.slice(0, 100)}` });
        expect(parsed).toBeDefined();
        return;
      }

      const zodResult = DesignSpecPatchSchema.safeParse(parsed);
      if (!zodResult.success) {
        results.push({ message, passed: false, detail: `Zod validation failed: ${zodResult.error.message}` });
        expect(zodResult.success).toBe(true);
        return;
      }

      const patch = zodResult.data;
      const patchNodeIds = Object.keys(patch.patches);

      const validNodeIds = patchNodeIds.filter(id => nodeIds.includes(id));
      if (validNodeIds.length === 0) {
        results.push({ message, passed: false, detail: `No valid node IDs. Got: ${patchNodeIds.join(', ')}` });
        expect(validNodeIds.length).toBeGreaterThan(0);
        return;
      }

      const sanitized = sanitizePatches(patch.patches as Record<string, Record<string, unknown>>);
      const sanitizedCount = Object.keys(sanitized).length;

      if (sanitizedCount === 0) {
        results.push({ message, passed: false, detail: `All patches dropped by sanitizePatches. Pre-sanitize: ${patchNodeIds.length}` });
        expect(sanitizedCount).toBeGreaterThan(0);
        return;
      }

      results.push({
        message,
        passed: true,
        detail: `${sanitizedCount} node(s) patched. Reasoning: ${patch.reasoning.slice(0, 80)}...`,
      });

      expect(sanitizedCount).toBeGreaterThan(0);
    }, 60_000);
  }
});
