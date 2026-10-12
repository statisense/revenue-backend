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
            { key: 'code', label: 'Payment code' },
            { key: 'account', label: 'Account' },
            { key: 'bank', label: 'Bank' },
            { key: 'amount', label: 'Amount' },
            { key: 'status', label: 'Status' },
            { key: 'expires', label: 'Expires' },
          ]}
          rows={list.data.map((v) => ({
            __id: v.id,
            __search: `${v.paymentRequest?.paymentCode ?? ''} ${v.accountNumber} ${v.accountName} ${v.bankName} ${v.status}`,
            code: v.paymentRequest?.paymentCode ?? '—',
            account: `${v.accountNumber} (${v.accountName})`,
            bank: v.bankName,
            amount: formatMoney(v.paymentRequest?.amountMinor ?? 0),
            status: <Badge>{v.status}</Badge>,
            expires: formatDate(v.expiresAt),
          }))}
        />
      )}
    </div>
  );
}
