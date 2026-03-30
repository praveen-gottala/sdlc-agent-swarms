/**
 * @module pagination — Pagination renderer (React).
 * Emits shadcn Pagination composite with 3 page links.
 */
import type { ReactComponentRenderer } from './types.js';

/** Render a pagination component with previous/next and 3 page links. */
export const renderPagination: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Pagination', '@/components/ui/pagination');
  ctx.builder.addImport('PaginationContent', '@/components/ui/pagination');
  ctx.builder.addImport('PaginationItem', '@/components/ui/pagination');
  ctx.builder.addImport('PaginationLink', '@/components/ui/pagination');
  ctx.builder.addImport('PaginationNext', '@/components/ui/pagination');
  ctx.builder.addImport('PaginationPrevious', '@/components/ui/pagination');

  ctx.builder.open('Pagination');
  ctx.builder.open('PaginationContent');

  // Previous
  ctx.builder.open('PaginationItem');
  ctx.builder.selfClosing('PaginationPrevious', 'href="#"');
  ctx.builder.close('PaginationItem');

  // Page links (3 pages)
  for (let i = 1; i <= 3; i++) {
    ctx.builder.open('PaginationItem');
    ctx.builder.open('PaginationLink', `href="#"${i === 1 ? ' isActive' : ''}`);
    ctx.builder.text(String(i));
    ctx.builder.close('PaginationLink');
    ctx.builder.close('PaginationItem');
  }

  // Next
  ctx.builder.open('PaginationItem');
  ctx.builder.selfClosing('PaginationNext', 'href="#"');
  ctx.builder.close('PaginationItem');

  ctx.builder.close('PaginationContent');
  ctx.builder.close('Pagination');
};
