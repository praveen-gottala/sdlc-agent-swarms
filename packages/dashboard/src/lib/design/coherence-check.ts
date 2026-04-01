/**
 * @module coherence-check
 *
 * Zero-LLM-cost coherence checker: validates approved designs against their spec.
 * Flags gaps in navigation wiring and data model field usage.
 * Pure structural string-matching — no I/O, no network calls.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface PageInfo {
  id: string;
  name: string;
  route: string;
}

export interface NavigationCoverage {
  expectedPages: PageInfo[];
  foundPages: PageInfo[];
  missingPages: PageInfo[];
}

export interface DataFieldCoverage {
  modelName: string;
  expectedFields: string[];
  foundFields: string[];
  missingFields: string[];
}

export interface CoherenceResult {
  pageId: string;
  pageName: string;
  navigationCoverage: NavigationCoverage;
  dataFieldCoverage: DataFieldCoverage[];
}

/** Minimal node shape we inspect — matches NodeSpec fields we care about. */
interface NodeLike {
  label?: string;
  content?: string;
  title?: string;
  value?: string | number;
  placeholder?: string;
  helper?: string;
  items?: readonly Record<string, unknown>[];
}

/** Minimal model shape. */
interface ModelLike {
  name: string;
  fields: readonly { name: string }[];
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Collect all text strings from a design's nodes (flat adjacency map). */
function collectNodeTexts(nodes: Record<string, NodeLike>): string[] {
  const texts: string[] = [];
  for (const node of Object.values(nodes)) {
    if (typeof node.label === 'string') texts.push(node.label);
    if (typeof node.content === 'string') texts.push(node.content);
    if (typeof node.title === 'string') texts.push(node.title);
    if (typeof node.value === 'string') texts.push(node.value);
    if (typeof node.placeholder === 'string') texts.push(node.placeholder);
    if (typeof node.helper === 'string') texts.push(node.helper);
  }
  return texts;
}

/** Collect all keys that appear in `items` arrays across all nodes. */
function collectItemKeys(nodes: Record<string, NodeLike>): string[] {
  const keys = new Set<string>();
  for (const node of Object.values(nodes)) {
    if (!Array.isArray(node.items)) continue;
    for (const item of node.items) {
      if (item && typeof item === 'object') {
        for (const key of Object.keys(item)) {
          keys.add(key);
        }
      }
    }
  }
  return Array.from(keys);
}

/** Extract last path segment from a route, e.g. "/spending/insights" -> "insights". */
function lastSegment(route: string): string {
  const parts = route.replace(/^\/+|\/+$/g, '').split('/');
  return parts[parts.length - 1] ?? '';
}

/** Convert snake_case to Title Case: "payment_method" -> "Payment Method". */
function snakeToTitleCase(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Convert snake_case to camelCase: "payment_method" -> "paymentMethod". */
function snakeToCamelCase(s: string): string {
  const parts = s.split('_');
  return parts[0] + parts.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Case-insensitive substring check. */
function containsCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ── Main Check ─────────────────────────────────────────────────────────

/**
 * Check navigation coverage for a single page's design.
 *
 * Heuristic: for each OTHER page, check if any node text contains the page
 * name or route's last segment (case-insensitive substring).
 * Best-effort — not exhaustive.
 */
function checkNavigation(
  nodes: Record<string, NodeLike>,
  currentPageId: string,
  allPages: PageInfo[],
): NavigationCoverage {
  const expectedPages = allPages.filter((p) => p.id !== currentPageId);
  const texts = collectNodeTexts(nodes);

  const foundPages: PageInfo[] = [];
  const missingPages: PageInfo[] = [];

  for (const page of expectedPages) {
    const segment = lastSegment(page.route);
    const matched = texts.some(
      (t) =>
        containsCI(t, page.name) ||
        (segment.length >= 3 && containsCI(t, segment)),
    );
    if (matched) {
      foundPages.push(page);
    } else {
      missingPages.push(page);
    }
  }

  return { expectedPages, foundPages, missingPages };
}

/**
 * Check data field coverage for a single page's design.
 *
 * For each model, checks whether the field name appears in any node text
 * or items key — trying exact, snake_case→Title Case, and snake_case→camelCase.
 */
function checkDataFields(
  nodes: Record<string, NodeLike>,
  models: ModelLike[],
): DataFieldCoverage[] {
  const texts = collectNodeTexts(nodes);
  const itemKeys = collectItemKeys(nodes);

  // Combine texts and item keys into a single searchable pool
  const allSearchable = [...texts, ...itemKeys];

  return models.map((model) => {
    const expectedFields = model.fields.map((f) => f.name);
    const foundFields: string[] = [];
    const missingFields: string[] = [];

    for (const fieldName of expectedFields) {
      const variants = [
        fieldName,
        snakeToTitleCase(fieldName),
        snakeToCamelCase(fieldName),
      ];

      const matched = allSearchable.some((s) =>
        variants.some((v) => containsCI(s, v)),
      );

      if (matched) {
        foundFields.push(fieldName);
      } else {
        missingFields.push(fieldName);
      }
    }

    return { modelName: model.name, expectedFields, foundFields, missingFields };
  });
}

/**
 * Run coherence checks for a single page design.
 *
 * @param pageId - The page being checked
 * @param pageName - Display name for the page
 * @param nodes - DesignSpec v2 nodes (Record<string, NodeSpec>)
 * @param allPages - All pages in the project (for navigation cross-check)
 * @param models - All data models (for field coverage check)
 */
export function checkCoherence(
  pageId: string,
  pageName: string,
  nodes: Record<string, NodeLike>,
  allPages: PageInfo[],
  models: ModelLike[],
): CoherenceResult {
  return {
    pageId,
    pageName,
    navigationCoverage: checkNavigation(nodes, pageId, allPages),
    dataFieldCoverage: checkDataFields(nodes, models),
  };
}
