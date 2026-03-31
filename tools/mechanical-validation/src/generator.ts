import Anthropic from "@anthropic-ai/sdk";
import { DesignSpec, DesignSpecNode, VALID_CATALOG, SEMANTIC_TOKENS, PromptSpec } from "./types.js";
import { BASE_SYSTEM } from "./prompts.js";

const client = new Anthropic();

// ── Generation ────────────────────────────────────────────────────────

export async function generateTestCase(prompt: PromptSpec): Promise<{ spec: DesignSpec | null; raw: string; error?: string }> {
  const systemPrompt = `${BASE_SYSTEM}\n\n${prompt.systemSuffix}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Generate a DesignSpec JSON fragment for: ${prompt.bias}. Return ONLY the JSON.`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Strip markdown fences if the LLM adds them despite instructions
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as DesignSpec;
    const validation = validate(parsed);

    if (!validation.valid) {
      return { spec: null, raw: cleaned, error: `Validation: ${validation.errors.join("; ")}` };
    }

    return { spec: parsed, raw: cleaned };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { spec: null, raw: "", error: `Generation failed: ${msg}` };
  }
}

// ── Validation ────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validate(spec: unknown): ValidationResult {
  const errors: string[] = [];

  if (!spec || typeof spec !== "object") {
    return { valid: false, errors: ["Not an object"] };
  }

  const s = spec as Record<string, unknown>;

  // Top-level structure
  if (typeof s.screen !== "string") errors.push("Missing or invalid 'screen'");
  if (typeof s.width !== "number") errors.push("Missing or invalid 'width'");
  if (!s.nodes || typeof s.nodes !== "object") {
    return { valid: false, errors: [...errors, "Missing 'nodes' object"] };
  }

  const nodes = s.nodes as Record<string, unknown>;
  const nodeIds = new Set(Object.keys(nodes));

  // Must have at least 1 node
  if (nodeIds.size === 0) {
    errors.push("No nodes");
    return { valid: false, errors };
  }

  // Exactly one root (parent: null)
  let rootCount = 0;
  const validTypes = new Set(["page", "header", "container", "section", "text", "divider"]);
  const validCatalog = new Set(VALID_CATALOG as unknown as string[]);
  const validTokens = new Set(Object.keys(SEMANTIC_TOKENS));

  // Track children per parent for order uniqueness
  const childOrders: Record<string, number[]> = {};

  for (const [nodeId, nodeRaw] of Object.entries(nodes)) {
    if (!nodeRaw || typeof nodeRaw !== "object") {
      errors.push(`Node '${nodeId}': not an object`);
      continue;
    }

    const node = nodeRaw as Record<string, unknown>;

    // Parent reference
    if (node.parent === null || node.parent === undefined) {
      rootCount++;
    } else if (typeof node.parent !== "string" || !nodeIds.has(node.parent)) {
      errors.push(`Node '${nodeId}': parent '${node.parent}' does not exist`);
    }

    // Order
    if (typeof node.order !== "number") {
      errors.push(`Node '${nodeId}': missing 'order'`);
    }

    // Track sibling order uniqueness
    const parentKey = node.parent === null ? "__root__" : String(node.parent);
    if (!childOrders[parentKey]) childOrders[parentKey] = [];
    childOrders[parentKey].push(node.order as number);

    // Must have either type or catalog, not both
    const hasType = "type" in node;
    const hasCatalog = "catalog" in node;

    if (!hasType && !hasCatalog) {
      errors.push(`Node '${nodeId}': must have 'type' or 'catalog'`);
    }

    if (hasType && hasCatalog) {
      // Warn but don't reject — some LLMs do this
    }

    // Validate type if present
    if (hasType && typeof node.type === "string" && !validTypes.has(node.type)) {
      errors.push(`Node '${nodeId}': invalid type '${node.type}'`);
    }

    // Validate catalog if present — warn on unknown but don't hard-reject
    // (this simulates the fuzzy-match scenario)
    if (hasCatalog && typeof node.catalog === "string" && !validCatalog.has(node.catalog)) {
      errors.push(`Node '${nodeId}': unknown catalog '${node.catalog}' (not in valid list)`);
    }

    // Validate token references (soft — warn, don't reject)
    for (const field of ["background", "color", "border"] as const) {
      const val = node[field];
      if (typeof val === "string" && val !== "transparent" && !validTokens.has(val)) {
        // Don't hard-reject — the LLM might use a close variant
      }
    }
  }

  if (rootCount === 0) errors.push("No root node (parent: null)");
  if (rootCount > 1) errors.push(`Multiple root nodes: ${rootCount}`);

  // Check for duplicate orders among siblings
  for (const [parent, orders] of Object.entries(childOrders)) {
    const seen = new Set<number>();
    for (const o of orders) {
      if (seen.has(o)) {
        errors.push(`Duplicate order ${o} under parent '${parent}'`);
      }
      seen.add(o);
    }
  }

  // Node count bounds (soft — warn but allow)
  if (nodeIds.size < 3) {
    errors.push(`Only ${nodeIds.size} nodes — too small to be meaningful`);
  }

  return { valid: errors.length === 0, errors };
}
