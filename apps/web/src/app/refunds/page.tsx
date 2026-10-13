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

type Refund = {
  id: string;
  amountMinor: number;
  status: string;
  reason?: string;
  createdAt: string;
  payment?: { id: string; amountMinor: number; providerRef?: string };
};

type Payment = {
  id: string;
  amountMinor: number;
  status: string;
  providerRef?: string | null;
  invoice?: { invoiceNumber?: string };
};

function statusVariant(status: string) {
  if (status === 'PAID') return 'success' as const;
  if (status === 'PENDING') return 'warning' as const;
  if (status === 'FAILED') return 'danger' as const;
  return 'muted' as const;
}

export default function RefundsPage() {
  const [showForm, setShowForm] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [amountMajor, setAmountMajor] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['refunds'],
    queryFn: () => api<Refund[]>('/refunds'),
  });
  const payments = useQuery({
    queryKey: ['payments-for-refund'],
    queryFn: () => api<Payment[]>('/payments'),
    enabled: showForm,
  });

  const create = useMutation({
    mutationFn: () =>
      api('/refunds', {
        method: 'POST',
        body: {
          paymentId,
          amountMinor: Math.round(Number(amountMajor) * 100),
          reason: reason || undefined,
        },
      }),
    onSuccess: async () => {
      setShowForm(false);
      setPaymentId('');
      setAmountMajor('');
      setReason('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed'),
  });

  const decide = useMutation({
    mutationFn: ({ id, path }: { id: string; path: 'approve' | 'reject' }) =>
      api(`/refunds/${id}/${path}`, {
        method: 'POST',
        body: path === 'reject' ? { reason: 'Rejected via dual-control console' } : {},
      }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['refunds'] });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Decision failed'),
  });

  const maintenance = useMutation({
    mutationFn: () => api('/jobs/maintenance', { method: 'POST', body: {} }),
  });

  const pendingCount = list.data?.filter((r) => r.status === 'PENDING').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refunds"
        description="Dual-control refunds — request, then approve or reject before funds are marked refunded"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => maintenance.mutate()} disabled={maintenance.isPending}>
              Run maintenance jobs
            </Button>
            <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Request refund'}</Button>
          </div>
        }
      />

      {pendingCount > 0 ? (
        <div className="rounded-lg border border-brass/30 bg-brass/5 px-4 py-3 text-sm">
          <span className="font-medium text-navy dark:text-foreground">{pendingCount} refund(s)</span>
          <span className="text-muted-foreground"> awaiting dual-control approval.</span>
        </div>
      ) : null}

      {actionError && <p className="text-sm text-red-700">{actionError}</p>}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Request refund</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="paymentId">Payment</Label>
              <select
                id="paymentId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={paymentId}
                onChange={(e) => {
                  setPaymentId(e.target.value);
                  const p = payments.data?.find((x) => x.id === e.target.value);
                  if (p) setAmountMajor(String(p.amountMinor / 100));
                }}
              >
                <option value="">Select paid payment</option>
                {(payments.data ?? [])
                  .filter((p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.invoice?.invoiceNumber || p.providerRef || p.id.slice(0, 8)} —{' '}
                      {formatMoney(p.amountMinor)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (NGN)</Label>
              <Input id="amount" value={amountMajor} onChange={(e) => setAmountMajor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Submitting creates a PENDING refund. A second officer must approve before the payment is marked
              refunded.
            </p>
            <Button disabled={!paymentId || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Submitting…' : 'Submit for approval'}
            </Button>
          </CardContent>
        </Card>
      )}

      {list.isLoading && <LoadingState label="Loading refunds…" />}
      {list.error && (
        <ErrorState
          message={list.error instanceof Error ? list.error.message : 'Failed'}
          onRetry={() => list.refetch()}
        />
      )}
      {list.data && (
        <DataTable
          searchPlaceholder="Search refund, payment, reason…"
          columns={[
            { key: 'id', label: 'Refund', primary: true, mono: true, sticky: 'left' },
            { key: 'payment', label: 'Payment', mono: true },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'status', label: 'Status', align: 'center' },
            { key: 'reason', label: 'Reason' },
            { key: 'created', label: 'Created' },
            { key: 'actions', label: '', sticky: 'right', align: 'right' },
          ]}
          rows={list.data.map((r) => ({
            __id: r.id,
            __search: `${r.id} ${r.payment?.providerRef ?? ''} ${r.payment?.id ?? ''} ${r.status} ${r.reason ?? ''}`,
            id: <span className="cell-code">{r.id.slice(0, 10)}</span>,
            payment: (
              <span className="font-mono text-xs text-muted-foreground">
                {r.payment?.providerRef ?? r.payment?.id?.slice(0, 10) ?? '—'}
              </span>
            ),
            amount: <span className="cell-money">{formatMoney(r.amountMinor)}</span>,
            status: <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
            reason: <span className="cell-meta max-w-[14rem]">{r.reason ?? '—'}</span>,
            created: <span className="whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</span>,
            actions:
              r.status === 'PENDING' ? (
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, path: 'approve' })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, path: 'reject' })}
                  >
                    Reject
                  </Button>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          }))}
        />
      )}
    </div>
  );
}
