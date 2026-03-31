import { DesignSpec, DesignSpecNode, SEMANTIC_TOKENS, TYPOGRAPHY, SHADOW } from "./types.js";

// ── Token resolution ──────────────────────────────────────────────────

function resolveColor(token: string | undefined): string {
  if (!token) return "transparent";
  if (token === "transparent") return "transparent";
  if (token.startsWith("#") || token.startsWith("rgb")) return token;
  return SEMANTIC_TOKENS[token] ?? "#FF00FF"; // magenta = unresolved token (visible debugging)
}

function resolveShadow(shadow: string | undefined): string {
  if (!shadow) return "none";
  return SHADOW[shadow] ?? "none";
}

// ── Catalog component approximation ───────────────────────────────────
// These produce representative HTML that mimics the sizing behavior of
// real shadcn components — enough for mechanical checking to work.

function renderCatalog(nodeId: string, node: DesignSpecNode): string {
  const catalog = node.catalog ?? "";
  const label = node.label ?? "";
  const value = node.value ?? "";

  if (catalog.startsWith("button")) {
    const bgToken = catalog === "button-destructive" ? "error"
      : catalog === "button-secondary" ? "surface-primary"
      : "cta-primary";
    const textToken = catalog === "button-secondary" ? "text-primary" : "text-on-cta";
    const border = catalog === "button-secondary" ? `border: 1px solid ${resolveColor("border-default")};` : "";
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      display: inline-flex; align-items: center; justify-content: center;
      padding: 8px 16px; border-radius: 10px; min-height: 44px;
      background: ${resolveColor(bgToken)}; color: ${resolveColor(textToken)};
      font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500;
      white-space: nowrap; ${border} cursor: pointer;
    ">${escapeHtml(label)}</div>`;
  }

  if (catalog.startsWith("badge")) {
    // Badges: compact pill. This is what the checker validates.
    const variant = catalog.replace("badge-", "").replace("badge", "");
    const bgToken = variant === "success" ? "success"
      : variant === "warning" ? "warning"
      : variant === "error" ? "error"
      : variant === "info" ? "info"
      : "surface-secondary";
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      display: inline-flex; align-items: center;
      padding: 2px 8px; border-radius: 9999px;
      background: ${resolveColor(bgToken)}20; color: ${resolveColor(bgToken)};
      font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 400;
      white-space: nowrap;
    ">${escapeHtml(label)}</div>`;
  }

  if (catalog === "avatar") {
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
      background: ${resolveColor("surface-elevated")};
      display: flex; align-items: center; justify-content: center;
      font-family: 'DM Sans', sans-serif; font-size: 14px; color: ${resolveColor("text-primary")};
    ">AJ</div>`;
  }

  if (catalog === "chip") {
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      display: inline-flex; align-items: center;
      padding: 4px 12px; border-radius: 10px; min-height: 44px;
      background: ${resolveColor("surface-secondary")}; color: ${resolveColor("text-primary")};
      border: 1px solid ${resolveColor("border-default")};
      font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500;
      white-space: nowrap;
    ">${escapeHtml(label)}</div>`;
  }

  if (catalog === "stat") {
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      display: flex; flex-direction: column; gap: 4px; padding: 16px;
      background: ${resolveColor("surface-primary")}; border-radius: 10px;
      ${node.width === "fill" ? "flex: 1;" : node.width ? `width: ${node.width}px;` : ""}
    ">
      <span style="font-family: 'DM Mono', monospace; font-size: 12px; color: ${resolveColor("text-secondary")};">${escapeHtml(label)}</span>
      <span style="font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 600; color: ${resolveColor("text-primary")};">${escapeHtml(value)}</span>
    </div>`;
  }

  if (catalog === "search-input") {
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; border-radius: 10px; min-height: 44px;
      background: ${resolveColor("surface-secondary")}; border: 1px solid ${resolveColor("border-default")};
      ${node.width === "fill" ? "flex: 1;" : node.width ? `width: ${node.width}px;` : ""}
    ">
      <span style="font-family: 'DM Mono', monospace; font-size: 14px; color: ${resolveColor("text-secondary")};">Search…</span>
    </div>`;
  }

  if (catalog === "pagination") {
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      display: flex; align-items: center; gap: 4px;
    ">
      <span style="padding: 4px 8px; font-size: 12px; color: ${resolveColor("text-secondary")};">‹</span>
      <span style="padding: 4px 8px; font-size: 12px; background: ${resolveColor("cta-primary")}; color: ${resolveColor("text-on-cta")}; border-radius: 6px;">1</span>
      <span style="padding: 4px 8px; font-size: 12px; color: ${resolveColor("text-secondary")};">2</span>
      <span style="padding: 4px 8px; font-size: 12px; color: ${resolveColor("text-secondary")};">›</span>
    </div>`;
  }

  if (catalog === "progress-bar-active") {
    return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
      width: 100%; height: 8px; border-radius: 4px;
      background: ${resolveColor("surface-secondary")};
    ">
      <div style="width: 65%; height: 100%; border-radius: 4px; background: ${resolveColor("cta-primary")};"></div>
    </div>`;
  }

  // Fallback for unknown catalog — render as a labeled box
  return `<div data-node="${nodeId}" data-catalog="${catalog}" style="
    display: inline-flex; align-items: center; padding: 4px 8px;
    background: ${resolveColor("surface-secondary")}; border-radius: 6px;
    font-size: 11px; color: ${resolveColor("text-secondary")};
  ">[${escapeHtml(catalog)}] ${escapeHtml(label)}</div>`;
}

// ── Layout node rendering ─────────────────────────────────────────────

function renderNode(nodeId: string, node: DesignSpecNode, children: string[]): string {
  // Catalog components are leaf nodes — render directly
  if (node.catalog) {
    return renderCatalog(nodeId, node);
  }

  const type = node.type ?? "container";

  // Text nodes
  if (type === "text") {
    const typo = TYPOGRAPHY[node.typography ?? "body"] ?? TYPOGRAPHY.body;
    const weight = node.weight ?? typo.weight;
    return `<span data-node="${nodeId}" style="
      font-family: ${typo.family}; font-size: ${typo.size}px;
      font-weight: ${weight}; line-height: ${typo.lineHeight};
      color: ${resolveColor(node.color)};
    ">${escapeHtml(node.content ?? "")}</span>`;
  }

  // Divider
  if (type === "divider") {
    const w = node.width === "fill" ? "100%" : node.width ? `${node.width}px` : "100%";
    const h = node.height ? `${node.height}px` : "1px";
    return `<div data-node="${nodeId}" style="
      width: ${w}; height: ${h};
      background: ${resolveColor(node.background)};
      flex-shrink: 0;
    "></div>`;
  }

  // Container-type nodes (page, header, container, section)
  const layout = node.layout ?? {};
  const dir = layout.dir ?? "column";
  const gap = layout.gap ?? 0;
  const align = layout.align ?? "stretch";
  const justify = layout.justify ?? "flex-start";
  const px = layout.px ?? 0;
  const py = layout.py ?? 0;

  const width = node.width === "fill" ? "flex: 1; min-width: 0;"
    : typeof node.width === "number" ? `width: ${node.width}px;`
    : "";
  const height = node.height ? `height: ${node.height}px;` : "";
  const radius = node.radius ? `border-radius: ${node.radius}px;` : "";
  const bg = node.background ? `background: ${resolveColor(node.background)};` : "";
  const border = node.border ? `border: 1px solid ${resolveColor(node.border)};` : "";
  const shadow = node.shadow ? `box-shadow: ${resolveShadow(node.shadow)};` : "";

  return `<div data-node="${nodeId}" style="
    display: flex; flex-direction: ${dir}; gap: ${gap}px;
    align-items: ${align}; justify-content: ${justify};
    padding: ${py}px ${px}px;
    ${width} ${height} ${radius} ${bg} ${border} ${shadow}
    box-sizing: border-box; min-width: 0;
  ">${children.join("\n")}</div>`;
}

// ── Tree assembly ─────────────────────────────────────────────────────

export function renderToHtml(spec: DesignSpec): string {
  const nodes = spec.nodes;

  // Build parent → children map
  const childMap: Record<string, { id: string; order: number }[]> = {};
  let rootId: string | null = null;

  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent === null) {
      rootId = id;
    } else {
      if (!childMap[node.parent]) childMap[node.parent] = [];
      childMap[node.parent].push({ id, order: node.order });
    }
  }

  if (!rootId) throw new Error("No root node found");

  // Recursive render
  function build(nodeId: string): string {
    const node = nodes[nodeId];
    const kids = (childMap[nodeId] ?? [])
      .sort((a, b) => a.order - b.order)
      .map((c) => build(c.id));
    return renderNode(nodeId, node, kids);
  }

  const tree = build(rootId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${spec.width}">
  <title>DesignSpec — ${spec.screen}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${spec.width}px; min-height: 100vh; overflow-x: hidden; }
    body { background: ${resolveColor("background-primary")}; }
  </style>
</head>
<body>
  ${tree}
  <script>
    // Signal to Playwright that rendering is complete
    window.__DESIGNSPEC_READY__ = true;
    document.dispatchEvent(new CustomEvent('designspec:ready'));
  </script>
</body>
</html>`;
}

// ── Utility ───────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
