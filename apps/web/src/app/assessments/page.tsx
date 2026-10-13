'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, Label, LoadingState, PageHeader } from '@/components/page-shell';

type RevenueType = { id: string; code: string; name: string; defaultAmountMinor?: number | null };
type TaxType = { id: string; code: string; name: string; ratePercent: number | string };
type Assessment = {
  id: string;
  assessmentNumber?: string;
  payerName: string;
  status: string;
  subtotalMinor?: number;
  taxMinor?: number;
  totalMinor: number;
  createdAt: string;
};

const schema = z.object({
  payerName: z.string().min(2),
  payerTin: z.string().optional(),
  payerEmail: z.string().email().optional().or(z.literal('')),
  payerPhone: z.string().optional(),
  revenueTypeId: z.string().min(1),
  taxTypeId: z.string().optional(),
  description: z.string().min(2),
  quantity: z.string().min(1),
  unitAmountMajor: z.string().min(1),
});

function statusVariant(status: string) {
  if (status === 'APPROVED' || status === 'INVOICED') return 'success' as const;
  if (status === 'REJECTED') return 'danger' as const;
  if (status === 'PENDING_APPROVAL') return 'warning' as const;
  return 'muted' as const;
}

function moneyMajor(n: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n);
}

export default function AssessmentsPage() {
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['assessments'],
    queryFn: () => api<Assessment[]>('/assessments'),
  });
  const types = useQuery({
    queryKey: ['revenue-types'],
    queryFn: () => api<RevenueType[]>('/revenue/types'),
  });
  const taxes = useQuery({
    queryKey: ['tax-types'],
    queryFn: () => api<TaxType[]>('/revenue/taxes'),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      payerName: '',
      payerTin: '',
      payerEmail: '',
      payerPhone: '',
      revenueTypeId: '',
      taxTypeId: '',
      description: '',
      quantity: '1',
      unitAmountMajor: '',
    },
  });

  const watched = useWatch({ control: form.control });
  const preview = useMemo(() => {
    const qty = Number(watched.quantity) || 0;
    const unit = Number(watched.unitAmountMajor) || 0;
    const base = qty * unit;
    const tax = taxes.data?.find((t) => t.id === watched.taxTypeId);
    const rate = tax ? Number(tax.ratePercent) : 0;
    const taxAmount = (base * rate) / 100;
    return { base, rate, taxAmount, total: base + taxAmount };
  }, [watched.quantity, watched.unitAmountMajor, watched.taxTypeId, taxes.data]);

  const create = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api('/assessments', {
        method: 'POST',
        body: {
          payerName: values.payerName,
          payerTin: values.payerTin || undefined,
          payerEmail: values.payerEmail || undefined,
          payerPhone: values.payerPhone || undefined,
          lines: [
            {
              revenueTypeId: values.revenueTypeId,
              taxTypeId: values.taxTypeId || undefined,
              description: values.description,
              quantity: Number(values.quantity),
              unitAmountMinor: Math.round(Number(values.unitAmountMajor) * 100),
            },
          ],
        },
      }),
    onSuccess: async () => {
      setShowForm(false);
      form.reset({ quantity: '1', taxTypeId: '' });
      await queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Create failed'),
  });

  const action = useMutation({
    mutationFn: ({ id, path }: { id: string; path: string }) =>
      api(`/assessments/${id}/${path}`, {
        method: 'POST',
        body: { comments: comment || `${path} via admin console` },
      }),
    onSuccess: async () => {
      setActionError(null);
      setComment('');
      await queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Action failed'),
  });

  const invoiceFrom = useMutation({
    mutationFn: (id: string) =>
      api(`/invoices/from-assessment/${id}`, { method: 'POST', body: { dueInHours: 72 } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assessments'] });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Invoice failed'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessments"
        description="Create, submit, and approve Government Revenue assessments"
        actions={<Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'New assessment'}</Button>}
      />

      {actionError && <p className="mb-4 text-sm text-red-700">{actionError}</p>}
      <div className="mb-4 max-w-md space-y-1.5">
        <Label htmlFor="approvalComment">Approval / rejection comment</Label>
        <Input
          id="approvalComment"
          placeholder="Optional comment for submit / approve / reject"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={form.handleSubmit((v) => create.mutate(v))}
            >
              <div className="space-y-1.5">
                <Label htmlFor="payerName">Payer name</Label>
                <Input id="payerName" {...form.register('payerName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payerTin">TIN / Tax ID</Label>
                <Input
                  id="payerTin"
                  placeholder="Optional taxpayer identification number"
                  {...form.register('payerTin')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payerEmail">Payer email</Label>
                <Input id="payerEmail" type="email" {...form.register('payerEmail')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payerPhone">Payer phone</Label>
                <Input id="payerPhone" {...form.register('payerPhone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="revenueTypeId">Revenue type</Label>
                <select
                  id="revenueTypeId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register('revenueTypeId')}
                  onChange={(e) => {
                    form.register('revenueTypeId').onChange(e);
                    const selected = types.data?.find((t) => t.id === e.target.value);
                    if (selected?.defaultAmountMinor != null) {
                      form.setValue('unitAmountMajor', String(selected.defaultAmountMinor / 100));
                      form.setValue('description', selected.name);
                    }
                  }}
                >
                  <option value="">Select revenue type</option>
                  {(types.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxTypeId">Tax type</Label>
                <select
                  id="taxTypeId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={watched.taxTypeId ?? ''}
                  onChange={(e) => form.setValue('taxTypeId', e.target.value, { shouldDirty: true })}
                >
                  <option value="">No tax / exempt</option>
                  {(taxes.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name} ({Number(t.ratePercent)}%)
                    </option>
                  ))}
                </select>
                {taxes.isLoading && (
                  <p className="text-xs text-muted-foreground">Loading tax types…</p>
                )}
                {taxes.error && (
                  <p className="text-xs text-red-700">
                    Could not load taxes.{' '}
                    <button type="button" className="underline" onClick={() => taxes.refetch()}>
                      Retry
                    </button>
                  </p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Line description</Label>
                <Input id="description" {...form.register('description')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" {...form.register('quantity')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitAmountMajor">Unit amount (NGN)</Label>
                <Input id="unitAmountMajor" {...form.register('unitAmountMajor')} />
              </div>

              <div className="sm:col-span-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Amount to pay
                </p>
                <div className="grid gap-1 sm:grid-cols-3">
                  <p>
                    Revenue base: <span className="font-medium tabular-nums">{moneyMajor(preview.base)}</span>
                  </p>
                  <p>
                    Tax ({preview.rate}%):{' '}
                    <span className="font-medium tabular-nums">{moneyMajor(preview.taxAmount)}</span>
                  </p>
                  <p>
                    Total:{' '}
                    <span className="font-serif text-lg font-medium tabular-nums">
                      {moneyMajor(preview.total)}
                    </span>
                  </p>
                </div>
              </div>

              {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Saving…' : 'Save assessment'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {list.isLoading && <LoadingState label="Loading assessments…" />}
      {list.error && (
        <ErrorState
          message={list.error instanceof Error ? list.error.message : 'Failed to load'}
          onRetry={() => list.refetch()}
        />
      )}
      {list.data && (
        <DataTable
          searchPlaceholder="Search number, payer, status…"
          columns={[
            { key: 'number', label: 'Number' },
            { key: 'payer', label: 'Payer' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'created', label: 'Created' },
            { key: 'actions', label: 'Actions' },
          ]}
          rows={list.data.map((a) => ({
            __id: a.id,
            __search: `${a.assessmentNumber || ''} ${a.id} ${a.payerName} ${a.status}`,
            number: a.assessmentNumber || a.id.slice(0, 8),
            payer: a.payerName,
            amount: (
              <div className="space-y-0.5">
                <div className="font-medium">{formatMoney(a.totalMinor)}</div>
                {(a.taxMinor ?? 0) > 0 ? (
                  <div className="text-xs text-muted-foreground">incl. tax {formatMoney(a.taxMinor ?? 0)}</div>
                ) : null}
              </div>
            ),
            status: <Badge variant={statusVariant(a.status)}>{a.status}</Badge>,
            created: formatDate(a.createdAt),
            actions: (
              <div className="flex flex-wrap gap-1">
                {(a.status === 'DRAFT' || a.status === 'REJECTED') && (
                  <Button size="sm" variant="outline" onClick={() => action.mutate({ id: a.id, path: 'submit' })}>
                    Submit
                  </Button>
                )}
                {a.status === 'PENDING_APPROVAL' && (
                  <>
                    <Button size="sm" onClick={() => action.mutate({ id: a.id, path: 'approve' })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => action.mutate({ id: a.id, path: 'reject' })}>
                      Reject
                    </Button>
                  </>
                )}
                {a.status === 'APPROVED' && (
                  <Button size="sm" onClick={() => invoiceFrom.mutate(a.id)}>
                    Invoice
                  </Button>
                )}
              </div>
            ),
          }))}
        />
      )}
    </div>
  );
}
