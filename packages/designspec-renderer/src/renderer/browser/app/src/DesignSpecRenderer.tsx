/**
 * DesignSpecRenderer — renders a DesignSpec v2 JSON as actual React elements.
 * Uses shared utilities for tree building, node resolution, and token lookup.
 * Renders real shadcn/ui components for catalog entries.
 */
import React, { useEffect } from 'react';
import { buildTree } from '@shared/renderer/tree-builder';
import { resolveNode } from '@shared/catalog/resolver';
import { buildTokenMap } from '@shared/renderer/token-resolver';
import { resolveTypography } from '@shared/renderer/typography';
import { resolveShadow } from '@shared/renderer/shadows';
import type { DesignSpecV2, LayoutSpec } from '@shared/types/design-spec-v2';
import type { RendererTokens } from '@shared/types/tokens';
import type { CatalogMap, TreeNode, ResolvedNode } from '@shared/types/catalog';
import type { TokenColorMap } from '@shared/renderer/token-resolver';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

// ─── Props ──────────────────────────────────────────────

interface Props {
  spec: DesignSpecV2;
  tokens: RendererTokens;
  catalog: CatalogMap;
}

// ─── Component ──────────────────────────────────────────

export function DesignSpecRenderer({ spec, tokens, catalog }: Props) {
  const tree = buildTree(spec.nodes);
  const tokenMap = buildTokenMap(tokens);

  useEffect(() => {
    document.body.dataset.ready = 'true';
  }, []);

  return <>{renderNode(tree, spec, tokens, catalog, tokenMap)}</>;
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

function getFlexStyles(layout: LayoutSpec | undefined): React.CSSProperties {
  if (!layout) return {};
  const s: React.CSSProperties = {
    display: 'flex',
    flexDirection: layout.dir === 'row' ? 'row' : 'column',
  };
  if (layout.gap) s.gap = layout.gap;
  if (layout.align === 'center') s.alignItems = 'center';
  else if (layout.align === 'end') s.alignItems = 'flex-end';
  else if (layout.align === 'stretch') s.alignItems = 'stretch';
  else if (layout.align === 'start') s.alignItems = 'flex-start';
  if (layout.justify === 'center') s.justifyContent = 'center';
  else if (layout.justify === 'space-between') s.justifyContent = 'space-between';
  else if (layout.justify === 'end') s.justifyContent = 'flex-end';
  if (layout.px) { s.paddingLeft = layout.px; s.paddingRight = layout.px; }
  if (layout.py) { s.paddingTop = layout.py; s.paddingBottom = layout.py; }
  if (layout.pt) s.paddingTop = layout.pt;
  if (layout.pb) s.paddingBottom = layout.pb;
  return s;
}

function getSizeStyles(
  width: number | 'fill' | undefined,
  height: number | undefined,
): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (width === 'fill') {
    s.flex = 1;
    s.minWidth = 0;
  } else if (typeof width === 'number') {
    s.width = width;
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
): React.ReactNode {
  const nodeSpec = spec.nodes[treeNode.id];
  const node = resolveNode(treeNode.id, nodeSpec, catalog);

  const children = treeNode.children.map((child) =>
    renderNode(child, spec, tokens, catalog, tokenMap),
  );

  if (node.type) {
    return renderAccelerator(node, children, tokens, tokenMap);
  }
  if (node.catalogId) {
    return renderCatalog(node, children, tokens, tokenMap);
  }

  // Unresolved — render children in a wrapper
  const fallbackStyle = getPositionStyles(node);
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
        ...getFlexStyles(node.layout),
        ...getSizeStyles(node.width, undefined),
        minHeight: '100vh',
        backgroundColor: bg,
      };
      return (
        <div key={node.id} data-node={node.id} style={style}>
          {children}
        </div>
      );
    }

    case 'container': {
      const style: React.CSSProperties = {
        ...getFlexStyles(node.layout),
        ...getSizeStyles(node.width, node.height),
        ...getShadowStyle(node.shadow, tokens),
        ...getPositionStyles(node),
        backgroundColor: bg,
      };
      if (node.radius) {
        style.borderRadius = node.radius;
        // Clip content when explicit dimensions are set so border-radius is visible
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
        ...getFlexStyles(node.layout),
        ...getSizeStyles(node.width, node.height),
        ...getShadowStyle(node.shadow, tokens),
        ...getPositionStyles(node),
        backgroundColor: bg,
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
        ...getFlexStyles(node.layout),
        ...getShadowStyle(node.shadow, tokens),
        width: '100%',
        height: node.height,
        backgroundColor: bg,
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
      const borderColor = resolveTokenColor(node.color ?? 'border-default', tokenMap);
      return (
        <hr
          key={node.id}
          data-node={node.id}
          style={{
            border: 'none',
            borderTop: `1px solid ${borderColor ?? '#333'}`,
            width: '100%',
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
  const catalogId = node.catalogId ?? '';

  // Button variants
  if (catalogId.startsWith('button-')) {
    return renderButtonVariant(node, catalogId, tokenMap);
  }

  // Badge variants
  if (catalogId.startsWith('badge')) {
    return renderBadgeVariant(node, catalogId, tokenMap);
  }

  switch (catalogId) {
    case 'avatar':
      return renderAvatar(node);
    case 'card':
      return renderCard(node, children, tokens, tokenMap);
    case 'input-text':
      return renderInputText(node, tokens, tokenMap);
    case 'input-currency':
      return renderInputCurrency(node, tokens, tokenMap);
    case 'search-input':
      return renderSearchInput(node);
    case 'select':
      return renderSelect(node, tokens, tokenMap);
    case 'segmented-control':
      return renderSegmentedControl(node, tokenMap);
    case 'stepper':
      return renderStepper(node, tokenMap);
    case 'display-readonly':
      return renderDisplayReadonly(node, tokens, tokenMap);
    case 'checkbox':
      return renderCheckboxNode(node, tokens, tokenMap);
    case 'stat':
      return renderStat(node, tokens, tokenMap);
    case 'chip': {
      const chipStyle: React.CSSProperties = getSizeStyles(node.width, node.height);
      return <Badge key={node.id} data-node={node.id} data-catalog="chip" variant="outline" style={Object.keys(chipStyle).length ? chipStyle : undefined}>{node.label ?? ''}</Badge>;
    }
    case 'progress-bar-active':
      return renderProgressBar(node);
    case 'pagination':
      return renderPagination(node);
    case 'tooltip':
      return (
        <div key={node.id} data-node={node.id} data-catalog={catalogId}>
          {children}
        </div>
      );
    default: {
      // Unknown catalog — render children in a div
      const defStyle = getPositionStyles(node);
      return (
        <div key={node.id} data-node={node.id} data-catalog={catalogId} style={Object.keys(defStyle).length ? defStyle : undefined}>
          {children}
        </div>
      );
    }
  }
}

// ─── Catalog Component Renderers ────────────────────────

function renderButtonVariant(
  node: ResolvedNode,
  catalogId: string,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const variantMap: Record<string, string> = {
    'button-primary': 'default',
    'button-secondary': 'outline',
    'button-destructive': 'destructive',
    'button-ghost': 'ghost',
  };
  const variant = variantMap[catalogId] ?? 'default';
  const style: React.CSSProperties = {
    ...getSizeStyles(node.width, node.height ?? 48),
    borderRadius: node.radius,
  };
  return (
    <Button key={node.id} data-node={node.id} data-catalog={catalogId} variant={variant} style={style}>
      {node.label ?? 'Button'}
    </Button>
  );
}

function renderBadgeVariant(
  node: ResolvedNode,
  catalogId: string,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const bg = resolveTokenColor(node.background, tokenMap);
  const textColor = resolveTokenColor(node.color, tokenMap);
  // Catalog badge variants define opacity for the background only (e.g., warning @ 0.15),
  // while the text stays at full opacity. Use a semi-transparent background with solid text.
  const opacity = node.catalogEntry?.opacity as number | undefined;
  const style: React.CSSProperties = { position: 'relative' };
  if (textColor) style.color = textColor;
  if (node.radius) style.borderRadius = node.radius;
  if (node.width) style.width = node.width === 'fill' ? '100%' : node.width;
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

function renderAvatar(node: ResolvedNode): React.ReactNode {
  const label = node.label ?? '';
  const initials = label
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return (
    <Avatar key={node.id} data-node={node.id} data-catalog="avatar">
      <AvatarFallback>{initials || '?'}</AvatarFallback>
    </Avatar>
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
    ...getSizeStyles(node.width, node.height),
    ...getShadowStyle(node.shadow, tokens),
    ...getPositionStyles(node),
    backgroundColor: bg,
    borderRadius: node.radius ?? 20,
    padding: node.padding ?? node.catalogEntry?.padding ?? 24,
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
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="input-text" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...getSizeStyles(node.width, node.height) }}>
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
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="input-currency" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...getSizeStyles(node.width, node.height) }}>
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

function renderSearchInput(node: ResolvedNode): React.ReactNode {
  const style: React.CSSProperties = getSizeStyles(node.width, node.height);
  return (
    <Input
      key={node.id}
      data-node={node.id}
      data-catalog="search-input"
      type="search"
      placeholder={node.placeholder ?? 'Search...'}
      style={Object.keys(style).length ? style : undefined}
    />
  );
}

function renderSelect(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  const borderColor = resolveTokenColor('border-default', tokenMap);
  const bg = resolveTokenColor('background-primary', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  return (
    <div key={node.id} data-node={node.id} data-catalog="select" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...getSizeStyles(node.width, node.height) }}>
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
): React.ReactNode {
  const borderColor = resolveTokenColor('border-default', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="stepper"
      style={{
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
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="display-readonly" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
): React.ReactNode {
  const fg = resolveTokenColor('text-primary', tokenMap);
  return (
    <div
      key={node.id}
      data-node={node.id}
      data-catalog="checkbox"
      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}
    >
      <Checkbox id={node.id} />
      {node.label && (
        <label htmlFor={node.id} style={{ fontSize: 14, color: fg, cursor: 'pointer' }}>
          {node.label}
        </label>
      )}
    </div>
  );
}

function renderStat(
  node: ResolvedNode,
  tokens: RendererTokens,
  tokenMap: TokenColorMap,
): React.ReactNode {
  const labelColor = resolveTokenColor('text-secondary', tokenMap);
  const fg = resolveTokenColor('text-primary', tokenMap);
  const labelStyle = getTypographyStyles('label', tokens);
  return (
    <div key={node.id} data-node={node.id} data-catalog="stat" style={{ display: 'flex', flexDirection: 'column', gap: 4, ...getSizeStyles(node.width, node.height) }}>
      <span style={{ ...labelStyle, color: labelColor }}>{node.label ?? ''}</span>
      <span style={{ fontSize: 24, fontWeight: 700, color: fg }}>
        {node.value ?? node.content ?? ''}
      </span>
    </div>
  );
}

function renderProgressBar(node: ResolvedNode): React.ReactNode {
  const value = typeof node.value === 'number' ? node.value : 0;
  const style: React.CSSProperties = getSizeStyles(node.width, undefined);
  return (
    <Progress key={node.id} data-node={node.id} data-catalog="progress-bar-active" value={value} style={style} />
  );
}

function renderPagination(node: ResolvedNode): React.ReactNode {
  return (
    <Pagination key={node.id} data-node={node.id} data-catalog="pagination">
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
