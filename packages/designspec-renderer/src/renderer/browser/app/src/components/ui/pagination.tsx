import * as React from 'react';
import { cn } from '@/lib/utils';

export function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
}

export function PaginationContent({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul className={cn('flex flex-row items-center gap-1', className)} {...props} />
  );
}

export function PaginationItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li className={cn('', className)} {...props} />;
}

export interface PaginationLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  isActive?: boolean;
}

export function PaginationLink({ className, isActive, style, ...props }: PaginationLinkProps) {
  return (
    <a
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 w-10 cursor-pointer',
        className,
      )}
      style={{
        backgroundColor: isActive ? 'var(--primary)' : 'transparent',
        color: isActive ? 'var(--primary-foreground)' : 'var(--foreground)',
        ...style,
      }}
      aria-current={isActive ? 'page' : undefined}
      {...props}
    />
  );
}

export function PaginationPrevious({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 cursor-pointer gap-1',
        className,
      )}
      style={{ color: 'var(--foreground)' }}
      aria-label="Go to previous page"
      {...props}
    >
      <span aria-hidden="true">&larr;</span>
      <span>Previous</span>
    </a>
  );
}

export function PaginationNext({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 cursor-pointer gap-1',
        className,
      )}
      style={{ color: 'var(--foreground)' }}
      aria-label="Go to next page"
      {...props}
    >
      <span>Next</span>
      <span aria-hidden="true">&rarr;</span>
    </a>
  );
}
