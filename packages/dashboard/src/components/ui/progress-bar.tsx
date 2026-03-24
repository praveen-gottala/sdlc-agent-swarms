import React from 'react';

export interface ProgressBarProps {
  /** Progress value between 0 and 100. */
  value: number;
  /** Override the automatic threshold-based color. */
  color?: string;
  /** Show the percentage label. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Resolve the bar color based on thresholds: green < 60, yellow 60-85, red >= 85.
 * If `color` is explicitly provided it takes precedence.
 */
function resolveColor(value: number, color?: string): string {
  if (color) return color;
  if (value >= 85) return 'bg-accent-red';
  if (value >= 60) return 'bg-accent-yellow';
  return 'bg-accent-green';
}

/**
 * Animated progress bar with configurable color.
 * Automatically transitions green -> yellow -> red at thresholds.
 */
export function ProgressBar({
  value,
  color,
  showLabel = false,
  className = '',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const barColor = resolveColor(clamped, color);

  return (
    <div className={['flex items-center gap-2', className].join(' ')}>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div
          className={[
            'absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out',
            barColor,
          ].join(' ')}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="min-w-[2.5rem] text-right text-xs text-text-secondary">
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}
