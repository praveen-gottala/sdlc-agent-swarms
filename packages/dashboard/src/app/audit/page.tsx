'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { AuditFilters } from '../../components/audit/audit-filters';
import { AuditTable } from '../../components/audit/audit-table';
import type { AuditEntry } from '../../components/audit/audit-table';

/** Audit log page with search, filters, and paginated table. */
export default function AuditPage() {
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState('all');

  useEffect(() => {
    fetch('/api/audit')
      .then(res => res.json())
      .then(json => {
        const apiEntries = json.entries ?? json.data ?? [];
        // Map API audit entries to the AuditEntry shape expected by AuditTable
        const mapped: AuditEntry[] = apiEntries.map((e: Record<string, unknown>) => ({
          timestamp: e.timestamp as string,
          agent: e.agent as string,
          action: e.action as string,
          task: (e.resource as string) ?? '',
          cost: 0,
          channel: (e.phase as string) ?? '',
          commitSha: (e.id as string) ?? '',
        }));
        setAllEntries(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const agents = useMemo(() => {
    const unique = new Set(allEntries.map((e) => e.agent));
    return Array.from(unique).sort();
  }, [allEntries]);

  const filtered = useMemo(() => {
    let result = allEntries;
    if (agentFilter !== 'all') {
      result = result.filter((e) => e.agent === agentFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.task.toLowerCase().includes(q) ||
          e.agent.toLowerCase().includes(q) ||
          e.channel.toLowerCase().includes(q) ||
          e.commitSha.toLowerCase().includes(q),
      );
    }
    return result;
  }, [search, agentFilter, allEntries]);

  const handleExportCsv = useCallback(() => {
    const header = 'Timestamp,Agent,Action,Task,Cost,Channel,Commit SHA';
    const rows = filtered.map(
      (e) =>
        `${e.timestamp},${e.agent},${e.action},${e.task},${e.cost.toFixed(2)},${e.channel},${e.commitSha}`,
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agentforge-audit-log.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Audit Log</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Complete audit trail of all agent actions and events
        </p>
      </div>

      {/* Filters */}
      <AuditFilters
        search={search}
        onSearchChange={setSearch}
        agentFilter={agentFilter}
        onAgentFilterChange={setAgentFilter}
        agents={agents}
        onExportCsv={handleExportCsv}
      />

      {/* Table */}
      <AuditTable entries={filtered} pageSize={20} />
    </div>
  );
}
