'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, Label, LoadingState, PageHeader } from '@/components/page-shell';

type Agency = {
  id: string;
  code: string;
  name: string;
  shortName?: string | null;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  status: string;
};

const schema = z.object({
  code: z.string().min(2, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  shortName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  state: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function AgenciesPage() {
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agencies'],
    queryFn: () => api<Agency[]>('/agencies'),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', shortName: '', email: '', phone: '', state: '' },
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api('/agencies', {
        method: 'POST',
        body: {
          ...values,
          email: values.email || undefined,
          shortName: values.shortName || undefined,
          phone: values.phone || undefined,
          state: values.state || undefined,
        },
      }),
    onSuccess: async () => {
      setShowForm(false);
      form.reset();
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create agency');
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agencies"
        description="Collecting agencies, branches, and institutional profiles"
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Create agency'}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New agency</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={form.handleSubmit((values) => create.mutate(values))}
            >
              <div className="space-y-1.5">
                <Label htmlFor="code">Code</Label>
                <Input id="code" {...form.register('code')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...form.register('name')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shortName">Short name</Label>
                <Input id="shortName" {...form.register('shortName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register('email')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...form.register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" {...form.register('state')} />
              </div>
              {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Saving…' : 'Save agency'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <LoadingState label="Loading agencies…" />}
      {error && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load agencies'}
          onRetry={() => refetch()}
        />
      )}
      {data && (
        <DataTable
          searchPlaceholder="Search code, name, contact, state…"
          columns={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'contact', label: 'Contact' },
            { key: 'state', label: 'State' },
            { key: 'status', label: 'Status' },
          ]}
          rows={data.map((a) => ({
            __id: a.id,
            __search: `${a.code} ${a.name} ${a.email ?? ''} ${a.phone ?? ''} ${a.state ?? ''} ${a.status}`,
            code: <span className="font-medium">{a.code}</span>,
            name: a.name,
            contact: a.email || a.phone || '—',
            state: a.state || '—',
            status: (
              <Badge variant={a.status === 'ACTIVE' ? 'success' : 'muted'}>{a.status}</Badge>
            ),
          }))}
        />
      )}
    </div>
  );
}
