import React from 'react';

export interface TagProps {
  /** Tailwind color class for the dot and background tint, e.g. 'accent-blue'. */
  color?: string;
  children: React.ReactNode;
  className?: string;
}

const colorMap: Record<string, { bg: string; text: string; dot: string }> = {
  green: {
    bg: 'bg-accent-green/10',
    text: 'text-accent-green',
    dot: 'bg-accent-green',
  },
  orange: {
    bg: 'bg-accent-orange/10',
    text: 'text-accent-orange',
    dot: 'bg-accent-orange',
  },
  yellow: {
    bg: 'bg-accent-yellow/10',
    text: 'text-accent-yellow',
    dot: 'bg-accent-yellow',
  },
  red: {
    bg: 'bg-accent-red/10',
    text: 'text-accent-red',
    dot: 'bg-accent-red',
  },
  purple: {
    bg: 'bg-accent-purple/10',
    text: 'text-accent-purple',
    dot: 'bg-accent-purple',
  },
  blue: {
    bg: 'bg-accent-blue/10',
    text: 'text-accent-blue',
    dot: 'bg-accent-blue',
  },
  cyan: {
    bg: 'bg-accent-cyan/10',
    text: 'text-accent-cyan',
    dot: 'bg-accent-cyan',
  },
  teal: {
    bg: 'bg-accent-teal/10',
    text: 'text-accent-teal',
    dot: 'bg-accent-teal',
  },
};

const defaultColor = {
  bg: 'bg-bg-elevated',
  text: 'text-text-secondary',
  dot: 'bg-text-muted',
};

/**
 * Small colored tag/pill for categories.
 */
export function Tag({ color, children, className = '' }: TagProps) {
  const resolved = color && color in colorMap ? colorMap[color] : defaultColor;

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        resolved.bg,
        resolved.text,
        className,
      ].join(' ')}
    >
      <span
        className={['inline-block h-1.5 w-1.5 rounded-full', resolved.dot].join(' ')}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
