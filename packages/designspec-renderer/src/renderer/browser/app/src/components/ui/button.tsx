import * as React from 'react';
import { cn } from '@/lib/utils';

const variantStyles: Record<string, React.CSSProperties> = {
  default: { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' },
  destructive: { backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' },
  outline: { border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--foreground)' },
  secondary: { backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' },
  ghost: { backgroundColor: 'transparent', color: 'var(--foreground)' },
  link: { backgroundColor: 'transparent', color: 'var(--primary)', textDecoration: 'underline' },
};

const sizeClasses: Record<string, string> = {
  default: 'h-9 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-10 rounded-md px-8',
  icon: 'h-9 w-9',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string;
  size?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', style, ...props }, ref) => (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors',
        sizeClasses[size] ?? sizeClasses.default,
        className,
      )}
      style={{ ...variantStyles[variant] ?? variantStyles.default, ...style }}
      ref={ref}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
