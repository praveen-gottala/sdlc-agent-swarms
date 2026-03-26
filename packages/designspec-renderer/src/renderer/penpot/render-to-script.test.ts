import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToScript } from './index.js';
import { SAMPLE_TOKENS } from '../../__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from '../../__fixtures__/catalog-entries.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';

const settingsForm: DesignSpecV2 = JSON.parse(
  readFileSync(join(__dirname, '../../../__tests__/fixtures/settings-form.json'), 'utf-8'),
);

const dashboardDetail: DesignSpecV2 = JSON.parse(
  readFileSync(join(__dirname, '../../../__tests__/fixtures/dashboard-detail.json'), 'utf-8'),
);

/* ------------------------------------------------------------------ */
/*  Settings-form integration tests (21 nodes)                        */
/* ------------------------------------------------------------------ */
describe('renderToScript — settings-form', () => {
  const result = renderToScript(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

  // 1. Output is non-empty string
  it('produces a non-empty script string', () => {
    expect(typeof result.script).toBe('string');
    expect(result.script.length).toBeGreaterThan(0);
  });

  // 2. Script is parseable
  it('produces a script that can be parsed by new Function()', () => {
    expect(() => new Function('penpot', result.script)).not.toThrow();
  });

  // 3. Contains penpot.createBoard() calls
  it('contains penpot.createBoard() calls for containers/page/header/sections', () => {
    const boardCalls = result.script.match(/penpot\.createBoard\(\)/g);
    expect(boardCalls).not.toBeNull();
    // At least: root (page), header, content, titleBlock, profileSection, prefsSection = 6+
    expect(boardCalls!.length).toBeGreaterThanOrEqual(6);
  });

  // 4. Contains makeText() calls
  it('contains makeText() calls for text nodes', () => {
    const textCalls = result.script.match(/makeText\(/g);
    expect(textCalls).not.toBeNull();
    // At least: logo, navHint, pageTitle, pageSubtitle + labels in inputs etc.
    expect(textCalls!.length).toBeGreaterThanOrEqual(4);
  });

  // 5. Contains token map
  it('contains the token color map declaration', () => {
    expect(result.script).toContain('const T = {');
  });

  // 6. Contains try/catch wrapper
  it('wraps the script in a try/catch block', () => {
    expect(result.script).toMatch(/^try \{/);
    expect(result.script).toContain('} catch (e) {');
  });

  // 7. Contains return statement with rootId and nodeIds
  it('contains a return statement with rootId and nodeIds', () => {
    expect(result.script).toContain('return {');
    expect(result.script).toContain('rootId:');
    expect(result.script).toContain('nodeIds:');
  });

  // 8. Logo text uses correct styling — heading-3 resolves to size 18, weight 700, cta-primary token
  it('renders the logo text with heading-3 font size (18), weight 700, and cta-primary color', () => {
    // The makeText call for "AppName" should use fontSize=18, fontWeight=700, T.ctaPrimary
    expect(result.script).toMatch(/makeText\("AppName",\s*18,\s*700,\s*T\.ctaPrimary/);
  });

  // 9. emailInput has overridden height — resize with 72
  it('renders emailInput with the overridden height of 72', () => {
    // The emailInput override sets height: 72, which should appear in a resize() call
    expect(result.script).toMatch(/resize\(\s*\d+,\s*72\s*\)/);
  });

  // 10. Every rendered node has setPluginData('ds_id', ...) calls
  it('emits setPluginData(ds_id) for every rendered node', () => {
    for (const nodeId of result.nodeIds) {
      expect(result.script).toContain(`setPluginData('ds_id', '${nodeId}')`);
    }
  });

  // 11. Colors are via token map, never raw hex (outside the T = {} block)
  it('does not contain raw hex color strings outside the token map block', () => {
    // Split on the end of the token map block (first `};` after `const T = {`)
    const tokenMapEnd = result.script.indexOf('};');
    expect(tokenMapEnd).toBeGreaterThan(-1);
    const afterTokenMap = result.script.slice(tokenMapEnd + 2);
    // Should not contain any '#XXXXXX' hex patterns (single-quoted hex refs)
    expect(afterTokenMap).not.toMatch(/'#[0-9A-Fa-f]{3,8}'/);
  });

  // 12. layoutChild always follows appendChild
  it('emits layoutChild within a few lines after every appendChild call', () => {
    const lines = result.script.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('.appendChild(')) {
        // Within the next 3 lines, there should be a layoutChild reference
        const window = lines.slice(i + 1, i + 4).join('\n');
        expect(window).toContain('.layoutChild.');
      }
    }
  });

  // 13. flex.dir uses board.flex.dir pattern (not bare `flex.dir =`)
  it('uses varName.flex.dir pattern for flex direction', () => {
    const flexDirMatches = result.script.match(/\.flex\.dir\s*=/g);
    expect(flexDirMatches).not.toBeNull();
    expect(flexDirMatches!.length).toBeGreaterThan(0);
    // Every flex.dir assignment should be preceded by a variable name (no bare `flex.dir`)
    // All occurrences should be `.flex.dir`, not standalone
    const dotFlexDir = result.script.match(/\w+\.flex\.dir\s*=/g);
    expect(dotFlexDir?.length).toBe(flexDirMatches!.length);
  });

  // 14. All node IDs from the fixture are in nodeIds
  it('includes all node IDs from the fixture in result.nodeIds', () => {
    const fixtureNodeIds = Object.keys(settingsForm.nodes);
    expect(result.nodeIds.length).toBe(fixtureNodeIds.length);
    for (const id of fixtureNodeIds) {
      expect(result.nodeIds).toContain(id);
    }
  });

  // 15. No warnings for valid input
  it('produces no warnings for a valid settings-form fixture', () => {
    expect(result.warnings).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Dashboard-detail scale test (72 nodes)                            */
/* ------------------------------------------------------------------ */
describe('renderToScript — dashboard-detail', () => {
  const result = renderToScript(dashboardDetail, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

  // 16. Renderer completes without errors
  it('completes rendering without throwing', () => {
    expect(result.script).toBeDefined();
    expect(typeof result.script).toBe('string');
    expect(result.script.length).toBeGreaterThan(0);
  });

  // 17. 4 card renderings — card0, card1, card2, card3
  it('renders all 4 cards (card0 through card3)', () => {
    for (const cardId of ['card0', 'card1', 'card2', 'card3']) {
      expect(result.script).toContain(`'${cardId}'`);
      expect(result.nodeIds).toContain(cardId);
    }
  });

  // 18. Multiple button variants — button-primary, button-secondary, button-ghost
  it('renders button-primary (View Details, Export Report), button-secondary (Edit Project), and button-ghost (New Project)', () => {
    // button-primary labels
    expect(result.script).toContain('View Details');
    expect(result.script).toContain('Export Report');
    // button-secondary label
    expect(result.script).toContain('Edit Project');
    // button-ghost label
    expect(result.script).toContain('New Project');
  });

  // 19. Badge with overrides — statusBadge rendered with badge catalog
  it('renders statusBadge with the badge catalog', () => {
    expect(result.nodeIds).toContain('statusBadge');
    expect(result.script).toContain("setPluginData('ds_catalog', 'badge')");
  });

  // 20. Long text gets auto-height — noticeText has 90+ chars
  it('applies auto-height for long noticeText content', () => {
    // The preamble makeText helper applies growType = 'auto-height' for long text (>18 chars)
    // The noticeText content is 100+ chars, so the makeText call should receive a wrapWidth
    // and the helper will set growType = 'auto-height'
    expect(result.script).toContain("growType = 'auto-height'");
  });

  // 21. All 72 nodes rendered
  it('renders all 72 nodes', () => {
    expect(result.nodeIds.length).toBe(72);
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling                                                     */
/* ------------------------------------------------------------------ */
describe('renderToScript — error handling', () => {
  // 22. Unknown catalog produces warning, falls back to container
  it('produces a warning and falls back to container for unknown catalog entries', () => {
    const spec: DesignSpecV2 = {
      screen: 'test-unknown-catalog',
      width: 1440,
      nodes: {
        root: {
          parent: null,
          order: 0,
          type: 'page',
          background: 'background-primary',
          layout: { dir: 'column', align: 'center' },
        },
        unknownWidget: {
          parent: 'root',
          order: 0,
          catalog: 'fancy-widget-9000',
          label: 'Mystery',
        },
      },
    };

    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    // Should not throw — rendering completes
    expect(result.script.length).toBeGreaterThan(0);

    // Should produce a warning mentioning the unknown catalog
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    const warningText = result.warnings.join(' ');
    expect(warningText).toContain('fancy-widget-9000');
    expect(warningText).toMatch(/falling back to container/i);

    // The node should still be rendered (as a container fallback)
    expect(result.nodeIds).toContain('unknownWidget');
  });
});
