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

type Role = { id: string; code: string; name: string };
type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status?: string;
  phone?: string | null;
  roles?: { id?: string; code?: string; name?: string }[];
};

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Minimum 10 characters'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  roleId: z.string().optional(),
});

export default function UsersPage() {
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<UserRow[]>('/users'),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<Role[]>('/users/roles/list'),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', firstName: '', lastName: '', phone: '', roleId: '' },
  });

  const create = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api('/users', {
        method: 'POST',
        body: {
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone || undefined,
          roleIds: values.roleId ? [values.roleId] : undefined,
        },
      }),
    onSuccess: async () => {
      setShowForm(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Create failed'),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: 'PATCH', body: { active: false } }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Officers and administrators with portal access"
        actions={<Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Create user'}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>New user</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" {...form.register('firstName')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" {...form.register('lastName')} />
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
                <Label htmlFor="password">Temporary password</Label>
                <Input id="password" type="password" {...form.register('password')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="roleId">Role</Label>
                <select
                  id="roleId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register('roleId')}
                >
                  <option value="">No role</option>
                  {(roles.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>
              {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Saving…' : 'Save user'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <LoadingState label="Loading users…" />}
      {error && (
        <ErrorState
          message={error instanceof Error ? error.message : 'Failed to load users'}
          onRetry={() => refetch()}
        />
      )}
      {data && (
        <DataTable
          searchPlaceholder="Search name, email, role…"
          columns={[
            { key: 'name', label: 'Name', primary: true, sticky: 'left' },
            { key: 'email', label: 'Email' },
            { key: 'roles', label: 'Roles' },
            { key: 'status', label: 'Status', align: 'center' },
            { key: 'actions', label: '', sticky: 'right', align: 'right' },
          ]}
          rows={data.map((u) => {
            const roles = (u.roles ?? []).map((r) => r.code || r.name).filter(Boolean).join(', ') || '—';
            const name = `${u.firstName} ${u.lastName}`;
            return {
              __id: u.id,
              __search: `${name} ${u.email} ${roles} ${u.status ?? ''}`,
              name: <span className="cell-primary">{name}</span>,
              email: <span className="cell-meta">{u.email}</span>,
              roles: <span className="text-xs text-muted-foreground">{roles}</span>,
              status: <Badge variant={u.status === 'ACTIVE' ? 'success' : 'muted'}>{u.status || '—'}</Badge>,
              actions:
                u.status === 'ACTIVE' ? (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => deactivate.mutate(u.id)}>
                    Deactivate
                  </Button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            };
          })}
        />
      )}
    </div>
  );
}
