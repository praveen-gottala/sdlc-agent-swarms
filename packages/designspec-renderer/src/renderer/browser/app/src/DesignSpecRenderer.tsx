/**
 * DesignSpecRenderer — renders a DesignSpec v2 JSON as actual React elements.
 * Uses shared utilities for tree building, node resolution, and token lookup.
 * Renders real shadcn/ui components for catalog entries.
 */
import React, { useEffect } from 'react';
import { buildTree } from '@shared/renderer/tree-builder';
import { resolveNode } from '@shared/catalog/resolver';
import { normalizeCatalogIdToKebab } from '@shared/catalog/catalog-id';
import { buildTokenMap } from '@shared/renderer/token-resolver';
import { resolveTypography } from '@shared/renderer/typography';
import { resolveShadow } from '@shared/renderer/shadows';
import type { DesignSpecV2, LayoutSpec } from '@shared/types/design-spec-v2';
import type { RendererTokens } from '@shared/types/tokens';
import type { CatalogMap, TreeNode, ResolvedNode } from '@shared/types/catalog';
import type { TokenColorMap } from '@shared/renderer/token-resolver';
import { getIconComponentName } from '@shared/icons/icon-map';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
// Full icon bundle is acceptable here because this browser app is a dev-time
// renderer used for design review, not production UI code.
import * as lucideIcons from 'lucide-react';

// ─── Props ──────────────────────────────────────────────

interface NavigationBinding {
  sourceNodeId: string;
  sourceScreenId: string;
  targetScreenId: string;
  reason: string;
  mode?: 'navigate' | 'overlay';
}

interface Props {
  spec: DesignSpecV2;
  tokens: RendererTokens;
  catalog: CatalogMap;
  onNavigate?: (screenId: string, mode?: 'navigate' | 'overlay') => void;
  navigationBindings?: readonly NavigationBinding[];
  /** When set, navigation bindings prefer this source screen for hotspot metadata (prototype). */
  prototypeScreenId?: string;
}

// ─── Component ──────────────────────────────────────────

export function DesignSpecRenderer({
  spec,
  tokens,
  catalog,
  onNavigate,
  navigationBindings,
  prototypeScreenId,
}: Props) {
  if (!spec?.nodes || typeof spec.nodes !== 'object' || Object.keys(spec.nodes).length === 0) {
    return (
      <div style={{ padding: 32, color: '#ef4444', fontFamily: 'monospace' }}>
        <h2>Design Spec Error</h2>
        <p>No nodes found in the design specification. The spec may have been truncated due to LLM token limits.</p>
        <p>Try regenerating the design or reducing page complexity.</p>
      </div>
    );
  }

  const tree = buildTree(spec.nodes);
  const tokenMap = buildTokenMap(tokens);

  const navMap = new Map<string, string>();
  // Populate from external bindings (prototype manifest)
  if (navigationBindings) {
    for (const binding of navigationBindings) {
      navMap.set(binding.sourceNodeId, binding.targetScreenId);
    }
  }
  // Populate from inline NodeSpec.navigateTo (spec-driven, takes precedence)
  for (const [nodeId, node] of Object.entries(spec.nodes)) {
    if (node.navigateTo) {
      navMap.set(nodeId, node.navigateTo);
    }
  }

  useEffect(() => {
    document.body.dataset.ready = 'true';
  }, []);

  return (
    <>
      {renderNode(tree, spec, tokens, catalog, tokenMap, onNavigate, navMap, navigationBindings, prototypeScreenId)}
    </>
  );
}

// ─── Helpers ────────────────────────────────────────────

function resolveTokenColor(
  token: string | undefined,
  tokenMap: TokenColorMap,
): string | undefined {
  if (!token) return undefined;
  if (token.startsWith('#')) return token;
  if (token === 'transparent') return 'transparent';
  return tokenMap[token];
}

/** Extract margin/padding spacing from layout — applicable to ANY node type. */
function getSpacingStyles(layout: LayoutSpec | undefined): React.CSSProperties {
  if (!layout) return {};
  const s: React.CSSProperties = {};
  if (layout.px !== undefined) { s.paddingLeft = layout.px; s.paddingRight = layout.px; }
  if (layout.py !== undefined) { s.paddingTop = layout.py; s.paddingBottom = layout.py; }
  if (layout.pt !== undefined) s.paddingTop = layout.pt;
  if (layout.pb !== undefined) s.paddingBottom = layout.pb;
  if (layout.mx !== undefined) { s.marginLeft = layout.mx; s.marginRight = layout.mx; }
  if (layout.my !== undefined) { s.marginTop = layout.my; s.marginBottom = layout.my; }
  if (layout.mt !== undefined) s.marginTop = layout.mt;
  if (layout.mb !== undefined) s.marginBottom = layout.mb;
  if (layout.ml !== undefined) s.marginLeft = layout.ml;
  if (layout.mr !== undefined) s.marginRight = layout.mr;
  return s;
}

function getLayoutStyles(layout: LayoutSpec | undefined): React.CSSProperties {
  if (!layout) return {};

  if (layout.display === 'grid' && layout.columns) {
    const s: React.CSSProperties = {
      display: 'grid',
      gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
    };
    if (layout.gap) s.gap = layout.gap;
    if (layout.align === 'center') s.alignItems = 'center';
    else if (layout.align === 'end') s.alignItems = 'end';
    else if (layout.align === 'stretch') s.alignItems = 'stretch';
    else if (layout.align === 'start') s.alignItems = 'start';
    Object.assign(s, getSpacingStyles(layout));
    return s;
  }

  const s: React.CSSProperties = {
    display: 'flex',
    flexDirection: layout.dir === 'row' ? 'row' : 'column',
  };
  if (layout.wrap) s.flexWrap = 'wrap';
  if (layout.gap) s.gap = layout.gap;
  if (layout.align === 'center') s.alignItems = 'center';
  else if (layout.align === 'end') s.alignItems = 'flex-end';
  else if (layout.align === 'stretch') s.alignItems = 'stretch';
  else if (layout.align === 'start') s.alignItems = 'flex-start';
  if (layout.justify === 'center') s.justifyContent = 'center';
  else if (layout.justify === 'space-between' || layout.justify === 'between') s.justifyContent = 'space-between';
  else if (layout.justify === 'end') s.justifyContent = 'flex-end';
  Object.assign(s, getSpacingStyles(layout));
  return s;
}

const SAFE_OVERRIDE_KEYS = new Set([
  // Sizing
  'max_width', 'maxWidth', 'min_width', 'minWidth',
  'max_height', 'maxHeight', 'min_height', 'minHeight',
  'height',
  'flex',
  // Spacing
  'padding', 'margin_inline', 'marginInline',
  'padding_top', 'paddingTop', 'padding_bottom', 'paddingBottom',
  'padding_left', 'paddingLeft', 'padding_right', 'paddingRight',
  'margin_top', 'marginTop', 'margin_bottom', 'marginBottom',
  'margin_left', 'marginLeft', 'margin_right', 'marginRight',
  // Gap
  'gap',
  // Borders
  'border', 'border_top', 'borderTop', 'border_bottom', 'borderBottom',
  'border_left', 'borderLeft', 'border_right', 'borderRight',
  'border_radius', 'borderRadius',
  // Positioning
  'position', 'top', 'left', 'right', 'bottom',
  'z_index', 'zIndex',
  // Flex item
  'flex_basis', 'flexBasis', 'flex_shrink', 'flexShrink', 'flex_grow', 'flexGrow',
  // Overflow & visibility
  'overflow', 'overflow_x', 'overflowX', 'overflow_y', 'overflowY',
  'pointer_events', 'pointerEvents', 'cursor', 'opacity',
  'white_space', 'whiteSpace',
  // Typography (overrides for catalog items that need custom fonts)
  'font_size', 'fontSize', 'font_family', 'fontFamily',
  // Layout (for non-container nodes that need inline layout)
  'display', 'align_items', 'alignItems', 'justify_content', 'justifyContent',
  'flex_direction', 'flexDirection', 'flex_wrap', 'flexWrap',
  // Colors (hex/rgba pass through; token names won't resolve but hex values will)
  'background', 'background_color', 'backgroundColor', 'color',
  // Text
  'text_align', 'textAlign',
]);

const COLOR_OVERRIDE_KEYS = new Set([
  'background', 'background_color', 'backgroundColor', 'color',
]);

/** Normalize CSS-style keys (hyphens, underscores) to React camelCase style keys. */
function normalizeCssOverrideKey(key: string): string {
  return key
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function looksLikeCssColor(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.startsWith('#') || s.startsWith('rgb') || s.startsWith('hsl')
    || s === 'transparent' || s === 'inherit' || s === 'currentColor';
}

/** Gradients, var(), and other paint values allowed on background/color. */
function looksLikeCssPaintValue(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.startsWith('var(')) return true;
  if (s.startsWith('conic-gradient') || s.startsWith('linear-gradient') || s.startsWith('radial-gradient')) {
    return true;
  }
  return looksLikeCssColor(v);
}

function getOverrideStyles(overrides: Readonly<Record<string, unknown>> | undefined): React.CSSProperties {
  if (!overrides) return {};
  const s: React.CSSProperties = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'direction' && typeof value === 'string') {
      s.display = 'flex';
      s.flexDirection = value as React.CSSProperties['flexDirection'];
      continue;
    }
    if (key === 'columns' && typeof value === 'number') {
      s.display = 'grid';
      s.gridTemplateColumns = `repeat(${value}, 1fr)`;
      continue;
    }
    const normalizedKey = normalizeCssOverrideKey(key);
    if (!SAFE_OVERRIDE_KEYS.has(key) && !SAFE_OVERRIDE_KEYS.has(normalizedKey)) continue;
    const isColorKey = COLOR_OVERRIDE_KEYS.has(key) || COLOR_OVERRIDE_KEYS.has(normalizedKey);
    if (isColorKey && !looksLikeCssPaintValue(value)) continue;
    (s as Record<string, unknown>)[normalizedKey] = value;
  }
  return s;
}

function getLayoutAlignmentStyles(layout: LayoutSpec | undefined): React.CSSProperties {
  if (!layout) return {};
  const s: React.CSSProperties = {};
  if (layout.dir) s.flexDirection = layout.dir === 'row' ? 'row' : 'column';
  if (layout.gap !== undefined) s.gap = layout.gap;
  if (layout.justify === 'center') s.justifyContent = 'center';
  else if (layout.justify === 'space-between' || layout.justify === 'between') s.justifyContent = 'space-between';
  else if (layout.justify === 'end') s.justifyContent = 'flex-end';
  if (layout.align === 'center') s.alignItems = 'center';
  else if (layout.align === 'end') s.alignItems = 'flex-end';
  else if (layout.align === 'stretch') s.alignItems = 'stretch';
  else if (layout.align === 'start') s.alignItems = 'flex-start';
  return s;
}

/**
 * Common styles applied to ALL nodes (including catalog components).
 * Ensures inspector-edited properties like margin, padding, size, radius,
 * shadow, and layout alignment are always reflected in the rendered output.
 */
function getCommonNodeStyles(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap?: TokenColorMap,
): React.CSSProperties {
  const s: React.CSSProperties = {
    ...getLayoutAlignmentStyles(node.layout),
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getShadowStyle(node.shadow, tokens),
    ...getPositionStyles(node),
    ...getOverrideStyles(node.overrides),
  };
  if (node.radius !== undefined) s.borderRadius = node.radius;
  if (node.background && tokenMap) {
    const bg = resolveTokenColor(node.background, tokenMap);
    if (bg) s.backgroundColor = bg;
  }
  return s;
}

function getSizeStyles(
  width: number | 'fill' | undefined,
  height: number | undefined,
): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (width === 'fill') {
    s.flex = '1 1 auto';
    s.width = '100%';
    s.minWidth = 0;
  } else if (typeof width === 'number') {
    s.width = width;
    s.flex = 'none';
    s.flexShrink = 0;
  } else if (typeof width === 'string' && /^\d+(\.\d+)?$/.test(width)) {
    s.width = Number(width);
    s.flex = 'none';
    s.flexShrink = 0;
  }
  if (typeof height === 'number') s.height = height;
  return s;
}

function getTypographyStyles(
  role: string | undefined,
  tokens: RendererTokens,
  weightOverride?: number,
): React.CSSProperties {
  if (!role) return {};
  const typo = resolveTypography(role, tokens);
  if (!typo) return {};
  const s: React.CSSProperties = {
    fontFamily: typo.fontFamily,
    fontSize: typo.fontSize,
    lineHeight: typo.lineHeight,
  };
  const weight = weightOverride ?? typo.fontWeight;
  if (weight) s.fontWeight = weight;
  return s;
}

type LucideIconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}>;

function isRenderableIconComponent(candidate: unknown): candidate is LucideIconComponent {
  return typeof candidate === 'function'
    || (typeof candidate === 'object' && candidate !== null && 'render' in candidate);
}

function getLucideIconComponent(iconName: unknown): LucideIconComponent | null {
  if (typeof iconName !== 'string') return null;
  const componentName = getIconComponentName(iconName);
  if (!componentName) return null;
  const candidate = (lucideIcons as Record<string, unknown>)[componentName];
  return isRenderableIconComponent(candidate) ? candidate : null;
}

function getAlertDefaultIconName(node: ResolvedNode): string {
  const variant = typeof node.overrides?.variant === 'string' ? node.overrides.variant.toLowerCase() : '';
  const bg = (node.background ?? '').toLowerCase();
  if (variant.includes('success') || bg.includes('success')) return 'check-circle';
  if (variant.includes('error') || variant.includes('danger') || bg.includes('error')) return 'alert-circle';
  if (variant.includes('warning') || bg.includes('warning')) return 'alert-triangle';
  return 'info';
}

function renderAssetPlaceholder(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
  kind: 'image' | 'illustration',
): React.ReactNode {
  const defaultWidth = kind === 'image' ? 400 : 240;
  const defaultHeight = kind === 'image' ? 300 : 200;
  const alt = typeof node.overrides?.alt === 'string'
    ? node.overrides.alt
    : kind === 'image' ? 'Image placeholder' : 'Illustration placeholder';
  const IconComponent = kind === 'image'
    ? getLucideIconComponent('image')
    : (isRenderableIconComponent(lucideIcons.Palette) ? lucideIcons.Palette : null);
  const borderRadius = kind === 'image' ? 8 : 12;
  const textColor = resolveTokenColor('text-secondary', tokenMap) ?? '#888';
  const backgroundColor = resolveTokenColor(node.background ?? 'surface-secondary', tokenMap) ?? '#f0f0f0';

  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog={kind}
      style={{
        width: node.width === 'fill' ? '100%' : defaultWidth,
        height: node.height ?? defaultHeight,
        backgroundColor,
        borderRadius,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: textColor,
        fontSize: 13,
        border: '1px dashed currentColor',
        ...common,
      }}
    >
      {IconComponent ? <IconComponent size={32} strokeWidth={1.5} /> : null}
      <span>{alt}</span>
    </div>
  );
}

function getShadowStyle(
  shadowRef: string | number | undefined,
  tokens: RendererTokens,
): React.CSSProperties {
  if (shadowRef === undefined || shadowRef === null) return {};
  const resolved = resolveShadow(String(shadowRef), tokens);
  if (!resolved || resolved === 'none') return {};
  return { boxShadow: resolved };
}

/** Extract position and zIndex from node overrides or top-level fields set by correction pipeline. */
function getPositionStyles(node: ResolvedNode): React.CSSProperties {
  const s: React.CSSProperties = {};
  const overrides = node.overrides;
  if (!overrides) return s;

  const pos = overrides.position as string | undefined;
  if (pos === 'fixed' || pos === 'absolute' || pos === 'relative') {
    s.position = pos;
  }
  const z = overrides.zIndex as number | undefined;
  if (typeof z === 'number') s.zIndex = z;

  // Centering: when position is fixed/absolute and layout has center alignment, apply CSS centering
  if (pos === 'fixed' || pos === 'absolute') {
    const layout = node.layout;
    const isCentered =
      (layout?.align === 'center' && layout?.justify === 'center') ||
      (overrides.positionX === 'center' && overrides.positionY === 'center');

    if (isCentered) {
      s.top = '50%';
      s.left = '50%';
      s.transform = 'translate(-50%, -50%)';
      if (typeof z !== 'number') s.zIndex = 1000;
      return s;
    }
  }

  const top = overrides.top as number | string | undefined;
  if (top !== undefined) s.top = top;
  const left = overrides.left as number | string | undefined;
  if (left !== undefined) s.left = left;
  const right = overrides.right as number | string | undefined;
  if (right !== undefined) s.right = right;
  const bottom = overrides.bottom as number | string | undefined;
  if (bottom !== undefined) s.bottom = bottom;
  return s;
}

// ─── Node Rendering ─────────────────────────────────────

function renderNode(
  treeNode: TreeNode,
  spec: DesignSpecV2,
  tokens: RendererTokens,
  catalog: CatalogMap,
  tokenMap: TokenColorMap,
  onNavigate?: (screenId: string, mode?: 'navigate' | 'overlay') => void,
  navMap?: Map<string, string>,
  navigationBindings?: readonly NavigationBinding[],
  prototypeScreenId?: string,
): React.ReactNode {
  const nodeSpec = spec.nodes[treeNode.id];
  const node = resolveNode(treeNode.id, nodeSpec, catalog);

  const children = treeNode.children.map((child) =>
    renderNode(child, spec, tokens, catalog, tokenMap, onNavigate, navMap, navigationBindings, prototypeScreenId),
  );

  const targetScreen = navMap?.get(treeNode.id);
  if (targetScreen && onNavigate) {
    const rendered = node.type
      ? renderAccelerator(node, children, tokens, tokenMap)
      : node.catalogId
        ? renderCatalog(node, children, tokens, tokenMap)
        : null;

    if (rendered) {
      const binding =
        navigationBindings?.find(
          b =>
            b.sourceNodeId === treeNode.id
            && (!prototypeScreenId || b.sourceScreenId === prototypeScreenId),
        )
        ?? navigationBindings?.find(b => b.sourceNodeId === treeNode.id);
      const navMode = binding?.mode;

      return (
        <div
          key={treeNode.id}
          data-nav-target={targetScreen}
          data-nav-mode={navMode === 'overlay' ? 'overlay' : navMode === 'navigate' ? 'navigate' : ''}
          className="nav-hotspot"
          onClick={(e) => { e.stopPropagation(); onNavigate(targetScreen, navMode); }}
          title={`Navigate to ${targetScreen}`}
        >
          {rendered}
        </div>
      );
    }
  }

  if (node.type) {
    return renderAccelerator(node, children, tokens, tokenMap);
  }
  if (node.catalogId) {
    return renderCatalog(node, children, tokens, tokenMap);
  }

  // Unresolved — render children in a wrapper with any available styles
  const fallbackStyle: React.CSSProperties = {
    ...getLayoutStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getPositionStyles(node),
    ...getOverrideStyles(node.overrides),
  };
  const bg = resolveTokenColor(node.background, tokenMap);
  if (bg) fallbackStyle.backgroundColor = bg;
  return (
    <div key={node.id} data-node={node.id} style={Object.keys(fallbackStyle).length ? fallbackStyle : undefined}>
      {children}
    </div>
  );
}

// ─── Accelerator Rendering ──────────────────────────────

function renderAccelerator(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background, tokenMap);

  switch (node.type) {
    case 'page': {
      const style: React.CSSProperties = {
        ...getLayoutStyles(node.layout),
        ...getSizeStyles(node.width, undefined),
        minHeight: '100vh',
        backgroundColor: bg,
        ...getOverrideStyles(node.overrides),
      };
      return (
        <div key={node.id} data-node={node.id} style={style}>
          {children}
        </div>
      );
    }

    case 'container': {
      const style: React.CSSProperties = {
        ...getLayoutStyles(node.layout),
        ...getSizeStyles(node.width, node.height),
        ...getShadowStyle(node.shadow, tokens),
        ...getPositionStyles(node),
        backgroundColor: bg,
        ...getOverrideStyles(node.overrides),
      };
      if (node.radius) {
        style.borderRadius = node.radius;
        if (typeof node.width === 'number' && typeof node.height === 'number') {
          style.overflow = 'hidden';
        }
      }
      return (
        <div key={node.id} data-node={node.id} style={style}>
          {children}
        </div>
      );
    }

    case 'section': {
      const style: React.CSSProperties = {
        ...getLayoutStyles(node.layout),
        ...getSizeStyles(node.width, node.height),
        ...getShadowStyle(node.shadow, tokens),
        ...getPositionStyles(node),
        backgroundColor: bg,
        ...getOverrideStyles(node.overrides),
        borderRadius: node.radius,
      };
      return (
        <div key={node.id} data-node={node.id} style={style}>
          {children}
        </div>
      );
    }

    case 'header': {
      const style: React.CSSProperties = {
        ...getLayoutStyles(node.layout),
        ...getShadowStyle(node.shadow, tokens),
        width: '100%',
        height: node.height,
        backgroundColor: bg,
        ...getOverrideStyles(node.overrides),
      };
      return (
        <div key={node.id} data-node={node.id} style={style}>
          {children}
        </div>
      );
    }

    case 'text': {
      const color = resolveTokenColor(node.color, tokenMap);
      const typoStyle = getTypographyStyles(node.typography, tokens, node.weight);
      const style: React.CSSProperties = {
        ...typoStyle,
        ...getSizeStyles(node.width, undefined),
        color,
        textAlign: node.textAlign,
      };
      const content = node.content ?? node.label ?? '';
      const tag = getTextTag(node.typography);
      return React.createElement(
        tag,
        { key: node.id, 'data-node': node.id, style },
        content,
      );
    }

    case 'divider': {
      const dividerColor = resolveTokenColor(node.background ?? node.color ?? 'border-default', tokenMap);
      const hasExplicitDimensions = typeof node.width === 'number' || typeof node.height === 'number';
      if (hasExplicitDimensions) {
        return (
          <div
            key={node.id}
            data-node={node.id}
            style={{
              width: typeof node.width === 'number' ? node.width : '100%',
              height: typeof node.height === 'number' ? node.height : 1,
              backgroundColor: dividerColor ?? '#333',
              flexShrink: 0,
            }}
          />
        );
      }
      const fillStyle: React.CSSProperties = node.width === 'fill'
        ? { flex: '1 1 auto', width: '100%', minWidth: 0 }
        : { width: '100%' };
      return (
        <hr
          key={node.id}
          data-node={node.id}
          style={{
            border: 'none',
            borderTop: `1px solid ${dividerColor ?? '#333'}`,
            ...fillStyle,
          }}
        />
      );
    }

    case 'spacer': {
      return (
        <div
          key={node.id}
          data-node={node.id}
          style={{ height: node.height ?? 16 }}
        />
      );
    }

    default:
      return (
        <div key={node.id} data-node={node.id}>
          {children}
        </div>
      );
  }
}

function getTextTag(role: string | undefined): string {
  switch (role) {
    case 'heading-1':
      return 'h1';
    case 'heading-2':
      return 'h2';
    case 'heading-3':
      return 'h3';
    default:
      return 'p';
  }
}

// ─── Catalog Rendering ──────────────────────────────────

function renderCatalog(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const catalogId = normalizeCatalogIdToKebab(node.catalogId ?? '');

  // Compute common styles (spacing, size, shadow, position, radius, background)
  // that apply to ALL catalog nodes. Individual renderers may override specific properties.
  const common = getCommonNodeStyles(node, tokens, tokenMap);

  // Button variants (both "button-primary" style and bare "Button" catalog)
  if (catalogId === 'button' || catalogId.startsWith('button-')) {
    return renderButtonVariant(node, catalogId, common);
  }

  // Badge variants
  if (catalogId.startsWith('badge')) {
    return renderBadgeVariant(node, catalogId, tokenMap, common);
  }

  switch (catalogId) {
    case 'icon': {
      const iconName = node.overrides?.name ?? node.label ?? node.content;
      const size = typeof node.overrides?.size === 'number' ? node.overrides.size : 20;
      const IconComponent = getLucideIconComponent(iconName);
      const color = resolveTokenColor(node.color ?? 'text-primary', tokenMap) ?? 'currentColor';
      const wrapperStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color,
        ...common,
      };

      if (IconComponent) {
        return (
          <span key={node.id} data-node={node.id} data-catalog="icon" style={wrapperStyle}>
            <IconComponent size={size} color="currentColor" strokeWidth={1.75} />
          </span>
        );
      }

      return (
        <div
          key={node.id}
          data-node={node.id}
          data-catalog="icon"
          style={{
            ...wrapperStyle,
            border: '1px dashed currentColor',
            borderRadius: 4,
            fontSize: size * 0.6,
            opacity: 0.5,
          }}
        >
          ?
        </div>
      );
    }
    case 'image':
      return renderAssetPlaceholder(node, tokenMap, common, 'image');
    case 'illustration':
      return renderAssetPlaceholder(node, tokenMap, common, 'illustration');
    case 'data-table':
      return renderDataTable(node, tokenMap, common);
    case 'link':
      return renderLink(node, tokenMap, common);
    case 'avatar':
      return renderAvatar(node, common);
    case 'alert':
      return renderAlertNode(node, tokenMap, common);
    case 'card':
      return renderCard(node, children, tokens, tokenMap);
    case 'input-text':
      return renderInputText(node, tokens, tokenMap, common);
    case 'input-currency':
      return renderInputCurrency(node, tokens, tokenMap, common);
    case 'search-input':
      return renderSearchInput(node, common);
    case 'select':
      return renderSelect(node, tokens, tokenMap, common);
    case 'segmented-control':
      return renderSegmentedControl(node, tokenMap, common);
    case 'stepper':
      return renderStepper(node, tokenMap, common);
    case 'display-readonly':
      return renderDisplayReadonly(node, tokens, tokenMap, common);
    case 'checkbox':
      return renderCheckboxNode(node, tokens, tokenMap, common);
    case 'switch':
    case 'toggle':
      return renderSwitchNode(node, tokenMap, common);
    case 'stat':
      return renderStat(node, tokens, tokenMap, common);
    case 'chip': {
      const isSelected = !!(node.overrides?.selected);
      const states = node.catalogEntry?.states as Record<string, Record<string, string>> | undefined;
      const stateTokens = isSelected ? states?.selected : states?.default;

      const stateBg = resolveTokenColor(stateTokens?.bg, tokenMap);
      const stateFg = resolveTokenColor(stateTokens?.text, tokenMap);
      const stateBorder = resolveTokenColor(stateTokens?.border, tokenMap);

      const fallbackCtaPrimary = resolveTokenColor('cta-primary', tokenMap) ?? '#f59e0b';
      const fallbackTextOnCta = resolveTokenColor('text-on-cta', tokenMap) ?? '#fff';
      const fallbackBorderDefault = resolveTokenColor('border-default', tokenMap) ?? '#333';
      const fallbackTextSecondary = resolveTokenColor('text-secondary', tokenMap) ?? '#94a3b8';
      const fallbackSurfaceSecondary = resolveTokenColor('surface-secondary', tokenMap) ?? 'transparent';

      const chipStyle: React.CSSProperties = {
        ...common,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: common.padding ?? '6px 14px',
        borderRadius: common.borderRadius ?? 9999,
        fontSize: 13,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      };

      if (isSelected) {
        chipStyle.backgroundColor = stateBg ?? fallbackCtaPrimary;
        chipStyle.color = stateFg ?? fallbackTextOnCta;
        chipStyle.border = `1px solid ${stateBorder ?? stateBg ?? fallbackCtaPrimary}`;
      } else {
        chipStyle.backgroundColor = stateBg ?? fallbackSurfaceSecondary;
        chipStyle.color = stateFg ?? fallbackTextSecondary;
        chipStyle.border = `1px solid ${stateBorder ?? fallbackBorderDefault}`;
      }

      return (
        <div key={node.id} data-node={node.id} data-catalog="chip" style={chipStyle}>
          {node.label ?? ''}
        </div>
      );
    }
    case 'progress-bar':
    case 'progress-bar-active':
    case 'progress-bar-error':
    case 'progress-bar-warning':
    case 'progress-bar-success':
      return renderProgressBar(node, catalogId, common, tokenMap);
    case 'pagination':
      return renderPagination(node, common);
    case 'tabs': {
      const tabItems = (node.overrides?.tabs ?? node.items ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
      const activeFg = resolveTokenColor('cta-primary', tokenMap) ?? '#f59e0b';
      const inactiveFg = resolveTokenColor('text-secondary', tokenMap) ?? '#94a3b8';
      return (
        <div key={node.id} data-node={node.id} data-catalog={catalogId}
          style={{ display: 'flex', gap: 24, alignItems: 'center', ...common }}>
          {tabItems.map((tab, i) => {
            const isActive = !!tab.active;
            return (
              <span key={i} style={{
                color: isActive ? activeFg : inactiveFg,
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                cursor: 'pointer',
                borderBottom: isActive ? `2px solid ${activeFg}` : '2px solid transparent',
                paddingBottom: 4,
              }}>
                {String(tab.label ?? '')}
              </span>
            );
          })}
        </div>
      );
    }
    case 'navigation-bar':
    case 'navbar':
    case 'top-bar':
    case 'app-bar': {
      const navBg = resolveTokenColor(node.background, tokenMap);
      const navStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        ...common,
      };
      if (navBg) navStyle.backgroundColor = navBg;
      return (
        <nav key={node.id} data-node={node.id} data-catalog={catalogId} style={navStyle}>
          {children}
        </nav>
      );
    }
    // ── Layout ──
    case 'section':
      return renderSection(node, children, tokens, tokenMap);
    case 'page-header':
      return renderPageHeader(node, children, tokens, tokenMap);
    case 'footer':
      return renderFooter(node, children, tokens, tokenMap);
    case 'sidebar':
      return renderSidebar(node, children, tokens, tokenMap);
    // ── Input ──
    case 'radio':
      return renderRadio(node, tokenMap, common);
    case 'text-area':
    case 'textarea':
      return renderTextArea(node, tokens, tokenMap, common);
    case 'date-picker':
      return renderDatePicker(node, tokens, tokenMap, common);
    // ── Feedback ──
    case 'modal':
    case 'dialog':
      return renderModal(node, children, tokens, tokenMap);
    case 'loading-spinner':
    case 'loader':
      return renderLoadingSpinner(node, tokenMap, common);
    case 'skeleton':
      return renderSkeleton(node, common);
    // ── Navigation ──
    case 'breadcrumb':
      return renderBreadcrumb(node, tokenMap, common);
    case 'step-indicator':
      return renderStepIndicator(node, tokenMap, common);
    // ── Composite ──
    case 'form':
      return renderForm(node, children, tokens, tokenMap);
    case 'selection-grid':
      return renderSelectionGrid(node, children, tokens, tokenMap);
    case 'filter-bar':
      return renderFilterBar(node, children, common);
    // ── Data Display ──
    case 'empty-state':
      return renderEmptyState(node, children, tokens, tokenMap);
    case 'tooltip':
      return (
        <div key={node.id} data-node={node.id} data-catalog={catalogId} style={Object.keys(common).length ? common : undefined}>
          {children}
        </div>
      );
    default: {
      const bgCatalog = resolveTokenColor(node.background, tokenMap);
      const layoutStyle = getLayoutStyles(node.layout);
      const style: React.CSSProperties = {
        ...layoutStyle,
        ...common,
      };
      if (
        bgCatalog
        && style.backgroundColor === undefined
        && style.background === undefined
      ) {
        style.backgroundColor = bgCatalog;
      }
      if (node.radius) style.borderRadius = node.radius;

      const hasChildren = children.length > 0;
      const itemsEl = !hasChildren ? renderCatalogItems(node, tokenMap) : null;
      const displayText = node.label ?? node.content
        ?? (node.value !== undefined && node.value !== '' ? String(node.value) : undefined)
        ?? node.placeholder;
      const textColor = resolveTokenColor(node.color, tokenMap)
        ?? resolveTokenColor('text-primary', tokenMap);
      const isPlaceholder = !node.label && !node.content && (node.value === undefined || node.value === '') && !!node.placeholder;

      if (itemsEl && !node.layout && !style.display) {
        style.display = 'flex';
        style.flexWrap = 'wrap';
        if (!style.gap) style.gap = 8;
      }

      if (!hasChildren && !itemsEl && displayText && !style.display) {
        style.display = 'flex';
        style.alignItems = 'center';
      }

      return (
        <div key={node.id} data-node={node.id} data-catalog={catalogId} style={Object.keys(style).length ? style : undefined}>
          {children}
          {itemsEl}
          {!hasChildren && !itemsEl && displayText && (
            <span style={{ color: textColor, opacity: isPlaceholder ? 0.5 : undefined }}>{String(displayText)}</span>
          )}
        </div>
      );
    }
  }
}

// ─── Catalog Component Renderers ────────────────────────

function renderButtonVariant(
  node: ResolvedNode,
  catalogId: string,
  common: React.CSSProperties,
): React.ReactNode {
  const catalogVariantMap: Record<string, string> = {
    'button-primary': 'default',
    'button-secondary': 'outline',
    'button-destructive': 'destructive',
    'button-ghost': 'ghost',
  };
  const overrideVariantMap: Record<string, string> = {
    'ghost': 'ghost',
    'secondary': 'outline',
    'primary': 'default',
    'destructive': 'destructive',
    'outline': 'outline',
  };
  const overrideVariant = node.overrides?.variant as string | undefined;
  const variant = catalogVariantMap[catalogId]
    ?? (overrideVariant ? overrideVariantMap[overrideVariant] : undefined)
    ?? 'default';
  const size = (node.overrides?.size as string) ?? 'default';
  // Buttons should not inherit fill width from catalog defaults — use auto unless explicitly sized
  const { width: _dropWidth, ...commonWithoutWidth } = common;
  const explicitWidth = node.width !== undefined && node.width !== 'fill' ? common.width : undefined;
  const style: React.CSSProperties = {
    ...commonWithoutWidth,
    borderRadius: node.radius,
    ...(explicitWidth ? { width: explicitWidth } : {}),
  };
  const iconPosition = node.overrides?.iconPosition === 'trailing' ? 'trailing' : 'leading';
  const IconComponent = getLucideIconComponent(node.overrides?.icon);
  const label = node.label ?? 'Button';

  return (
    <Button key={node.id} data-node={node.id} data-catalog={catalogId} variant={variant} size={size} style={style}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {IconComponent && iconPosition === 'leading' ? <IconComponent size={16} strokeWidth={2} /> : null}
        <span>{label}</span>
        {IconComponent && iconPosition === 'trailing' ? <IconComponent size={16} strokeWidth={2} /> : null}
      </span>
    </Button>
  );
}

function renderBadgeVariant(
  node: ResolvedNode,
  catalogId: string,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const bg = resolveTokenColor(node.background, tokenMap);
  const textColor = resolveTokenColor(node.color, tokenMap);
  // Catalog badge variants define opacity for the background only (e.g., warning @ 0.15),
  // while the text stays at full opacity. Use a semi-transparent background with solid text.
  const opacity = node.catalogEntry?.opacity as number | undefined;
  const style: React.CSSProperties = { ...common, position: 'relative' };
  if (textColor) style.color = textColor;
  if (node.radius) style.borderRadius = node.radius;
  // Apply background: if opacity is set, mix it into the background color via rgba
  if (bg && opacity !== undefined && opacity < 1) {
    style.backgroundColor = hexToRgba(bg, opacity);
  } else if (bg) {
    style.backgroundColor = bg;
  }
  return (
    <Badge key={node.id} data-node={node.id} data-catalog={catalogId} style={style}>
      {node.label ?? ''}
    </Badge>
  );
}

/** Convert a hex color (or pass-through rgba) to rgba with given alpha. */
function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith('rgba')) return color;
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return color;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderAvatar(node: ResolvedNode, common: React.CSSProperties): React.ReactNode {
  const initialsOverride = typeof node.overrides?.initials === 'string' ? node.overrides.initials.trim() : '';
  const label = node.label ?? '';
  const initialsFromLabel = label
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const initials = (initialsOverride || initialsFromLabel).slice(0, 2) || '?';
  return (
    <Avatar key={node.id} data-node={node.id} data-catalog="avatar" style={Object.keys(common).length ? common : undefined}>
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

function renderLink(node: ResolvedNode, tokenMap: TokenColorMap, common: React.CSSProperties): React.ReactNode {
  const href = typeof node.overrides?.href === 'string' ? node.overrides.href : '#';
  const hasSpecColor = !!node.color;
  const textColor = resolveTokenColor(node.color ?? 'cta-primary', tokenMap) ?? '#0d9488';
  const text = node.label ?? node.content ?? '';
  return (
    <a
      key={node.id}
      data-node={node.id}
      data-catalog="link"
      href={href}
      style={{
        color: textColor,
        textDecoration: hasSpecColor ? 'none' : 'underline',
        cursor: 'pointer',
        ...common,
      }}
    >
      {text}
    </a>
  );
}

function renderCard(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-primary', tokenMap);
  const style: React.CSSProperties = {
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getShadowStyle(node.shadow, tokens),
    ...getPositionStyles(node),
    backgroundColor: bg,
    borderRadius: node.radius ?? 20,
    padding: node.padding ?? node.catalogEntry?.padding ?? 24,
    ...getOverrideStyles(node.overrides),
  };
  return (
    <Card key={node.id} data-node={node.id} data-catalog="card" style={style}>
      {children}
    </Card>
  );
}

function renderInputText(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="input-text" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...common }}>
      {node.label && (
        <label style={{ ...labelStyle, color: labelColor }}>{node.label}</label>
      )}
      <Input placeholder={node.placeholder ?? ''} />
      {node.helper && (
        <p style={{ fontSize: 11, color: labelColor, opacity: 0.7 }}>{node.helper}</p>
      )}
    </div>
  );
}

function renderInputCurrency(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="input-currency" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...common }}>
      {node.label && (
        <label style={{ ...labelStyle, color: labelColor }}>{node.label}</label>
      )}
      <div style={{ position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: labelColor,
          }}
        >
          $
        </span>
        <Input placeholder={node.placeholder ?? ''} style={{ paddingLeft: 28 }} />
      </div>
      {node.helper && (
        <p style={{ fontSize: 11, color: labelColor, opacity: 0.7 }}>{node.helper}</p>
      )}
    </div>
  );
}

function renderSearchInput(node: ResolvedNode, common: React.CSSProperties): React.ReactNode {
  const IconComponent = getLucideIconComponent(node.overrides?.icon ?? 'search');
  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="search-input"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', ...common }}
    >
      {IconComponent ? (
        <IconComponent
          size={16}
          strokeWidth={1.75}
          style={{ position: 'absolute', left: 12, opacity: 0.5, pointerEvents: 'none' }}
        />
      ) : null}
      <Input
        type="search"
        placeholder={node.placeholder ?? 'Search...'}
        style={{ paddingLeft: IconComponent ? 36 : undefined }}
      />
    </div>
  );
}

function renderAlertNode(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const title = node.label ?? node.title ?? '';
  const body = node.content ?? (node.value !== undefined ? String(node.value) : '');
  const background = resolveTokenColor(node.background ?? 'surface-secondary', tokenMap) ?? '#f8fafc';
  const borderColor = resolveTokenColor(node.catalogEntry?.border_color as string | undefined ?? 'border-default', tokenMap) ?? '#cbd5e1';
  const textColor = resolveTokenColor(node.color ?? node.catalogEntry?.text_color as string | undefined ?? 'text-primary', tokenMap) ?? '#0f172a';
  const opacity = typeof node.catalogEntry?.opacity === 'number' ? node.catalogEntry.opacity : undefined;
  const effectiveBackground = opacity !== undefined ? hexToRgba(background, opacity) : background;
  const IconComponent = getLucideIconComponent(node.overrides?.icon ?? getAlertDefaultIconName(node));

  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 16px',
        borderRadius: node.radius ?? 12,
        border: `1px solid ${borderColor}`,
        backgroundColor: effectiveBackground,
        color: textColor,
        ...common,
      }}
    >
      {IconComponent ? <IconComponent size={18} color="currentColor" strokeWidth={1.9} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: body ? 4 : 0 }}>
        {title ? <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span> : null}
        {body ? <span style={{ fontSize: 13, opacity: 0.9 }}>{body}</span> : null}
      </div>
    </div>
  );
}

function renderSelect(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  const borderColor = resolveTokenColor('border-default', tokenMap);
  const bg = resolveTokenColor('background-primary', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  return (
    <div key={node.id} data-node={node.id} data-catalog="select" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...common }}>
      {node.label && (
        <label style={{ ...labelStyle, color: labelColor }}>{node.label}</label>
      )}
      <select
        style={{
          height: 40,
          borderRadius: 8,
          border: `1px solid ${borderColor ?? '#333'}`,
          backgroundColor: bg,
          color: fg,
          padding: '0 12px',
          fontSize: 14,
        }}
      >
        {node.options?.map((opt, i) => (
          <option key={i} value={opt.label}>
            {opt.label}
          </option>
        ))}
        {!node.options?.length && (
          <option>{node.placeholder ?? 'Select...'}</option>
        )}
      </select>
    </div>
  );
}

function renderSegmentedControl(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const activeBg = resolveTokenColor('surface-elevated', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  const mutedFg = resolveTokenColor('text-secondary', tokenMap);
  const borderColor = resolveTokenColor('border-default', tokenMap);
  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="segmented-control"
      style={{
        ...common,
        display: 'flex',
        borderRadius: 8,
        border: `1px solid ${borderColor ?? '#333'}`,
        overflow: 'hidden',
      }}
    >
      {node.options?.map((opt, i) => (
        <div
          key={i}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: opt.selected ? 600 : 400,
            backgroundColor: opt.selected ? activeBg : 'transparent',
            color: opt.selected ? fg : mutedFg,
            cursor: 'pointer',
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}

function renderStepper(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const borderColor = resolveTokenColor('border-default', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="stepper"
      style={{
        ...common,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        border: `1px solid ${borderColor ?? '#333'}`,
        borderRadius: 8,
        padding: '4px 12px',
      }}
    >
      <span style={{ cursor: 'pointer', fontSize: 18, color: fg }}>-</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: fg, minWidth: 24, textAlign: 'center' }}>
        {node.value ?? 0}
      </span>
      <span style={{ cursor: 'pointer', fontSize: 18, color: fg }}>+</span>
    </div>
  );
}

function renderDisplayReadonly(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="display-readonly" style={{ ...common, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {node.label && (
        <span style={{ ...labelStyle, color: labelColor }}>{node.label}</span>
      )}
      <span style={{ fontSize: 14, color: fg }}>{node.value ?? node.content ?? ''}</span>
    </div>
  );
}

function renderCheckboxNode(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const fg = resolveTokenColor('text-primary', tokenMap);
  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="checkbox"
      style={{ ...common, display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}
    >
      <Checkbox id={node.id} defaultChecked={node.value === true || node.value === 'true' || node.value === 'on' || !!(node.overrides?.checked)} />
      {node.label && (
        <label htmlFor={node.id} style={{ fontSize: 14, color: fg, cursor: 'pointer' }}>
          {node.label}
        </label>
      )}
    </div>
  );
}

function renderSwitchNode(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const isOn = node.value === 'on' || node.value === true || node.value === 'true';
  const ctaPrimary = resolveTokenColor('cta-primary', tokenMap) ?? '#0d9488';
  const trackBg = isOn ? ctaPrimary : '#d1d5db';
  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="switch"
      style={{ ...common, display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}
    >
      {node.label && (
        <span style={{ fontSize: 14, color: resolveTokenColor('text-primary', tokenMap), flex: 1 }}>
          {node.label}
        </span>
      )}
      <div style={{
        width: 44, height: 24, borderRadius: 12, backgroundColor: trackBg,
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
        flexShrink: 0,
      }}>
        <div style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
          position: 'absolute', top: 2,
          left: isOn ? 22 : 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }} />
      </div>
    </div>
  );
}

function renderStat(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="stat" style={{ ...common, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ ...labelStyle, color: labelColor }}>{node.label ?? ''}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: fg }}>
        {node.value ?? node.content ?? ''}
      </span>
    </div>
  );
}

function renderProgressBar(node: ResolvedNode, catalogId: string, common: React.CSSProperties, tokenMap: TokenColorMap): React.ReactNode {
  const value = typeof node.value === 'number' ? node.value : 0;
  const variantColorMap: Record<string, string> = {
    'progress-bar-error': resolveTokenColor('error', tokenMap) ?? '#ef4444',
    'progress-bar-warning': resolveTokenColor('warning', tokenMap) ?? '#f59e0b',
    'progress-bar-success': resolveTokenColor('success', tokenMap) ?? '#22c55e',
  };
  const indicatorColor = variantColorMap[catalogId];
  const style: React.CSSProperties = { ...common };
  if (indicatorColor) {
    (style as Record<string, unknown>)['--primary'] = indicatorColor;
  }
  return (
    <Progress key={node.id} data-node={node.id} data-catalog={catalogId} value={value} style={Object.keys(style).length ? style : undefined} />
  );
}

function renderDataTableCell(value: unknown, tokenMap: TokenColorMap, colKey?: string, row?: Record<string, unknown>): React.ReactNode {
  if (value === null || value === undefined) return '';

  // Render badge-style cells when a matching _variant key exists in the row
  if (typeof value === 'string' && row && colKey) {
    const variantKey = `${colKey}_variant`;
    const variant = row[variantKey] as string | undefined;
    if (variant) {
      const ctaPrimary = resolveTokenColor('cta-primary', tokenMap) ?? '#0d9488';
      const errorColor = resolveTokenColor('error', tokenMap) ?? '#ef4444';
      const surfaceSecondary = resolveTokenColor('surface-secondary', tokenMap) ?? '#f1f5f9';
      const textSecondary = resolveTokenColor('text-secondary', tokenMap) ?? '#64748b';
      const borderDefault = resolveTokenColor('border-default', tokenMap) ?? '#cbd5e1';
      const variantColors: Record<string, { bg: string; fg: string }> = {
        'default': { bg: ctaPrimary, fg: '#fff' },
        'destructive': { bg: errorColor, fg: '#fff' },
        'secondary': { bg: surfaceSecondary, fg: textSecondary },
        'outline': { bg: 'transparent', fg: textSecondary },
      };
      const colors = variantColors[variant] ?? variantColors['secondary'];
      return (
        <span style={{
          display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
          fontSize: 12, fontWeight: 500,
          backgroundColor: colors.bg, color: colors.fg,
          border: variant === 'outline' ? `1px solid ${borderDefault}` : 'none',
        }}>
          {value}
        </span>
      );
    }

    // Render avatar cells: detect by presence of 'initials' key in the same row
    if (row.initials) {
      // Show avatar for the FIRST text column that has sibling initials data
      const allKeys = Object.keys(row).filter(k => !k.endsWith('_variant') && k !== 'initials' && k !== 'checkbox');
      const isFirstTextCol = allKeys.indexOf(colKey) === 0;
      if (isFirstTextCol) {
        const ctaPrimary = resolveTokenColor('cta-primary', tokenMap) ?? '#0d9488';
        // Find a secondary text field (email, description, etc.) — second string column
        const secondaryField = allKeys.find((k, i) => i > 0 && typeof row[k] === 'string' && !row[`${k}_variant`]);
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: `${ctaPrimary}18`, color: ctaPrimary,
              fontSize: 11, fontWeight: 600, flexShrink: 0,
            }}>
              {String(row.initials)}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 500 }}>{value}</span>
              {secondaryField && <span style={{ fontSize: 12, color: resolveTokenColor('text-secondary', tokenMap) ?? '#94a3b8' }}>{String(row[secondaryField])}</span>}
            </span>
          </span>
        );
      }
    }
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('name' in o && typeof o.name === 'string') {
      const avatar = typeof o.avatar === 'string' ? o.avatar : '';
      const href = o.href !== undefined ? String(o.href) : '#';
      const cta = resolveTokenColor('cta-primary', tokenMap) ?? '#0d9488';
      const surface = resolveTokenColor('surface-secondary', tokenMap) ?? 'rgba(0,0,0,0.06)';
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 9999,
              backgroundColor: surface,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {avatar.slice(0, 2)}
          </span>
          <a href={href} style={{ color: cta, textDecoration: 'underline' }}>
            {o.name}
          </a>
        </span>
      );
    }
    if ('value' in o) {
      const status = String(o.status ?? '');
      const err = resolveTokenColor('error', tokenMap) ?? '#ef4444';
      const warn = resolveTokenColor('warning', tokenMap) ?? '#f59e0b';
      const ok = resolveTokenColor('success', tokenMap) ?? '#22c55e';
      const color = status === 'error' ? err : status === 'warning' ? warn : ok;
      return <span style={{ color, fontWeight: 600 }}>{String(o.value ?? '')}</span>;
    }
  }
  return JSON.stringify(value);
}

/** Renders DesignSpec `catalog: DataTable` with rows/columns in `overrides` or flat `items`. */
function renderDataTable(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const ov = node.overrides ?? {};
  let columns = (ov.columns as ReadonlyArray<Record<string, unknown>> | undefined) ?? [];
  let rows = (ov.rows as ReadonlyArray<Record<string, unknown>> | undefined) ?? [];
  const caption = ov.caption !== undefined ? String(ov.caption) : '';

  // Support flat `items` array: auto-derive columns from object keys
  const items = node.items as ReadonlyArray<Record<string, unknown>> | undefined;
  if ((columns.length === 0 || rows.length === 0) && items && items.length > 0) {
    const allKeys = new Set<string>();
    for (const item of items) {
      for (const key of Object.keys(item)) allKeys.add(key);
    }
    // Filter out internal/variant/meta keys
    const skipKeys = new Set<string>();
    for (const key of allKeys) {
      if (key === 'checkbox' || key === 'initials') skipKeys.add(key);
      if (key.endsWith('_variant')) skipKeys.add(key);
    }
    columns = Array.from(allKeys)
      .filter(k => !skipKeys.has(k))
      .map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ') }));
    rows = items as ReadonlyArray<Record<string, unknown>>;
  }

  if (columns.length === 0 || rows.length === 0) {
    return (
      <div key={node.id} data-node={node.id} data-catalog="data-table" style={common}>
        <span style={{ color: resolveTokenColor('text-secondary', tokenMap) }}>No table data</span>
      </div>
    );
  }

  const border = resolveTokenColor('border-default', tokenMap) ?? '#e2e8f0';
  const textSecondary = resolveTokenColor('text-secondary', tokenMap) ?? '#94a3b8';
  const textPrimary = resolveTokenColor('text-primary', tokenMap) ?? '#0f172a';
  const surfaceAlt = resolveTokenColor('surface-secondary', tokenMap) ?? 'rgba(0,0,0,0.03)';

  return (
    <div key={node.id} data-node={node.id} data-catalog="data-table" style={{ overflow: 'auto', width: '100%', ...common }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: textPrimary }}>
        {caption ? (
          <caption style={{ captionSide: 'top', textAlign: 'left', paddingBottom: 8, color: textSecondary, fontSize: 12 }}>
            {caption}
          </caption>
        ) : null}
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderBottom: `1px solid ${border}`,
                  color: textSecondary,
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: '0.02em',
                }}
              >
                {String(col.label ?? col.key ?? '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ backgroundColor: ri % 2 === 1 ? surfaceAlt : undefined }}>
              {columns.map((col, ci) => {
                const key = String(col.key ?? '');
                const cell = row[key];
                return (
                  <td
                    key={ci}
                    style={{
                      padding: '10px 12px',
                      borderBottom: `1px solid ${border}`,
                      verticalAlign: 'middle',
                    }}
                  >
                    {renderDataTableCell(cell, tokenMap, key, row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Render node.items as visual chip/tag elements for unresolved catalog nodes
 * (CategoryChipGrid, PaymentMethodChipRow, NavigationTabs, etc.).
 */
function renderCatalogItems(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
): React.ReactNode | null {
  if (!node.items?.length) return null;
  const borderDefault = resolveTokenColor('border-default', tokenMap) ?? '#333';
  const fg = resolveTokenColor('text-primary', tokenMap) ?? '#e2e8f0';
  return (
    <>
      {node.items.map((item: Readonly<Record<string, unknown>>, i: number) => {
        const isSelected = item.selected as boolean | undefined;
        const itemColor = item.color as string | undefined;
        const label = (item.label ?? item.icon ?? '') as string;
        return (
          <div
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 12px',
              borderRadius: 9999,
              border: `1px solid ${isSelected && itemColor ? itemColor : borderDefault}`,
              backgroundColor: isSelected && itemColor ? hexToRgba(itemColor, 0.15) : 'transparent',
              color: isSelected && itemColor ? itemColor : fg,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </div>
        );
      })}
    </>
  );
}

function renderPagination(node: ResolvedNode, common: React.CSSProperties): React.ReactNode {
  return (
    <Pagination key={node.id} data-node={node.id} data-catalog="pagination" style={Object.keys(common).length ? common : undefined}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" />
        </PaginationItem>
        {[1, 2, 3].map((i) => (
          <PaginationItem key={i}>
            <PaginationLink href="#" isActive={i === 1}>
              {i}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext href="#" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

// ─── Layout Catalog Renderers ──────────────────────────

function renderSection(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-primary', tokenMap);
  const textColor = resolveTokenColor(node.color ?? 'text-primary', tokenMap);
  const titleText = node.label ?? (node.overrides?.title as string | undefined);
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: node.layout?.gap ?? 16,
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getShadowStyle(node.shadow, tokens),
    ...getPositionStyles(node),
    backgroundColor: bg,
    ...getOverrideStyles(node.overrides),
  };
  if (node.radius) style.borderRadius = node.radius;
  const titleId = titleText ? `${node.id}-title` : undefined;
  return (
    <section key={node.id} data-node={node.id} data-catalog="section" role="region" aria-labelledby={titleId} style={style}>
      {titleText && (
        <h2 id={titleId} style={{ ...getTypographyStyles('heading-2', tokens), color: textColor, margin: 0 }}>{titleText}</h2>
      )}
      {node.content && (
        <p style={{ ...getTypographyStyles('body', tokens), color: textColor, margin: 0, opacity: 0.7 }}>{node.content}</p>
      )}
      {children}
    </section>
  );
}

function renderPageHeader(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-primary', tokenMap);
  const textColor = resolveTokenColor(node.color ?? 'text-primary', tokenMap);
  const secondaryColor = resolveTokenColor('text-secondary', tokenMap);
  const titleText = node.label ?? (node.overrides?.title as string | undefined);
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: node.layout?.gap ?? 8,
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getPositionStyles(node),
    backgroundColor: bg,
    ...getOverrideStyles(node.overrides),
  };
  return (
    <div key={node.id} data-node={node.id} data-catalog="page-header" role="banner" style={style}>
      {titleText && (
        <h1 style={{ ...getTypographyStyles('heading-1', tokens), color: textColor, margin: 0 }}>{titleText}</h1>
      )}
      {node.content && (
        <p style={{ ...getTypographyStyles('body', tokens), color: secondaryColor, margin: 0 }}>{node.content}</p>
      )}
      {children}
    </div>
  );
}

function renderFooter(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-secondary', tokenMap);
  const textColor = resolveTokenColor(node.color ?? 'text-secondary', tokenMap);
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: node.layout?.gap ?? 24,
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getPositionStyles(node),
    backgroundColor: bg,
    color: textColor,
    ...getOverrideStyles(node.overrides),
  };
  return (
    <footer key={node.id} data-node={node.id} data-catalog="footer" role="contentinfo" style={style}>
      {children}
      {node.content && (
        <small style={{ opacity: 0.7 }}>{node.content}</small>
      )}
    </footer>
  );
}

function renderSidebar(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-secondary', tokenMap);
  const textColor = resolveTokenColor(node.color ?? 'text-primary', tokenMap);
  const isCollapsed = !!(node.overrides?.collapsed);
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: node.layout?.gap ?? 8,
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getPositionStyles(node),
    backgroundColor: bg,
    color: textColor,
    height: '100%',
    ...getOverrideStyles(node.overrides),
  };
  if (isCollapsed) {
    style.width = 64;
    style.overflow = 'hidden';
  }
  return (
    <aside key={node.id} data-node={node.id} data-catalog="sidebar" style={style}>
      <nav role="navigation" aria-label="Sidebar navigation" style={{ display: 'flex', flexDirection: 'column', gap: node.layout?.gap ?? 8, flex: 1 }}>
        {children}
      </nav>
    </aside>
  );
}

// ─── Input Catalog Renderers ───────────────────────────

function renderRadio(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const isSelected = !!(node.overrides?.selected ?? node.overrides?.checked);
  const isDisabled = !!(node.overrides?.disabled);
  const borderColor = resolveTokenColor(isSelected ? 'cta-primary' : 'border-default', tokenMap) ?? '#888';
  const fillColor = resolveTokenColor('cta-primary', tokenMap) ?? '#f59e0b';
  return (
    <div key={node.id} data-node={node.id} data-catalog="radio"
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content', opacity: isDisabled ? 0.5 : undefined, ...common }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        border: `2px solid ${borderColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: fillColor }} />}
      </div>
      {node.label && <span>{node.label}</span>}
    </div>
  );
}

function renderTextArea(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="text-area" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...common }}>
      {node.label && (
        <label style={{ ...labelStyle, color: labelColor }}>{node.label}</label>
      )}
      <Textarea placeholder={node.placeholder ?? ''} rows={4} />
      {node.helper && (
        <p style={{ fontSize: 11, color: labelColor, opacity: 0.7, margin: 0 }}>{node.helper}</p>
      )}
    </div>
  );
}

function renderDatePicker(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  const CalendarIcon = getLucideIconComponent('calendar');
  return (
    <div key={node.id} data-node={node.id} data-catalog="date-picker" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...common }}>
      {node.label && (
        <label style={{ ...labelStyle, color: labelColor }}>{node.label}</label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Input placeholder={node.placeholder ?? 'Select date...'} style={{ paddingRight: 36 }} />
        {CalendarIcon && (
          <CalendarIcon size={16} strokeWidth={1.75} style={{ position: 'absolute', right: 12, opacity: 0.5, pointerEvents: 'none' }} />
        )}
      </div>
      {node.helper && (
        <p style={{ fontSize: 11, color: labelColor, opacity: 0.7, margin: 0 }}>{node.helper}</p>
      )}
    </div>
  );
}

// ─── Feedback Catalog Renderers ────────────────────────

function renderModal(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-primary', tokenMap);
  const textColor = resolveTokenColor(node.color ?? 'text-primary', tokenMap);
  const titleText = node.label ?? (node.overrides?.title as string | undefined);
  const dialogWidth = typeof node.width === 'number' ? node.width : 560;
  const CloseIcon = getLucideIconComponent('x');
  const titleId = titleText ? `${node.id}-title` : undefined;
  return (
    <div key={node.id} data-node={node.id} data-catalog="modal"
      style={{ position: 'relative', width: '100%', padding: '48px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 'inherit' }} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{
          position: 'relative', backgroundColor: bg, color: textColor,
          borderRadius: node.radius ?? 16, padding: 24,
          width: dialogWidth, maxWidth: '90%',
          ...getShadowStyle(node.shadow ?? 'lg', tokens),
          display: 'flex', flexDirection: 'column', gap: 16,
          ...getOverrideStyles(node.overrides),
        }}>
        {(titleText || CloseIcon) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {titleText && <h2 id={titleId} style={{ ...getTypographyStyles('heading-2', tokens), margin: 0 }}>{titleText}</h2>}
            {CloseIcon && <CloseIcon size={20} strokeWidth={1.75} style={{ opacity: 0.5, cursor: 'pointer' }} />}
          </div>
        )}
        {node.content && <p style={{ ...getTypographyStyles('body', tokens), margin: 0 }}>{node.content}</p>}
        {children}
      </div>
    </div>
  );
}

function renderLoadingSpinner(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const textColor = resolveTokenColor(node.color ?? 'text-secondary', tokenMap) ?? '#888';
  const Loader2 = getLucideIconComponent('loader-2');
  return (
    <div key={node.id} data-node={node.id} data-catalog="loading-spinner" role="status" aria-label="Loading"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: textColor, ...common }}>
      {Loader2 ? (
        <Loader2 size={24} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        <div style={{ width: 24, height: 24, border: `2px solid ${textColor}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      )}
      {node.label && <span style={{ fontSize: 13 }}>{node.label}</span>}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function renderSkeleton(
  node: ResolvedNode,
  common: React.CSSProperties,
): React.ReactNode {
  const w = typeof node.width === 'number' ? node.width : '100%';
  const h = typeof node.height === 'number' ? node.height : 20;
  return (
    <Skeleton key={node.id} data-node={node.id} data-catalog="skeleton"
      style={{ width: w, height: h, borderRadius: node.radius ?? 8, ...common }} />
  );
}

// ─── Navigation Catalog Renderers ──────────────────────

function renderBreadcrumb(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const items = (node.items ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
  const textColor = resolveTokenColor('text-secondary', tokenMap) ?? '#888';
  const activeColor = resolveTokenColor('text-primary', tokenMap) ?? '#fff';
  const ChevronRight = getLucideIconComponent('chevron-right');
  return (
    <nav key={node.id} data-node={node.id} data-catalog="breadcrumb" role="navigation" aria-label="Breadcrumb"
      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, ...common }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            <span style={{ color: isLast ? activeColor : textColor, fontWeight: isLast ? 600 : 400 }}>
              {String(item.label ?? '')}
            </span>
            {!isLast && (ChevronRight
              ? <ChevronRight size={14} strokeWidth={1.5} style={{ color: textColor, opacity: 0.5 }} />
              : <span style={{ color: textColor, opacity: 0.5 }}>/</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function renderStepIndicator(
  node: ResolvedNode,
  tokenMap: TokenColorMap,
  common: React.CSSProperties,
): React.ReactNode {
  const items = (node.items ?? []) as ReadonlyArray<Readonly<Record<string, unknown>>>;
  const activeBg = resolveTokenColor('cta-primary', tokenMap) ?? '#f59e0b';
  const activeText = resolveTokenColor('text-on-cta', tokenMap) ?? '#fff';
  const completedBg = resolveTokenColor('success', tokenMap) ?? '#22c55e';
  const borderColor = resolveTokenColor('border-default', tokenMap) ?? '#555';
  const textColor = resolveTokenColor('text-secondary', tokenMap) ?? '#888';
  const CheckIcon = getLucideIconComponent('check');
  return (
    <div key={node.id} data-node={node.id} data-catalog="step-indicator" role="group" aria-label="Progress"
      style={{ display: 'flex', alignItems: 'center', gap: 0, ...common }}>
      {items.map((step, i) => {
        const state = (step.state ?? step.status ?? 'default') as string;
        const isActive = state === 'active';
        const isCompleted = state === 'completed';
        const circleBg = isCompleted ? completedBg : isActive ? activeBg : 'transparent';
        const circleBorder = isCompleted || isActive ? 'transparent' : borderColor;
        const circleText = isCompleted || isActive ? activeText : textColor;
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                border: `2px solid ${circleBorder}`, backgroundColor: circleBg, color: circleText,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600,
              }}>
                {isCompleted && CheckIcon ? <CheckIcon size={14} strokeWidth={2.5} /> : (i + 1)}
              </div>
              {step.label && <span style={{ fontSize: 11, color: isActive ? activeBg : textColor, whiteSpace: 'nowrap' }}>{String(step.label)}</span>}
            </div>
            {i < items.length - 1 && (
              <div style={{ flex: 1, height: 2, backgroundColor: isCompleted ? completedBg : borderColor, minWidth: 24, marginTop: step.label ? -16 : 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Composite Catalog Renderers ───────────────────────

function renderForm(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-primary', tokenMap);
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: node.layout?.gap ?? 16,
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getPositionStyles(node),
    backgroundColor: bg,
    ...getOverrideStyles(node.overrides),
  };
  return (
    <form key={node.id} data-node={node.id} data-catalog="form" role="form"
      aria-label={node.label ?? 'Form'} onSubmit={e => e.preventDefault()} style={style}>
      {children}
    </form>
  );
}

function renderSelectionGrid(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background, tokenMap);
  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: node.layout?.gap ?? 16,
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getPositionStyles(node),
    ...getOverrideStyles(node.overrides),
  };
  if (bg) style.backgroundColor = bg;
  if (node.layout?.dir === 'row' || node.layout?.dir === 'column') {
    style.display = 'flex';
    style.flexDirection = node.layout.dir;
    style.flexWrap = 'wrap';
    delete style.gridTemplateColumns;
  }
  return (
    <div key={node.id} data-node={node.id} data-catalog="selection-grid" role="group"
      aria-label={node.label ?? 'Selection grid'} style={style}>
      {children}
    </div>
  );
}

function renderFilterBar(
  node: ResolvedNode,
  children: React.ReactNode[],
  common: React.CSSProperties,
): React.ReactNode {
  return (
    <div key={node.id} data-node={node.id} data-catalog="filter-bar" role="search"
      aria-label="Filter controls"
      style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', ...common }}>
      {children}
    </div>
  );
}

// ─── Data Display Catalog Renderers ────────────────────

function renderEmptyState(
  node: ResolvedNode,
  children: React.ReactNode[],
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background ?? 'surface-primary', tokenMap);
  const textColor = resolveTokenColor(node.color ?? 'text-secondary', tokenMap);
  const titleText = node.label ?? (node.overrides?.title as string | undefined);
  const iconName = node.overrides?.icon as string | undefined;
  const IconComponent = iconName ? getLucideIconComponent(iconName) : null;
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: node.layout?.gap ?? 12,
    padding: 32,
    ...getSpacingStyles(node.layout),
    ...getSizeStyles(node.width, node.height),
    ...getPositionStyles(node),
    backgroundColor: bg,
    color: textColor,
    ...getOverrideStyles(node.overrides),
  };
  return (
    <div key={node.id} data-node={node.id} data-catalog="empty-state" style={style}>
      {IconComponent && <IconComponent size={48} strokeWidth={1.25} style={{ opacity: 0.4 }} />}
      {titleText && <h3 style={{ ...getTypographyStyles('heading-3', tokens), margin: 0 }}>{titleText}</h3>}
      {node.content && <p style={{ ...getTypographyStyles('body', tokens), margin: 0, opacity: 0.7 }}>{node.content}</p>}
      {children}
    </div>
  );
}
