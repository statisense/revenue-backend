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

export default function RefundsPage() {
  const [showForm, setShowForm] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [amountMajor, setAmountMajor] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
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
      await queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed'),
  });

  const maintenance = useMutation({
    mutationFn: () => api('/jobs/maintenance', { method: 'POST', body: {} }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refunds"
        description="Issue refunds against collected payments"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => maintenance.mutate()} disabled={maintenance.isPending}>
              Run maintenance jobs
            </Button>
            <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'New refund'}</Button>
          </div>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create refund</CardTitle>
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
                      {p.invoice?.invoiceNumber || p.providerRef || p.id.slice(0, 8)} — {formatMoney(p.amountMinor)}
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
            <Button disabled={!paymentId || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? 'Submitting…' : 'Submit refund'}
            </Button>
          </CardContent>
        </Card>
      )}

      {list.isLoading && <LoadingState label="Loading refunds…" />}
      {list.error && (
        <ErrorState message={list.error instanceof Error ? list.error.message : 'Failed'} onRetry={() => list.refetch()} />
      )}
      {list.data && (
        <DataTable
          searchPlaceholder="Search refund, payment, reason…"
          columns={[
            { key: 'id', label: 'Refund' },
            { key: 'payment', label: 'Payment' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'reason', label: 'Reason' },
            { key: 'created', label: 'Created' },
          ]}
          rows={list.data.map((r) => ({
            __id: r.id,
            __search: `${r.id} ${r.payment?.providerRef ?? ''} ${r.payment?.id ?? ''} ${r.status} ${r.reason ?? ''}`,
            id: r.id.slice(0, 10),
            payment: r.payment?.providerRef ?? r.payment?.id?.slice(0, 10) ?? '—',
            amount: formatMoney(r.amountMinor),
            status: <Badge>{r.status}</Badge>,
            reason: r.reason ?? '—',
            created: formatDate(r.createdAt),
          }))}
        />
      )}
    </div>
  );
}
