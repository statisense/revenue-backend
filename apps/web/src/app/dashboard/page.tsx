'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Percent,
  Receipt,
  TrendingUp,
  Wallet,
  XCircle,
  Building2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState, PageHeader } from '@/components/page-shell';

type DashboardData = {
  todaysRevenue: number;
  todaysCount: number;
  monthlyRevenue: number;
  monthlyCount: number;
  pendingPayments: number;
  paid: number;
  failed: number;
  expired: number;
  outstanding: { count: number; amountMinor: number };
  topRevenueSources: { revenueTypeId: string; name: string; amountMinor: number }[];
  paymentConversion: number;
  settlementStatus: { pending: number };
};

type TenantInfo = {
  tenantCode?: string;
  agency?: {
    code?: string;
    name?: string;
    legalName?: string;
  } | null;
};

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  delay,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  delay?: string;
}) {
  return (
    <Card className={`animate-fade-up ${delay ?? ''}`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardDescription className="text-[11px] uppercase tracking-[0.12em]">{title}</CardDescription>
          <CardTitle className="mt-1.5 font-serif text-2xl tracking-tight tabular-nums">{value}</CardTitle>
        </div>
        <div className="rounded-md bg-navy/8 p-2 text-navy dark:bg-accent/15 dark:text-accent-200">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      {hint ? <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/reports/dashboard'),
  });

  const tenant = useQuery({
    queryKey: ['tenant'],
    queryFn: () => api<TenantInfo>('/tenant'),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Collection Dashboard" description="Loading live collection overview…" />
        <LoadingState label="Loading dashboard metrics…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Collection Dashboard" description="Live collection overview" />
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : 'Unable to load dashboard — ensure the API is running and the database is seeded.'
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const chartData = data.topRevenueSources.map((s) => ({
    name: s.name.length > 18 ? `${s.name.slice(0, 18)}…` : s.name,
    amount: s.amountMinor / 100,
  }));

  const agencyName =
    tenant.data?.agency?.name ?? tenant.data?.agency?.legalName ?? 'Nigeria Customs';
  const agencyCode = tenant.data?.agency?.code ?? tenant.data?.tenantCode ?? 'NCS';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collection Dashboard"
        description={`Live overview for ${agencyName}${isFetching ? ' · refreshing' : ''}`}
        actions={
          <Badge variant="success">Settlements pending: {data.settlementStatus.pending}</Badge>
        }
      />

      <Card className="animate-fade-up overflow-hidden border-brass/25 bg-gradient-to-r from-navy/[0.04] via-card to-accent/[0.05]">
        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-navy text-white seal-ring">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-brass-deep">Operating agency</p>
            <p className="break-words font-serif text-lg text-navy dark:text-foreground sm:text-xl">
              {agencyName}{' '}
              <span className="text-base text-muted-foreground">({agencyCode})</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Seeded demo data includes assessments, invoices, payments NCS202607000001–000005, and
              treasury settlements.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Today's Revenue"
          value={formatMoney(data.todaysRevenue)}
          hint={`${formatNumber(data.todaysCount)} payments today`}
          icon={TrendingUp}
          delay="stagger-1"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatMoney(data.monthlyRevenue)}
          hint={`${formatNumber(data.monthlyCount)} payments this month`}
          icon={Wallet}
          delay="stagger-2"
        />
        <StatCard
          title="Outstanding"
          value={formatMoney(data.outstanding.amountMinor)}
          hint={`${formatNumber(data.outstanding.count)} open invoices`}
          icon={Receipt}
          delay="stagger-3"
        />
        <StatCard
          title="Conversion"
          value={`${formatNumber(data.paymentConversion)}%`}
          hint="Paid requests / total"
          icon={Percent}
          delay="stagger-4"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Pending" value={formatNumber(data.pendingPayments)} icon={Clock3} delay="stagger-1" />
        <StatCard title="Paid" value={formatNumber(data.paid)} icon={CheckCircle2} delay="stagger-2" />
        <StatCard title="Failed" value={formatNumber(data.failed)} icon={XCircle} delay="stagger-3" />
        <StatCard title="Expired" value={formatNumber(data.expired)} icon={AlertTriangle} delay="stagger-4" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="animate-fade-up stagger-2">
          <CardHeader>
            <CardTitle>Top Revenue Sources</CardTitle>
            <CardDescription>Highest paid invoice lines by revenue type</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No paid revenue sources yet. Run <code>pnpm db:seed</code> to load NCS mock collections.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,26,48,0.1)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) =>
                      new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
                        value,
                      )
                    }
                  />
                  <Bar dataKey="amount" fill="#0C6B45" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-up stagger-3">
          <CardHeader>
            <CardTitle>Settlement Status</CardTitle>
            <CardDescription>Treasury settlement queue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-brass/20 bg-gradient-to-br from-muted/60 to-accent/5 p-4">
              <p className="text-sm text-muted-foreground">Pending settlement batches</p>
              <p className="mt-1 font-serif text-3xl text-navy dark:text-foreground">
                {formatNumber(data.settlementStatus.pending)}
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Paid requests: {formatNumber(data.paid)}</p>
              <p>Failed requests: {formatNumber(data.failed)}</p>
              <p>Expired requests: {formatNumber(data.expired)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
