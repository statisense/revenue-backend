'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataTable, ErrorState, Label, LoadingState, PageHeader } from '@/components/page-shell';

type Gateway = {
  id: string;
  provider: string;
  isActive: boolean;
  isDefault: boolean;
  publicKey?: string;
  hasSecret: boolean;
  updatedAt: string;
};

const PROVIDERS = ['PAYSTACK', 'FLUTTERWAVE', 'REMITA'] as const;

export default function GatewaysPage() {
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState<string>('PAYSTACK');
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['gateways'],
    queryFn: () => api<Gateway[]>('/gateways/configs'),
  });

  const upsert = useMutation({
    mutationFn: () =>
      api('/gateways/configs', {
        method: 'POST',
        body: {
          provider,
          secretKey,
          publicKey: publicKey || undefined,
          webhookSecret: webhookSecret || undefined,
          isActive: true,
          isDefault,
        },
      }),
    onSuccess: async () => {
      setShowForm(false);
      setSecretKey('');
      setWebhookSecret('');
      await queryClient.invalidateQueries({ queryKey: ['gateways'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Gateways"
        description="Paystack, Flutterwave, and Remita configuration"
        actions={<Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Configure gateway'}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add or update gateway</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="publicKey">Public key</Label>
              <Input id="publicKey" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secretKey">Secret key</Label>
              <Input id="secretKey" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="webhookSecret">Webhook secret</Label>
              <Input
                id="webhookSecret"
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Set as default provider
            </label>
            {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
            <Button disabled={secretKey.length < 8 || upsert.isPending} onClick={() => upsert.mutate()}>
              {upsert.isPending ? 'Saving…' : 'Save config'}
            </Button>
          </CardContent>
        </Card>
      )}

      {list.isLoading && <LoadingState label="Loading gateways…" />}
      {list.error && (
        <ErrorState message={list.error instanceof Error ? list.error.message : 'Failed'} onRetry={() => list.refetch()} />
      )}
      {list.data && (
        <DataTable
          searchPlaceholder="Search provider…"
          columns={[
            { key: 'provider', label: 'Provider' },
            { key: 'active', label: 'Active' },
            { key: 'default', label: 'Default' },
            { key: 'secret', label: 'Secret configured' },
            { key: 'updated', label: 'Updated' },
          ]}
          rows={list.data.map((g) => ({
            __id: g.id ?? g.provider,
            __search: `${g.provider} ${g.isActive ? 'active yes' : 'inactive no'} ${g.isDefault ? 'default' : ''} ${g.hasSecret ? 'secret' : ''}`,
            provider: g.provider,
            active: <Badge variant={g.isActive ? 'success' : 'muted'}>{g.isActive ? 'Yes' : 'No'}</Badge>,
            default: g.isDefault ? 'Default' : '—',
            secret: g.hasSecret ? 'Yes' : 'No',
            updated: formatDate(g.updatedAt),
          }))}
        />
      )}
    </div>
  );
}
