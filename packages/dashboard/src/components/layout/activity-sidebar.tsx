'use client';

/** Represents a single activity event in the feed. */
interface ActivityEvent {
  id: string;
  icon: string;
  description: string;
  timestamp: string;
}

/** HITL level configuration per phase. */
interface HitlPhaseConfig {
  phase: string;
  level: 'full' | 'selective' | 'audit-only';
}

const MOCK_EVENTS: ActivityEvent[] = [
  {
    id: '1',
    icon: '\u2705',
    description: 'Task TSK-042 approved by reviewer',
    timestamp: '2m ago',
  },
  {
    id: '2',
    icon: '\u{1F916}',
    description: 'CodeGen agent started on auth module',
    timestamp: '5m ago',
  },
  {
    id: '3',
    icon: '\u{1F6E1}\uFE0F',
    description: 'Governance check passed for PR #18',
    timestamp: '8m ago',
  },
  {
    id: '4',
    icon: '\u{1F4B0}',
    description: 'Budget alert: 15% of daily limit used',
    timestamp: '12m ago',
  },
  {
    id: '5',
    icon: '\u{1F504}',
    description: 'Pipeline advanced to Code Gen phase',
    timestamp: '18m ago',
  },
  {
    id: '6',
    icon: '\u{1F4CB}',
    description: 'Task TSK-041 marked as complete',
    timestamp: '25m ago',
  },
  {
    id: '7',
    icon: '\u{1F50D}',
    description: 'Trace captured for spec-gen run #7',
    timestamp: '30m ago',
  },
];

const HITL_CONFIG: HitlPhaseConfig[] = [
  { phase: 'Spec', level: 'full' },
  { phase: 'Code Gen', level: 'selective' },
  { phase: 'Review', level: 'selective' },
  { phase: 'Test', level: 'audit-only' },
  { phase: 'Deploy', level: 'full' },
];

const LEVEL_COLORS: Record<HitlPhaseConfig['level'], string> = {
  full: 'bg-accent-green/20 text-accent-green',
  selective: 'bg-accent-yellow/20 text-accent-yellow',
  'audit-only': 'bg-accent-blue/20 text-accent-blue',
};

export interface ActivitySidebarProps {
  /** Whether the sidebar is open. */
  open: boolean;
  /** Callback to toggle visibility. */
  onToggle: () => void;
}

/** Right-hand activity feed and HITL config sidebar. */
export function ActivitySidebar({ open, onToggle }: ActivitySidebarProps) {
  return (
    <div className="relative flex">
      {/* Toggle button (always visible) */}
      <button
        onClick={onToggle}
        className="absolute -left-6 top-4 z-10 w-6 h-8 flex items-center justify-center bg-sidebar border border-border border-r-0 rounded-l text-text-muted hover:text-text-primary transition-colors"
        aria-label={open ? 'Close activity sidebar' : 'Open activity sidebar'}
      >
        <span className="text-[10px]">{open ? '\u{25B6}' : '\u{25C0}'}</span>
      </button>

      {open && (
        <aside className="w-[280px] h-full bg-sidebar border-l border-border flex flex-col overflow-hidden">
          {/* Event feed */}
          <div className="flex-1 overflow-y-auto">
            <h2 className="text-text-primary text-sm font-semibold px-4 pt-4 pb-2">
              Activity
            </h2>
            <ul className="flex flex-col">
              {MOCK_EVENTS.map((event) => (
                <li
                  key={event.id}
                  className="flex items-start gap-2.5 px-4 py-2.5 border-b border-border/50 hover:bg-bg-elevated/30 transition-colors"
                >
                  <span className="text-sm flex-shrink-0 mt-0.5">
                    {event.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-secondary text-xs leading-relaxed">
                      {event.description}
                    </p>
                    <p className="text-text-muted text-[10px] mt-0.5">
                      {event.timestamp}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* HITL config summary */}
          <div className="border-t border-border px-4 py-3">
            <h3 className="text-text-primary text-xs font-semibold mb-2">
              HITL Configuration
            </h3>
            <div className="flex flex-col gap-1.5">
              {HITL_CONFIG.map((cfg) => (
                <div
                  key={cfg.phase}
                  className="flex items-center justify-between"
                >
                  <span className="text-text-muted text-[11px]">
                    {cfg.phase}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[cfg.level]}`}
                  >
                    {cfg.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
