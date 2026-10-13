'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, Pencil, Ban } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, Label, LoadingState, PageHeader } from '@/components/page-shell';
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/invoice-document';
import { displayAgencyName } from '@/lib/brand';

type RevenueType = { id: string; code: string; name: string; defaultAmountMinor?: number | null };
type TaxType = { id: string; code: string; name: string; ratePercent: number | string };

type InvoiceLine = {
  id?: string;
  revenueTypeId: string;
  taxTypeId?: string | null;
  description: string;
  quantity: number | string;
  unitAmountMinor: number;
  taxRatePercent?: number | string;
  taxMinor?: number;
  lineTotalMinor: number;
  revenueType?: { code: string; name: string } | null;
  taxType?: { code: string; name: string; ratePercent?: number | string } | null;
};

type InvoiceDetail = InvoiceDocumentData & {
  lines: InvoiceLine[];
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  payerName: string;
  payerEmail?: string | null;
  payerPhone?: string | null;
  status: string;
  subtotalMinor?: number;
  taxMinor?: number;
  totalMinor: number;
  amountPaidMinor?: number;
  dueAt?: string | null;
  createdAt: string;
};

const schema = z.object({
  payerName: z.string().min(2),
  payerEmail: z.string().email().optional().or(z.literal('')),
  payerPhone: z.string().optional(),
  revenueTypeId: z.string().min(1),
  taxTypeId: z.string().optional(),
  description: z.string().min(2),
  quantity: z.string().min(1),
  unitAmountMajor: z.string().min(1),
  autoPaymentRequest: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

function statusVariant(status: string) {
  if (status === 'PAID') return 'success' as const;
  if (status === 'OVERDUE' || status === 'CANCELLED') return 'danger' as const;
  if (status === 'ISSUED' || status === 'PARTIALLY_PAID') return 'warning' as const;
  return 'muted' as const;
}

function moneyMajor(n: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n);
}

function canMutateInvoice(inv: { status: string; amountPaidMinor?: number }) {
  if (inv.status === 'PAID' || inv.status === 'CANCELLED' || inv.status === 'PARTIALLY_PAID') {
    return false;
  }
  return (inv.amountPaidMinor ?? 0) === 0;
}

export default function InvoicesPage() {
  const [mode, setMode] = useState<'none' | 'create' | 'edit' | 'view'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api<Invoice[]>('/invoices'),
  });
  const types = useQuery({
    queryKey: ['revenue-types'],
    queryFn: () => api<RevenueType[]>('/revenue/types'),
  });
  const taxes = useQuery({
    queryKey: ['tax-types'],
    queryFn: () => api<TaxType[]>('/revenue/taxes'),
  });
  const tenant = useQuery({
    queryKey: ['tenant'],
    queryFn: () =>
      api<{
        agency?: { code?: string; name?: string; email?: string | null; phone?: string | null } | null;
      }>('/tenant'),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['invoice', viewId ?? editingId],
    queryFn: () => api<InvoiceDetail>(`/invoices/${viewId ?? editingId}`),
    enabled: Boolean(viewId || (mode === 'edit' && editingId)),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      payerName: '',
      payerEmail: '',
      payerPhone: '',
      revenueTypeId: '',
      taxTypeId: '',
      description: '',
      quantity: '1',
      unitAmountMajor: '',
      autoPaymentRequest: true,
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
    return { base, rate, taxAmount, total: base + taxAmount, taxName: tax?.name };
  }, [watched.quantity, watched.unitAmountMajor, watched.taxTypeId, taxes.data]);

  useEffect(() => {
    if (mode !== 'edit' || !detail.data) return;
    const line = detail.data.lines[0];
    form.reset({
      payerName: detail.data.payerName,
      payerEmail: detail.data.payerEmail ?? '',
      payerPhone: detail.data.payerPhone ?? '',
      revenueTypeId: line?.revenueTypeId ?? '',
      taxTypeId: line?.taxTypeId ?? '',
      description: line?.description ?? '',
      quantity: String(Number(line?.quantity ?? 1)),
      unitAmountMajor: line ? String(line.unitAmountMinor / 100) : '',
      autoPaymentRequest: false,
    });
  }, [mode, detail.data, form]);

  function closePanels() {
    setMode('none');
    setEditingId(null);
    setViewId(null);
    setFormError(null);
    form.reset({
      payerName: '',
      payerEmail: '',
      payerPhone: '',
      revenueTypeId: '',
      taxTypeId: '',
      description: '',
      quantity: '1',
      unitAmountMajor: '',
      autoPaymentRequest: true,
    });
  }

  function openCreate() {
    setActionError(null);
    setFormError(null);
    setEditingId(null);
    setViewId(null);
    form.reset({
      payerName: '',
      payerEmail: '',
      payerPhone: '',
      revenueTypeId: '',
      taxTypeId: '',
      description: '',
      quantity: '1',
      unitAmountMajor: '',
      autoPaymentRequest: true,
    });
    setMode('create');
  }

  function openView(id: string) {
    setActionError(null);
    setEditingId(null);
    setViewId(id);
    setMode('view');
  }

  function openEdit(id: string) {
    setActionError(null);
    setFormError(null);
    setViewId(null);
    setEditingId(id);
    setMode('edit');
  }

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api('/invoices', {
        method: 'POST',
        body: {
          payerName: values.payerName,
          payerEmail: values.payerEmail || undefined,
          payerPhone: values.payerPhone || undefined,
          autoPaymentRequest: values.autoPaymentRequest ?? true,
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
      closePanels();
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Create failed'),
  });

  const update = useMutation({
    mutationFn: (values: FormValues) => {
      if (!editingId) throw new Error('Missing invoice');
      return api(`/invoices/${editingId}`, {
        method: 'PATCH',
        body: {
          payerName: values.payerName,
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
      });
    },
    onSuccess: async () => {
      closePanels();
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['invoice'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Update failed'),
  });

  const cancelInvoice = useMutation({
    mutationFn: (id: string) =>
      api(`/invoices/${id}/cancel`, {
        method: 'POST',
        body: { reason: 'Cancelled from admin console' },
      }),
    onSuccess: async () => {
      setActionError(null);
      if (viewId || editingId) closePanels();
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['invoice'] });
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Cancel failed'),
  });

  function onCancelClick(inv: Invoice) {
    if (!canMutateInvoice(inv)) return;
    const ok = window.confirm(
      `Cancel invoice ${inv.invoiceNumber}? Pending payment links will be expired.`,
    );
    if (!ok) return;
    cancelInvoice.mutate(inv.id);
  }

  const showForm = mode === 'create' || mode === 'edit';
  const viewing = useMemo(() => {
    if (mode !== 'view' || !detail.data) return null;
    const inv = detail.data;
    if (inv.agency?.name) {
      return {
        ...inv,
        agency: { ...inv.agency, name: displayAgencyName(inv.agency.name) },
      };
    }
    if (tenant.data?.agency) {
      return {
        ...inv,
        agency: {
          code: tenant.data.agency.code,
          name: displayAgencyName(tenant.data.agency.name),
          email: tenant.data.agency.email,
          phone: tenant.data.agency.phone,
        },
      };
    }
    return inv;
  }, [mode, detail.data, tenant.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Issued bills, payer details, and collection readiness"
        actions={
          <Button onClick={() => (mode === 'none' ? openCreate() : closePanels())}>
            {mode === 'none' ? 'Create invoice' : 'Close'}
          </Button>
        }
      />

      {actionError && <p className="mb-4 text-sm text-red-700">{actionError}</p>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{mode === 'edit' ? 'Edit invoice' : 'New invoice'}</CardTitle>
          </CardHeader>
          <CardContent>
            {mode === 'edit' && detail.isLoading && (
              <p className="mb-4 text-sm text-muted-foreground">Loading invoice…</p>
            )}
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={form.handleSubmit((v) =>
                mode === 'edit' ? update.mutate(v) : create.mutate(v),
              )}
            >
              <div className="space-y-1.5">
                <Label htmlFor="payerName">Payer name</Label>
                <Input id="payerName" {...form.register('payerName')} />
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
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitAmountMajor">Unit amount (NGN)</Label>
                <Input id="unitAmountMajor" {...form.register('unitAmountMajor')} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" {...form.register('description')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" {...form.register('quantity')} />
              </div>
              {mode === 'create' && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" {...form.register('autoPaymentRequest')} />
                  Auto-create payment link
                </label>
              )}

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
                    <span className="font-serif text-lg font-medium tabular-nums text-navy dark:text-foreground">
                      {moneyMajor(preview.total)}
                    </span>
                  </p>
                </div>
              </div>

              {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  {mode === 'edit'
                    ? update.isPending
                      ? 'Saving…'
                      : 'Save changes'
                    : create.isPending
                      ? 'Saving…'
                      : 'Issue invoice'}
                </Button>
                <Button type="button" variant="ghost" onClick={closePanels}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {mode === 'view' && (
        <div className="mb-6">
          {detail.isLoading && <LoadingState label="Loading invoice document…" />}
          {detail.error && (
            <ErrorState
              message={detail.error instanceof Error ? detail.error.message : 'Failed to load'}
              onRetry={() => detail.refetch()}
            />
          )}
          {viewing && (
            <InvoiceDocument
              invoice={viewing}
              onClose={closePanels}
              canMutate={canMutateInvoice(viewing)}
              onEdit={() => openEdit(viewing.id)}
              onCancel={() => onCancelClick(viewing)}
            />
          )}
        </div>
      )}

      {list.isLoading && <LoadingState label="Loading invoices…" />}
      {list.error && (
        <ErrorState
          message={list.error instanceof Error ? list.error.message : 'Failed to load'}
          onRetry={() => list.refetch()}
        />
      )}
      {list.data && (
        <DataTable
          searchPlaceholder="Search invoice, payer, status…"
          columns={[
            { key: 'number', label: 'Invoice' },
            { key: 'payer', label: 'Payer' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'due', label: 'Due' },
            { key: 'actions', label: 'Actions' },
          ]}
          rows={list.data.map((inv) => {
            const mutable = canMutateInvoice(inv);
            return {
              __id: inv.id,
              __search: `${inv.invoiceNumber} ${inv.payerName} ${inv.payerEmail ?? ''} ${inv.payerPhone ?? ''} ${inv.status} ${inv.totalMinor}`,
              number: <span className="font-medium">{inv.invoiceNumber}</span>,
              payer: (
                <div className="min-w-[10rem] space-y-0.5">
                  <div className="font-medium leading-snug">{inv.payerName}</div>
                  {inv.payerEmail ? (
                    <div className="truncate text-xs text-muted-foreground" title={inv.payerEmail}>
                      {inv.payerEmail}
                    </div>
                  ) : null}
                  {inv.payerPhone ? (
                    <div className="text-xs tabular-nums text-muted-foreground">{inv.payerPhone}</div>
                  ) : null}
                </div>
              ),
              amount: (
                <div className="space-y-0.5">
                  <div className="font-medium">{formatMoney(inv.totalMinor)}</div>
                  {(inv.taxMinor ?? 0) > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      Base {formatMoney(inv.subtotalMinor ?? inv.totalMinor - (inv.taxMinor ?? 0))} + tax{' '}
                      {formatMoney(inv.taxMinor ?? 0)}
                    </div>
                  ) : null}
                </div>
              ),
              status: <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>,
              due: formatDate(inv.dueAt),
              actions: (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    title="View details"
                    onClick={() => openView(inv.id)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title={mutable ? 'Edit invoice' : 'Cannot edit paid or cancelled invoices'}
                    disabled={!mutable}
                    onClick={() => openEdit(inv.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    title={mutable ? 'Cancel invoice' : 'Cannot cancel paid or cancelled invoices'}
                    disabled={!mutable || cancelInvoice.isPending}
                    onClick={() => onCancelClick(inv)}
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            };
          })}
        />
      )}
    </div>
  );
}
