'use client';

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
}

export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 4,
}: ProgressRingProps): React.JSX.Element {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;

  const color = progress >= 100
    ? 'var(--color-accent-emerald)'
    : progress >= 60
      ? 'var(--color-accent-blue)'
      : 'var(--color-accent-indigo)';

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out, stroke 0.3s ease' }}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size > 48 ? 14 : 11,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary)',
        }}
      >
        {Math.round(progress)}%
      </span>
    </div>
  );
}
