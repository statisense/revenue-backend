'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, Label, LoadingState, PageHeader } from '@/components/page-shell';

type TaxType = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  ratePercent: number | string;
  isActive?: boolean;
};

const taxSchema = z.object({
  code: z.string().min(2, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  ratePercent: z
    .string()
    .min(1, 'Rate is required')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Enter a valid rate ≥ 0'),
  description: z.string().optional(),
});

function formatRate(rate: number | string) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '—';
  return `${n}%`;
}

export default function TaxesPage() {
  const [mode, setMode] = useState<'none' | 'create' | 'edit'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const taxes = useQuery({
    queryKey: ['tax-types'],
    queryFn: () => api<TaxType[]>('/revenue/taxes'),
  });

  const taxForm = useForm<z.infer<typeof taxSchema>>({
    resolver: zodResolver(taxSchema),
    defaultValues: { code: '', name: '', ratePercent: '', description: '' },
  });

  useEffect(() => {
    if (mode !== 'edit' || !editingId || !taxes.data) return;
    const current = taxes.data.find((t) => t.id === editingId);
    if (!current) return;
    taxForm.reset({
      code: current.code,
      name: current.name,
      ratePercent: String(Number(current.ratePercent)),
      description: current.description ?? '',
    });
  }, [mode, editingId, taxes.data, taxForm]);

  const createTax = useMutation({
    mutationFn: (values: z.infer<typeof taxSchema>) =>
      api('/revenue/taxes', {
        method: 'POST',
        body: {
          code: values.code,
          name: values.name,
          description: values.description || undefined,
          ratePercent: Number(values.ratePercent),
        },
      }),
    onSuccess: async () => {
      setMode('none');
      setFormError(null);
      taxForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['tax-types'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Create failed'),
  });

  const updateTax = useMutation({
    mutationFn: (values: z.infer<typeof taxSchema>) => {
      if (!editingId) throw new Error('Missing tax type');
      return api(`/revenue/taxes/${editingId}`, {
        method: 'PATCH',
        body: {
          code: values.code,
          name: values.name,
          description: values.description || undefined,
          ratePercent: Number(values.ratePercent),
        },
      });
    },
    onSuccess: async () => {
      setMode('none');
      setEditingId(null);
      setFormError(null);
      taxForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['tax-types'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Update failed'),
  });

  function openCreate() {
    setFormError(null);
    setEditingId(null);
    taxForm.reset({ code: '', name: '', ratePercent: '', description: '' });
    setMode('create');
  }

  function openEdit(tax: TaxType) {
    setFormError(null);
    setEditingId(tax.id);
    setMode('edit');
  }

  function closeForm() {
    setMode('none');
    setEditingId(null);
    setFormError(null);
    taxForm.reset();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax types"
        description="Nigerian tax rates applied on invoices as: total = revenue + (tax % × revenue)"
        actions={
          <Button onClick={openCreate}>{mode === 'none' ? 'Add tax type' : 'Close form'}</Button>
        }
      />

      {(mode === 'create' || mode === 'edit') && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{mode === 'edit' ? 'Edit tax type' : 'New tax type'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={taxForm.handleSubmit((v) =>
                mode === 'edit' ? updateTax.mutate(v) : createTax.mutate(v),
              )}
            >
              <div className="space-y-1.5">
                <Label htmlFor="tax-code">Code</Label>
                <Input id="tax-code" placeholder="e.g. VAT" {...taxForm.register('code')} />
                {taxForm.formState.errors.code && (
                  <p className="text-xs text-red-700">{taxForm.formState.errors.code.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax-rate">Rate (%)</Label>
                <Input
                  id="tax-rate"
                  inputMode="decimal"
                  placeholder="e.g. 7.5"
                  {...taxForm.register('ratePercent')}
                />
                {taxForm.formState.errors.ratePercent && (
                  <p className="text-xs text-red-700">{taxForm.formState.errors.ratePercent.message}</p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tax-name">Name</Label>
                <Input id="tax-name" {...taxForm.register('name')} />
                {taxForm.formState.errors.name && (
                  <p className="text-xs text-red-700">{taxForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tax-desc">Description</Label>
                <Input id="tax-desc" {...taxForm.register('description')} />
              </div>
              {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={createTax.isPending || updateTax.isPending}>
                  {mode === 'edit'
                    ? updateTax.isPending
                      ? 'Saving…'
                      : 'Save changes'
                    : createTax.isPending
                      ? 'Saving…'
                      : 'Save'}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {taxes.isLoading && <LoadingState label="Loading tax types…" />}
      {taxes.error && (
        <ErrorState
          message={taxes.error instanceof Error ? taxes.error.message : 'Failed to load tax types'}
          onRetry={() => taxes.refetch()}
        />
      )}

      {taxes.data && (
        <DataTable
          searchPlaceholder="Search code, name, rate…"
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'rate', label: 'Rate' },
            { key: 'description', label: 'Description' },
            { key: 'actions', label: 'Actions' },
          ]}
          rows={taxes.data.map((t) => ({
            __id: t.id,
            __search: `${t.code} ${t.name} ${formatRate(t.ratePercent)} ${t.description ?? ''}`,
            code: <span className="font-medium">{t.code}</span>,
            name: t.name,
            rate: <span className="tabular-nums font-medium">{formatRate(t.ratePercent)}</span>,
            description: t.description || '—',
            actions: (
              <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            ),
          }))}
          empty="No tax types found. Seed data includes VAT, WHT, EDT, and others — or add one above."
        />
      )}
    </div>
  );
}
