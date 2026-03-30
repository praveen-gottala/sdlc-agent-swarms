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
  if (width === 'fill') s.width = '100%';
  else if (typeof width === 'number') s.width = width;
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
  return (
    <div key={node.id} data-node={node.id}>
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
        backgroundColor: bg,
      };
      if (typeof node.width === 'number') {
        style.marginLeft = 'auto';
        style.marginRight = 'auto';
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
    case 'chip':
      return <Badge key={node.id} data-node={node.id} variant="outline">{node.label ?? ''}</Badge>;
    case 'progress-bar-active':
      return renderProgressBar(node);
    case 'pagination':
      return renderPagination(node);
    case 'tooltip':
      return (
        <div key={node.id} data-node={node.id}>
          {children}
        </div>
      );
    default:
      // Unknown catalog — render children in a div
      return (
        <div key={node.id} data-node={node.id}>
          {children}
        </div>
      );
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
    <Button key={node.id} data-node={node.id} variant={variant} style={style}>
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
  const style: React.CSSProperties = {};
  if (bg) style.backgroundColor = bg;
  if (textColor) style.color = textColor;
  if (node.radius) style.borderRadius = node.radius;
  return (
    <Badge key={node.id} data-node={node.id} style={style}>
      {node.label ?? ''}
    </Badge>
  );
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
    <Avatar key={node.id} data-node={node.id}>
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
    ...getShadowStyle(node.shadow, tokens),
    backgroundColor: bg,
    borderRadius: node.radius ?? 20,
    padding: node.padding ?? node.catalogEntry?.padding ?? 24,
  };
  return (
    <Card key={node.id} data-node={node.id} style={style}>
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
    <div key={node.id} data-node={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
    <div key={node.id} data-node={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
  return (
    <Input
      key={node.id}
      data-node={node.id}
      type="search"
      placeholder={node.placeholder ?? 'Search...'}
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
    <div key={node.id} data-node={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
    <div key={node.id} data-node={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
    <div key={node.id} data-node={node.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
    <Progress key={node.id} data-node={node.id} value={value} style={style} />
  );
}

function renderPagination(node: ResolvedNode): React.ReactNode {
  return (
    <Pagination key={node.id} data-node={node.id}>
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
