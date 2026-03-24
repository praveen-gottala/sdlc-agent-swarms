'use client';

type SpecStatus = 'designed' | 'specced' | 'coded' | 'tested' | 'deployed';

interface StatusBadgeProps {
  status: SpecStatus;
}

const statusStyles: Record<SpecStatus, { bg: string; text: string; label: string }> = {
  designed: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Designed' },
  specced: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Specced' },
  coded: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Coded' },
  tested: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Tested' },
  deployed: { bg: 'bg-teal-500/20', text: 'text-teal-400', label: 'Deployed' },
};

/** Colored badge indicating the status of a spec component. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
