'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { DataTable, ErrorState, LoadingState, PageHeader } from '@/components/page-shell';

type VA = {
  id: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  status: string;
  expiresAt: string;
  paymentRequest?: { paymentCode: string; status: string; amountMinor: number };
};

export default function VirtualAccountsPage() {
  const list = useQuery({
    queryKey: ['virtual-accounts'],
    queryFn: () => api<VA[]>('/virtual-accounts'),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Virtual Accounts" description="Dedicated NUBAN / Remita collection accounts" />
      {list.isLoading && <LoadingState label="Loading virtual accounts…" />}
      {list.error && (
        <ErrorState message={list.error instanceof Error ? list.error.message : 'Failed'} onRetry={() => list.refetch()} />
      )}
      {list.data && (
        <DataTable
          searchPlaceholder="Search code, account, bank…"
          columns={[
            { key: 'code', label: 'Payment code', primary: true, mono: true, sticky: 'left' },
            { key: 'account', label: 'Account', mono: true },
            { key: 'bank', label: 'Bank' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'status', label: 'Status', align: 'center' },
            { key: 'expires', label: 'Expires' },
          ]}
          rows={list.data.map((v) => ({
            __id: v.id,
            __search: `${v.paymentRequest?.paymentCode ?? ''} ${v.accountNumber} ${v.accountName} ${v.bankName} ${v.status}`,
            code: <span className="cell-code">{v.paymentRequest?.paymentCode ?? '—'}</span>,
            account: (
              <div className="cell-stack">
                <div className="cell-primary font-mono tabular-nums">{v.accountNumber}</div>
                <div className="cell-meta">{v.accountName}</div>
              </div>
            ),
            bank: <span className="text-muted-foreground">{v.bankName}</span>,
            amount: <span className="cell-money">{formatMoney(v.paymentRequest?.amountMinor ?? 0)}</span>,
            status: <Badge variant="outline">{v.status}</Badge>,
            expires: <span className="whitespace-nowrap text-muted-foreground">{formatDate(v.expiresAt)}</span>,
          }))}
        />
      )}
    </div>
  );
}
