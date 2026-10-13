'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, ErrorState, Label, LoadingState, PageHeader } from '@/components/page-shell';

type Category = { id: string; code: string; name: string; description?: string | null };
type FeeSchedule = { id: string; name: string; amountMinor: number; isActive: boolean };
type RevenueType = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  description?: string | null;
  defaultAmountMinor?: number | null;
  glCode?: string | null;
  active?: boolean;
  isActive?: boolean;
  category?: { id: string; code: string; name: string } | null;
  feeSchedules?: FeeSchedule[];
};

const categorySchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

const typeSchema = z.object({
  categoryId: z.string().min(1, 'Select a category'),
  code: z.string().min(2),
  name: z.string().min(2),
  glCode: z.string().optional(),
  defaultAmountMajor: z.string().optional(),
  description: z.string().optional(),
});

function resolveAmountMinor(t: RevenueType): number | null {
  if (t.defaultAmountMinor != null && Number.isFinite(t.defaultAmountMinor)) {
    return t.defaultAmountMinor;
  }
  const fees = t.feeSchedules ?? [];
  if (!fees.length) return null;
  const standard = fees.find((f) => f.name.toLowerCase() === 'standard');
  return (standard ?? fees[0]).amountMinor;
}

export default function RevenuePage() {
  const [mode, setMode] = useState<'none' | 'category' | 'type' | 'edit-type' | 'fee'>('none');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feeTypeId, setFeeTypeId] = useState('');
  const [feeName, setFeeName] = useState('Standard');
  const [feeAmountMajor, setFeeAmountMajor] = useState('');
  const queryClient = useQueryClient();

  const categories = useQuery({
    queryKey: ['revenue-categories'],
    queryFn: () => api<Category[]>('/revenue/categories'),
  });
  const types = useQuery({
    queryKey: ['revenue-types'],
    queryFn: () => api<RevenueType[]>('/revenue/types'),
  });

  const categoryForm = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: { code: '', name: '', description: '' },
  });
  const typeForm = useForm<z.infer<typeof typeSchema>>({
    resolver: zodResolver(typeSchema),
    defaultValues: {
      categoryId: '',
      code: '',
      name: '',
      glCode: '',
      defaultAmountMajor: '',
      description: '',
    },
  });

  useEffect(() => {
    if (mode !== 'edit-type' || !editingId || !types.data) return;
    const current = types.data.find((t) => t.id === editingId);
    if (!current) return;
    const amount = resolveAmountMinor(current);
    typeForm.reset({
      categoryId: current.categoryId,
      code: current.code,
      name: current.name,
      glCode: current.glCode ?? '',
      description: current.description ?? '',
      defaultAmountMajor: amount != null ? String(amount / 100) : '',
    });
  }, [mode, editingId, types.data, typeForm]);

  const createCategory = useMutation({
    mutationFn: (values: z.infer<typeof categorySchema>) =>
      api('/revenue/categories', { method: 'POST', body: values }),
    onSuccess: async () => {
      setMode('none');
      categoryForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['revenue-categories'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Create failed'),
  });

  const createType = useMutation({
    mutationFn: (values: z.infer<typeof typeSchema>) =>
      api('/revenue/types', {
        method: 'POST',
        body: {
          categoryId: values.categoryId,
          code: values.code,
          name: values.name,
          glCode: values.glCode || undefined,
          description: values.description || undefined,
          defaultAmountMinor: values.defaultAmountMajor
            ? Math.round(Number(values.defaultAmountMajor) * 100)
            : undefined,
        },
      }),
    onSuccess: async () => {
      setMode('none');
      typeForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['revenue-types'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Create failed'),
  });

  const updateType = useMutation({
    mutationFn: (values: z.infer<typeof typeSchema>) => {
      if (!editingId) throw new Error('Missing revenue type');
      return api(`/revenue/types/${editingId}`, {
        method: 'PATCH',
        body: {
          categoryId: values.categoryId,
          code: values.code,
          name: values.name,
          glCode: values.glCode || undefined,
          description: values.description || undefined,
          defaultAmountMinor: values.defaultAmountMajor
            ? Math.round(Number(values.defaultAmountMajor) * 100)
            : 0,
        },
      });
    },
    onSuccess: async () => {
      setMode('none');
      setEditingId(null);
      typeForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['revenue-types'] });
      await queryClient.invalidateQueries({ queryKey: ['revenue-categories'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Update failed'),
  });

  function openEdit(type: RevenueType) {
    setFormError(null);
    setEditingId(type.id);
    setMode('edit-type');
  }

  const addFee = useMutation({
    mutationFn: () =>
      api('/revenue/fees', {
        method: 'POST',
        body: {
          revenueTypeId: feeTypeId,
          name: feeName || 'Standard',
          amountMinor: Math.round(Number(feeAmountMajor) * 100),
        },
      }),
    onSuccess: async () => {
      setMode('none');
      setFeeTypeId('');
      setFeeName('Standard');
      setFeeAmountMajor('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['revenue-types'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Fee schedule failed'),
  });

  function closeForm() {
    setMode('none');
    setEditingId(null);
    setFormError(null);
    typeForm.reset();
    categoryForm.reset();
  }

  const loadError = categories.error || types.error;
  const typeFormTitle = mode === 'edit-type' ? 'Edit revenue type' : 'New revenue type';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue"
        description="Fee catalogue, categories, and default GL mappings"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/taxes"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium transition hover:bg-muted"
            >
              Manage tax types
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                setFormError(null);
                setEditingId(null);
                setMode('category');
              }}
            >
              Add category
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFormError(null);
                setMode('fee');
              }}
            >
              Add fee schedule
            </Button>
            <Button
              onClick={() => {
                setFormError(null);
                setEditingId(null);
                typeForm.reset({
                  categoryId: '',
                  code: '',
                  name: '',
                  glCode: '',
                  defaultAmountMajor: '',
                  description: '',
                });
                setMode('type');
              }}
            >
              Add revenue type
            </Button>
          </div>
        }
      />

      {mode === 'fee' && (
        <Card>
          <CardHeader>
            <CardTitle>New fee schedule</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="feeType">Revenue type</Label>
              <select
                id="feeType"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={feeTypeId}
                onChange={(e) => setFeeTypeId(e.target.value)}
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
              <Label htmlFor="feeName">Schedule name</Label>
              <Input id="feeName" value={feeName} onChange={(e) => setFeeName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feeAmount">Amount (NGN)</Label>
              <Input
                id="feeAmount"
                value={feeAmountMajor}
                onChange={(e) => setFeeAmountMajor(e.target.value)}
                placeholder="e.g. 25000"
              />
            </div>
            {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                disabled={!feeTypeId || !feeAmountMajor || addFee.isPending}
                onClick={() => addFee.mutate()}
              >
                {addFee.isPending ? 'Saving…' : 'Save fee schedule'}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === 'category' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New category</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={categoryForm.handleSubmit((v) => createCategory.mutate(v))}
            >
              <div className="space-y-1.5">
                <Label htmlFor="cat-code">Code</Label>
                <Input id="cat-code" {...categoryForm.register('code')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" {...categoryForm.register('name')} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cat-desc">Description</Label>
                <Input id="cat-desc" {...categoryForm.register('description')} />
              </div>
              {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={createCategory.isPending}>
                  Save
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {(mode === 'type' || mode === 'edit-type') && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{typeFormTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={typeForm.handleSubmit((v) =>
                mode === 'edit-type' ? updateType.mutate(v) : createType.mutate(v),
              )}
            >
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="categoryId">Category</Label>
                <select
                  id="categoryId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...typeForm.register('categoryId')}
                >
                  <option value="">Select category</option>
                  {(categories.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type-code">Code</Label>
                <Input id="type-code" {...typeForm.register('code')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="type-name">Name</Label>
                <Input id="type-name" {...typeForm.register('name')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="glCode">GL code</Label>
                <Input id="glCode" {...typeForm.register('glCode')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="defaultAmountMajor">Default amount (NGN)</Label>
                <Input
                  id="defaultAmountMajor"
                  inputMode="decimal"
                  placeholder="e.g. 250000"
                  {...typeForm.register('defaultAmountMajor')}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="type-desc">Description</Label>
                <Input id="type-desc" {...typeForm.register('description')} />
              </div>
              {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={createType.isPending || updateType.isPending}>
                  {mode === 'edit-type'
                    ? updateType.isPending
                      ? 'Saving…'
                      : 'Save changes'
                    : createType.isPending
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

      {(categories.isLoading || types.isLoading) && (
        <LoadingState label="Loading revenue catalogue…" />
      )}
      {loadError && (
        <ErrorState
          message={loadError instanceof Error ? loadError.message : 'Failed to load'}
          onRetry={() => {
            categories.refetch();
            types.refetch();
          }}
        />
      )}

      {types.data && (
        <DataTable
          searchPlaceholder="Search code, name, category, GL…"
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'category', label: 'Category' },
            { key: 'amount', label: 'Default fee' },
            { key: 'gl', label: 'GL' },
            { key: 'actions', label: 'Actions' },
          ]}
          rows={types.data.map((t) => {
            const amount = resolveAmountMinor(t);
            const categoryName =
              t.category?.name ??
              categories.data?.find((c) => c.id === t.categoryId)?.name ??
              '—';
            return {
              __id: t.id,
              __search: `${t.code} ${t.name} ${categoryName} ${t.glCode || ''}`,
              code: <span className="font-medium">{t.code}</span>,
              name: t.name,
              category: categoryName,
              amount: amount != null ? formatMoney(amount) : '—',
              gl: t.glCode || '—',
              actions: (
                <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              ),
            };
          })}
        />
      )}

      {categories.data && categories.data.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.data.map((c) => (
            <Badge key={c.id} variant="outline">
              {c.code}: {c.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
