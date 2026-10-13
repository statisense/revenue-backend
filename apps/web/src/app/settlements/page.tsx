'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, Label, LoadingState, PageHeader } from '@/components/page-shell';

type Settlement = {
  id: string;
  amountMinor?: number;
  status: string;
  createdAt?: string;
  paymentReference?: string;
};

type Batch = {
  id: string;
  batchNumber?: string;
  status: string;
  totalMinor?: number;
  createdAt?: string;
  tsaReference?: string | null;
};

export default function SettlementsPage() {
  const [settleId, setSettleId] = useState<string | null>(null);
  const [tsaReference, setTsaReference] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const settlements = useQuery({
    queryKey: ['settlements'],
    queryFn: () => api<Settlement[]>('/settlements'),
  });
  const batches = useQuery({
    queryKey: ['settlement-batches'],
    queryFn: () => api<Batch[]>('/settlements/batches'),
  });

  const createBatch = useMutation({
    mutationFn: () => api('/settlements/batches', { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settlements'] }),
        queryClient.invalidateQueries({ queryKey: ['settlement-batches'] }),
      ]);
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Batch create failed'),
  });

  const settleBatch = useMutation({
    mutationFn: () =>
      api(`/settlements/batches/${settleId}/settle`, {
        method: 'POST',
        body: { tsaReference },
      }),
    onSuccess: async () => {
      setSettleId(null);
      setTsaReference('');
      await queryClient.invalidateQueries({ queryKey: ['settlement-batches'] });
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Settle failed'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settlements"
        description="Treasury settlement batches and line items"
        actions={
          <Button onClick={() => createBatch.mutate()} disabled={createBatch.isPending}>
            {createBatch.isPending ? 'Creating…' : 'Create batch'}
          </Button>
        }
      />

      {actionError && <div className="mb-4"><ErrorState message={actionError} /></div>}

      {settleId && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Mark batch settled</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tsa">TSA reference</Label>
              <Input id="tsa" value={tsaReference} onChange={(e) => setTsaReference(e.target.value)} />
            </div>
            <Button
              onClick={() => settleBatch.mutate()}
              disabled={!tsaReference || settleBatch.isPending}
            >
              Confirm
            </Button>
            <Button variant="ghost" onClick={() => setSettleId(null)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="h-0.5 w-6 rounded-full bg-gradient-to-r from-brass to-accent" />
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">01 · Batches</p>
        </div>
        <h2 className="font-serif text-xl text-navy dark:text-foreground">Settlement batches</h2>
      </div>
      {batches.isLoading && <div className="mb-6"><LoadingState label="Loading batches…" /></div>}
      {batches.error && (
        <ErrorState
          message={batches.error instanceof Error ? batches.error.message : 'Failed to load batches'}
          onRetry={() => batches.refetch()}
        />
      )}
      {batches.data && (
        <div className="mb-8">
          <DataTable
            searchPlaceholder="Search batch, status, TSA ref…"
            columns={[
              { key: 'number', label: 'Batch', primary: true, mono: true, sticky: 'left' },
              { key: 'amount', label: 'Total', align: 'right' },
              { key: 'status', label: 'Status', align: 'center' },
              { key: 'created', label: 'Created' },
              { key: 'actions', label: '', sticky: 'right', align: 'right' },
            ]}
            rows={batches.data.map((b) => ({
              __id: b.id,
              __search: `${b.batchNumber || ''} ${b.id} ${b.status} ${b.tsaReference || ''}`,
              number: <span className="cell-code">{b.batchNumber || b.id.slice(0, 8)}</span>,
              amount: <span className="cell-money">{formatMoney(b.totalMinor ?? 0)}</span>,
              status: (
                <Badge variant={b.status === 'SETTLED' ? 'success' : 'warning'}>{b.status}</Badge>
              ),
              created: <span className="whitespace-nowrap text-muted-foreground">{formatDate(b.createdAt)}</span>,
              actions:
                b.status === 'PENDING' ? (
                  <Button size="sm" variant="outline" onClick={() => setSettleId(b.id)}>
                    Settle
                  </Button>
                ) : (
                  b.tsaReference || '—'
                ),
            }))}
          />
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="h-0.5 w-6 rounded-full bg-gradient-to-r from-brass to-accent" />
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">02 · Lines</p>
        </div>
        <h2 className="font-serif text-xl text-navy dark:text-foreground">Settlement lines</h2>
      </div>
      {settlements.isLoading && <LoadingState label="Loading settlement lines…" />}
      {settlements.error && (
        <ErrorState
          message={settlements.error instanceof Error ? settlements.error.message : 'Failed to load'}
          onRetry={() => settlements.refetch()}
        />
      )}
      {settlements.data && (
        <DataTable
          searchPlaceholder="Search ID, reference, status…"
          columns={[
            { key: 'id', label: 'ID', primary: true, mono: true },
            { key: 'ref', label: 'Reference', mono: true },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'status', label: 'Status', align: 'center' },
            { key: 'created', label: 'Created' },
          ]}
          rows={settlements.data.map((s) => ({
            __id: s.id,
            __search: `${s.id} ${s.paymentReference || ''} ${s.status}`,
            id: <span className="cell-code">{s.id.slice(0, 8)}</span>,
            ref: <span className="font-mono text-xs">{s.paymentReference || '—'}</span>,
            amount: <span className="cell-money">{formatMoney(s.amountMinor ?? 0)}</span>,
            status: <Badge variant="outline">{s.status}</Badge>,
            created: <span className="whitespace-nowrap text-muted-foreground">{formatDate(s.createdAt)}</span>,
          }))}
        />
      )}
    </div>
  );
}
