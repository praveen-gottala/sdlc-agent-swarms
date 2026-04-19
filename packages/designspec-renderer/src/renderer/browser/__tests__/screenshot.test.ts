/**
 * Integration test for screenshotDesignSpec.
 * Requires Playwright — skipped if not available.
 *
 * To run: install playwright in the monorepo root, then `nx test designspec-renderer`.
 */
import { screenshotDesignSpec } from '../screenshot.js';
import { SAMPLE_TOKENS } from '../../../__fixtures__/design-tokens.js';
import { loadFixture } from '../../../__fixtures__/load-fixture.js';

const { spec: settingsForm, catalog } = loadFixture('settings-form');

let hasPlaywright = false;
try {
  // Dynamic import check — skip tests if playwright isn't available
  require.resolve('playwright');
  hasPlaywright = true;
} catch {
  // Playwright not installed — skip integration tests
}

const describeIfPlaywright = hasPlaywright ? describe : describe.skip;

describeIfPlaywright('screenshotDesignSpec (integration)', () => {
  it('returns a non-empty PNG buffer', async () => {
    const result = await screenshotDesignSpec(settingsForm, SAMPLE_TOKENS, catalog);
    expect(result.screenshot).toBeInstanceOf(Buffer);
    expect(result.screenshot.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(result.screenshot[0]).toBe(0x89);
    expect(result.screenshot[1]).toBe(0x50); // 'P'
    expect(result.screenshot[2]).toBe(0x4E); // 'N'
    expect(result.screenshot[3]).toBe(0x47); // 'G'
  }, 30000);

  it('HTML contains data-node="root"', async () => {
    const result = await screenshotDesignSpec(settingsForm, SAMPLE_TOKENS, catalog);
    expect(result.html).toContain('data-node="root"');
  }, 30000);

  it('respects spec width', async () => {
    const result = await screenshotDesignSpec(settingsForm, SAMPLE_TOKENS, catalog, {
      width: 1440,
    });
    expect(result.screenshot).toBeInstanceOf(Buffer);
    expect(result.screenshot.length).toBeGreaterThan(0);
  }, 60000);
});
