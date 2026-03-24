'use client';

/** Props for the audit filters bar. */
export interface AuditFiltersProps {
  /** Current search query. */
  search: string;
  /** Callback when search query changes. */
  onSearchChange: (value: string) => void;
  /** Currently selected agent filter. */
  agentFilter: string;
  /** Callback when agent filter changes. */
  onAgentFilterChange: (value: string) => void;
  /** List of agent names for the dropdown. */
  agents: string[];
  /** Callback when export CSV is clicked. */
  onExportCsv: () => void;
}

/** Search, agent filter dropdown, and export CSV button for the audit log. */
export function AuditFilters({
  search,
  onSearchChange,
  agentFilter,
  onAgentFilterChange,
  agents,
  onExportCsv,
}: AuditFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Search input */}
      <div className="flex-1 max-w-sm">
        <input
          type="text"
          placeholder="Search audit log..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg bg-bg-card border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-bg-base"
        />
      </div>

      {/* Agent filter dropdown */}
      <select
        value={agentFilter}
        onChange={(e) => onAgentFilterChange(e.target.value)}
        className="rounded-lg bg-bg-card border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-bg-base appearance-none cursor-pointer"
      >
        <option value="all">All Agents</option>
        {agents.map((agent) => (
          <option key={agent} value={agent}>
            {agent}
          </option>
        ))}
      </select>

      {/* Export CSV */}
      <button
        type="button"
        onClick={onExportCsv}
        className="rounded-lg bg-accent-blue/15 border border-accent-blue/30 px-4 py-2 text-sm font-medium text-accent-blue hover:bg-accent-blue/25 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-bg-base"
      >
        Export CSV
      </button>
    </div>
  );
}
