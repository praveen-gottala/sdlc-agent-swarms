/**
 * Integration test for DOM extraction.
 * Requires Playwright — skipped if not available.
 */
import { openBrowserSession } from '../screenshot-session.js';
import { SAMPLE_TOKENS } from '../../../__fixtures__/design-tokens.js';
import { loadFixture } from '../../../__fixtures__/load-fixture.js';

const { spec: settingsForm, catalog } = loadFixture('settings-form');

let hasPlaywright = false;
try {
  require.resolve('playwright');
  hasPlaywright = true;
} catch {
  // Playwright not installed — skip integration tests
}

const describeIfPlaywright = hasPlaywright ? describe : describe.skip;

describeIfPlaywright('extractDOMLayout (integration)', () => {
  it('extracts all data-node elements with positive dimensions', async () => {
    const { session } = await openBrowserSession(settingsForm, SAMPLE_TOKENS, catalog);

    try {
      const dom = await session.extractDOM();

      // Should have nodes
      const nodeIds = Object.keys(dom.nodes);
      expect(nodeIds.length).toBeGreaterThan(0);

      // All spec node IDs should be present
      for (const id of Object.keys(settingsForm.nodes)) {
        expect(dom.nodes[id]).toBeDefined();
      }

      // All nodes should have positive dimensions (root at minimum)
      const root = dom.nodes['root'];
      expect(root).toBeDefined();
      expect(root.rect.width).toBeGreaterThan(0);
      expect(root.rect.height).toBeGreaterThan(0);

      // Viewport dimensions should be set
      expect(dom.viewportWidth).toBeGreaterThan(0);
      expect(dom.viewportHeight).toBeGreaterThan(0);

      // Parent-child relationships should be consistent
      for (const node of Object.values(dom.nodes)) {
        if (node.parentNodeId) {
          const parent = dom.nodes[node.parentNodeId];
          expect(parent).toBeDefined();
        }
        for (const childId of node.childNodeIds) {
          const child = dom.nodes[childId];
          expect(child).toBeDefined();
          expect(child.parentNodeId).toBe(node.nodeId);
        }
      }
    } finally {
      await session.close();
    }
  }, 30000);

  it('returns data-catalog attributes for catalog components', async () => {
    const { session } = await openBrowserSession(settingsForm, SAMPLE_TOKENS, catalog);

    try {
      const dom = await session.extractDOM();

      // At least some nodes should have data-catalog set
      const catalogNodes = Object.values(dom.nodes).filter(n => n.dataCatalog !== null);
      expect(catalogNodes.length).toBeGreaterThan(0);
    } finally {
      await session.close();
    }
  }, 30000);
});
