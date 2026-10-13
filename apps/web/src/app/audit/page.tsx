'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, LoadingState, PageHeader } from '@/components/page-shell';

type AuditPage = {
  items?: AuditItem[];
  data?: AuditItem[];
  total?: number;
};

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  createdAt: string;
  ipAddress?: string | null;
};

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState('ALL');
  const [entityFilter, setEntityFilter] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit'],
    queryFn: async () => {
      const res = await api<AuditPage | AuditItem[]>('/audit?page=1&limit=200');
      if (Array.isArray(res)) return res;
      return res.items ?? res.data ?? [];
    },
  });

  const actions = useMemo(() => {
    const set = new Set((data ?? []).map((r) => r.action));
    return ['ALL', ...Array.from(set).sort()];
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((row) => {
      if (actionFilter !== 'ALL' && row.action !== actionFilter) return false;
      const q = entityFilter.trim().toLowerCase();
      if (!q) return true;
      return `${row.entityType} ${row.entityId ?? ''} ${row.actorId ?? ''} ${row.ipAddress ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [data, actionFilter, entityFilter]);

  function exportCsv() {
    const rows = [
      ['When', 'Action', 'Entity type', 'Entity ID', 'Actor', 'IP'],
      ...filtered.map((r) => [
        r.createdAt,
        r.action,
        r.entityType,
        r.entityId ?? '',
        r.actorId ?? '',
        r.ipAddress ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ngrs-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description="Immutable activity log for compliance investigations and dual-control evidence"
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-card/80 p-3 shadow-panel sm:flex-row sm:items-center">
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label="Filter by action"
        >
          {actions.map((a) => (
            <option key={a} value={a}>
              {a === 'ALL' ? 'All actions' : a}
            </option>
          ))}
        </select>
        <Input
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          placeholder="Filter entity, actor, IP…"
          className="h-10 sm:max-w-sm"
        />
        <p className="text-xs text-muted-foreground tabular-nums sm:ml-auto">
          {filtered.length} of {data?.length ?? 0} events
        </p>
      </div>

      {isLoading && <LoadingState label="Loading audit trail…" />}
      {error && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load audit log'}
          onRetry={() => refetch()}
        />
      )}
      {data && (
        <DataTable
          searchPlaceholder="Search action, entity, actor, IP…"
          columns={[
            { key: 'when', label: 'When' },
            { key: 'action', label: 'Action' },
            { key: 'entity', label: 'Entity' },
            { key: 'actor', label: 'Actor' },
            { key: 'ip', label: 'IP' },
          ]}
          rows={filtered.map((row) => {
            const entity = `${row.entityType}${row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}`;
            const actor = row.actorId?.slice(0, 8) || '—';
            return {
              __id: row.id,
              __search: `${row.action} ${entity} ${actor} ${row.ipAddress ?? ''} ${formatDate(row.createdAt)}`,
              when: formatDate(row.createdAt),
              action: <Badge variant="outline">{row.action}</Badge>,
              entity,
              actor,
              ip: row.ipAddress || '—',
            };
          })}
        />
      )}
    </div>
  );
}
