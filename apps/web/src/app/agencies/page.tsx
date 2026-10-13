'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, ApiError } from '@/lib/api';
import { displayAgencyName } from '@/lib/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, Label, LoadingState, MiniTable, PageHeader } from '@/components/page-shell';

type Branch = { id: string; code: string; name: string; state?: string | null };
type TsaMapping = {
  id: string;
  tsaAccountNumber?: string | null;
  tsaAccountName?: string | null;
  isDefault?: boolean;
};
type Agency = {
  id: string;
  code: string;
  name: string;
  shortName?: string | null;
  email?: string | null;
  phone?: string | null;
  state?: string | null;
  status: string;
  branches?: Branch[];
  tsaMappings?: TsaMapping[];
};

const schema = z.object({
  code: z.string().min(2, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  shortName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  state: z.string().optional(),
});

const branchSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  state: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function AgenciesPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agencies'],
    queryFn: async () => {
      const res = await api<Agency[] | Agency>('/agencies');
      return Array.isArray(res) ? res : res ? [res] : [];
    },
  });

  const detail = useQuery({
    queryKey: ['agency', selectedId],
    queryFn: () => api<Agency>(`/agencies/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: '', name: '', shortName: '', email: '', phone: '', state: '' },
  });
  const branchForm = useForm<z.infer<typeof branchSchema>>({
    resolver: zodResolver(branchSchema),
    defaultValues: { code: '', name: '', state: '' },
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

  const addBranch = useMutation({
    mutationFn: (values: z.infer<typeof branchSchema>) =>
      api(`/agencies/${selectedId}/branches`, {
        method: 'POST',
        body: {
          code: values.code,
          name: values.name,
          state: values.state || undefined,
        },
      }),
    onSuccess: async () => {
      branchForm.reset();
      setBranchError(null);
      await queryClient.invalidateQueries({ queryKey: ['agency', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['agencies'] });
    },
    onError: (err) => setBranchError(err instanceof ApiError ? err.message : 'Failed to add branch'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agencies"
        description="Collecting MDAs, branches, and TSA remittance profiles"
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close' : 'Create agency'}
          </Button>
        }
      />

      {showForm && (
        <Card>
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
                <Input id="name" {...form.register('name')} placeholder="e.g. Federal Inland Revenue Service" />
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
            { key: 'code', label: 'Code', primary: true, mono: true, sticky: 'left' },
            { key: 'name', label: 'Name', primary: true },
            { key: 'branches', label: 'Branches', align: 'center' },
            { key: 'contact', label: 'Contact' },
            { key: 'state', label: 'State' },
            { key: 'status', label: 'Status', align: 'center' },
            { key: 'actions', label: '', sticky: 'right', align: 'right' },
          ]}
          rows={data.map((a) => ({
            __id: a.id,
            __search: `${a.code} ${a.name} ${a.email ?? ''} ${a.phone ?? ''} ${a.state ?? ''} ${a.status}`,
            code: <span className="cell-code">{a.code === 'NCS' ? 'NGRS' : a.code}</span>,
            name: <span className="cell-primary">{displayAgencyName(a.name)}</span>,
            branches: (
              <span className="inline-flex min-w-8 justify-center rounded-md bg-muted/80 px-2 py-0.5 text-xs font-medium tabular-nums">
                {a.branches?.length ?? 0}
              </span>
            ),
            contact: (
              <div className="cell-stack">
                <div className="cell-meta" title={a.email || undefined}>
                  {a.email || '—'}
                </div>
                {a.phone ? <div className="cell-meta tabular-nums">{a.phone}</div> : null}
              </div>
            ),
            state: <span className="text-muted-foreground">{a.state || '—'}</span>,
            status: (
              <Badge variant={a.status === 'ACTIVE' ? 'success' : 'muted'}>{a.status}</Badge>
            ),
            actions: (
              <Button size="sm" variant="outline" className="h-8" onClick={() => setSelectedId(a.id)}>
                Manage
              </Button>
            ),
          }))}
        />
      )}

      {selectedId && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>
                {displayAgencyName(detail.data?.name)} · branches & TSA
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Add field offices and review treasury settlement account mappings.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {detail.isLoading && <LoadingState label="Loading agency detail…" />}
            {detail.data && (
              <>
                <div>
                  <h3 className="mb-3 font-serif text-lg">Branches</h3>
                  <div className="mb-4">
                    <MiniTable
                      headers={[{ label: 'Code' }, { label: 'Name' }, { label: 'State' }]}
                      empty="No branches yet"
                      rows={(detail.data.branches ?? []).map((b) => [
                        <span key={`${b.id}-c`} className="cell-code">
                          {b.code}
                        </span>,
                        <span key={`${b.id}-n`} className="cell-primary">
                          {b.name}
                        </span>,
                        <span key={`${b.id}-s`} className="text-muted-foreground">
                          {b.state || '—'}
                        </span>,
                      ])}
                    />
                  </div>
                  <form
                    className="grid gap-3 sm:grid-cols-4"
                    onSubmit={branchForm.handleSubmit((v) => addBranch.mutate(v))}
                  >
                    <Input placeholder="Code" {...branchForm.register('code')} />
                    <Input placeholder="Branch name" {...branchForm.register('name')} />
                    <Input placeholder="State" {...branchForm.register('state')} />
                    <Button type="submit" disabled={addBranch.isPending}>
                      {addBranch.isPending ? 'Adding…' : 'Add branch'}
                    </Button>
                  </form>
                  {branchError && <p className="mt-2 text-sm text-red-700">{branchError}</p>}
                </div>

                <div>
                  <h3 className="mb-3 font-serif text-lg">TSA mappings</h3>
                  <MiniTable
                    headers={[{ label: 'Account' }, { label: 'Name' }, { label: 'Default' }]}
                    empty="No TSA mappings configured for this agency yet"
                    rows={(detail.data.tsaMappings ?? []).map((t) => [
                      <span key={`${t.id}-a`} className="cell-code">
                        {t.tsaAccountNumber || '—'}
                      </span>,
                      <span key={`${t.id}-n`}>{t.tsaAccountName || '—'}</span>,
                      t.isDefault ? (
                        <Badge key={`${t.id}-d`} variant="success">
                          Default
                        </Badge>
                      ) : (
                        <span key={`${t.id}-d`} className="text-muted-foreground">
                          —
                        </span>
                      ),
                    ])}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
