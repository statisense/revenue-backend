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

type Notification = {
  id: string;
  channel: string;
  recipient: string;
  subject?: string;
  status: string;
  createdAt: string;
};

const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'TELEGRAM', 'PUSH'] as const;

export default function NotificationsPage() {
  const [showForm, setShowForm] = useState(false);
  const [channel, setChannel] = useState<string>('EMAIL');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
  });

  const send = useMutation({
    mutationFn: () =>
      api('/notifications/send', {
        method: 'POST',
        body: { channel, recipient, subject: subject || undefined, body },
      }),
    onSuccess: async () => {
      setShowForm(false);
      setRecipient('');
      setSubject('');
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed'),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="SMS, email, WhatsApp, and Telegram delivery log"
        actions={<Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Close' : 'Send notification'}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Send notification</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="channel">Channel</Label>
              <select
                id="channel"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipient">Recipient</Label>
              <Input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="body">Body</Label>
              <textarea
                id="body"
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            {formError && <p className="sm:col-span-2 text-sm text-red-700">{formError}</p>}
            <Button disabled={!recipient || !body || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? 'Queuing…' : 'Queue message'}
            </Button>
          </CardContent>
        </Card>
      )}

      {list.isLoading && <LoadingState label="Loading notifications…" />}
      {list.error && (
        <ErrorState message={list.error instanceof Error ? list.error.message : 'Failed'} onRetry={() => list.refetch()} />
      )}
      {list.data && (
        <DataTable
          searchPlaceholder="Search recipient, subject, channel…"
          columns={[
            { key: 'channel', label: 'Channel' },
            { key: 'recipient', label: 'Recipient', primary: true },
            { key: 'subject', label: 'Subject' },
            { key: 'status', label: 'Status', align: 'center' },
            { key: 'created', label: 'Created' },
          ]}
          rows={list.data.map((n) => ({
            __id: n.id,
            __search: `${n.channel} ${n.recipient} ${n.subject ?? ''} ${n.status}`,
            channel: n.channel,
            recipient: n.recipient,
            subject: n.subject ?? '—',
            status: <Badge>{n.status}</Badge>,
            created: formatDate(n.createdAt),
          }))}
        />
      )}
    </div>
  );
}
