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

type PaymentRequest = {
  id: string;
  paymentCode: string;
  paymentReference: string;
  amountMinor: number;
  status: string;
  payUrl: string;
  expiresAt: string;
  invoice?: { id: string; invoiceNumber: string; payerName: string };
  virtualAccount?: { accountNumber: string; bankName: string } | null;
  payments?: { receipt?: { id: string; receiptNumber: string } | null }[];
};

type Invoice = { id: string; invoiceNumber: string; payerName: string; status: string; totalMinor: number };

function statusVariant(status: string) {
  if (status === 'PAID') return 'success' as const;
  if (status === 'FAILED' || status === 'EXPIRED') return 'danger' as const;
  if (status === 'PENDING' || status === 'PROCESSING') return 'warning' as const;
  return 'muted' as const;
}

export default function PaymentsPage() {
  const [showForm, setShowForm] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const requests = useQuery({
    queryKey: ['payment-requests'],
    queryFn: () => api<PaymentRequest[]>('/payments/requests'),
  });
  const invoices = useQuery({
    queryKey: ['invoices-for-pay'],
    queryFn: () => api<Invoice[]>('/invoices'),
    enabled: showForm,
  });

  const createLink = useMutation({
    mutationFn: () => api('/payments/create-link', { method: 'POST', body: { invoiceId } }),
    onSuccess: async () => {
      setShowForm(false);
      setInvoiceId('');
      await queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed'),
  });

  const share = useMutation({
    mutationFn: ({ code, recipient }: { code: string; recipient: string }) =>
      api(`/payments/${encodeURIComponent(code)}/share`, {
        method: 'POST',
        body: { channel: 'EMAIL', recipient },
      }),
  });

  const simulate = useMutation({
    mutationFn: (paymentCode: string) =>
      api('/payments/simulate', { method: 'POST', body: { paymentCode } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Payment requests, links, virtual accounts, and collections"
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Create payment link'}</Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create payment link from invoice</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="invoiceId">Invoice</Label>
              <select
                id="invoiceId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
              >
                <option value="">Select invoice</option>
                {(invoices.data ?? [])
                  .filter((i) => i.status !== 'PAID' && i.status !== 'CANCELLED')
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoiceNumber} — {i.payerName} ({formatMoney(i.totalMinor)})
                    </option>
                  ))}
              </select>
            </div>
            {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
            <Button disabled={!invoiceId || createLink.isPending} onClick={() => createLink.mutate()}>
              {createLink.isPending ? 'Creating…' : 'Generate link + VA'}
            </Button>
          </CardContent>
        </Card>
      )}

      {requests.isLoading && <LoadingState label="Loading payment requests…" />}
      {requests.error && (
        <ErrorState
          message={requests.error instanceof Error ? requests.error.message : 'Failed'}
          onRetry={() => requests.refetch()}
        />
      )}
      {requests.data && (
        <DataTable
          searchPlaceholder="Search code, invoice, payer, status…"
          columns={[
            { key: 'code', label: 'Code', primary: true, mono: true, sticky: 'left' },
            { key: 'invoice', label: 'Invoice / payer' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'va', label: 'Virtual account' },
            { key: 'status', label: 'Status', align: 'center' },
            { key: 'expires', label: 'Expires' },
            { key: 'actions', label: '', sticky: 'right', align: 'right' },
          ]}
          rows={requests.data.map((p) => ({
            __id: p.id,
            __search: [
              p.paymentCode,
              p.invoice?.invoiceNumber,
              p.invoice?.payerName,
              p.status,
              p.virtualAccount?.bankName,
              p.virtualAccount?.accountNumber,
              p.payments?.[0]?.receipt?.receiptNumber,
            ]
              .filter(Boolean)
              .join(' '),
            code: <span className="cell-code">{p.paymentCode}</span>,
            invoice: (
              <div className="cell-stack">
                <div className="cell-primary">{p.invoice?.invoiceNumber || '—'}</div>
                <div className="cell-meta">{p.invoice?.payerName || '—'}</div>
              </div>
            ),
            amount: <span className="cell-money">{formatMoney(p.amountMinor)}</span>,
            va: p.virtualAccount ? (
              <div className="cell-stack">
                <div className="cell-primary">{p.virtualAccount.bankName}</div>
                <div className="cell-meta font-mono tabular-nums">{p.virtualAccount.accountNumber}</div>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
            status: <Badge variant={statusVariant(p.status)}>{p.status}</Badge>,
            expires: <span className="whitespace-nowrap text-muted-foreground">{formatDate(p.expiresAt)}</span>,
            actions: (
              <div className="flex min-w-[11rem] flex-col items-end gap-1.5">
                {p.payUrl && (
                  <a
                    className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                    href={p.payUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open pay page
                  </a>
                )}
                {p.status === 'PENDING' && (
                  <>
                    <div className="flex w-full max-w-[16rem] flex-col gap-1 sm:flex-row sm:items-center">
                      <Input
                        className="h-8 min-w-0 flex-1 text-xs"
                        placeholder="Email to share"
                        value={shareEmail}
                        onChange={(e) => setShareEmail(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0"
                        disabled={!shareEmail || share.isPending}
                        onClick={() => share.mutate({ code: p.paymentCode, recipient: shareEmail })}
                      >
                        Share
                      </Button>
                    </div>
                    {process.env.NODE_ENV !== 'production' && (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => simulate.mutate(p.paymentCode)}>
                        Simulate
                      </Button>
                    )}
                  </>
                )}
                {p.payments?.[0]?.receipt?.receiptNumber && (
                  <a
                    className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                    href={`/receipts/${encodeURIComponent(p.payments[0].receipt.receiptNumber)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Receipt {p.payments[0].receipt.receiptNumber}
                  </a>
                )}
              </div>
            ),
          }))}
        />
      )}
    </div>
  );
}
