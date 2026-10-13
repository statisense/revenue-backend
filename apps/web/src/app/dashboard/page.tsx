'use client';

import Link from 'next/link';
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
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Percent,
  Receipt,
  TrendingUp,
  Wallet,
  XCircle,
  Building2,
  Banknote,
} from 'lucide-react';
import { api } from '@/lib/api';
import { displayAgencyCode, displayAgencyName, BRAND } from '@/lib/brand';
import { formatMoney, formatNumber, cn } from '@/lib/utils';
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

type Assessment = { id: string; status: string };
type Invoice = { id: string; status: string };
type Refund = { id: string; status: string };

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
    <Card className={cn('animate-fade-up', delay)}>
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

function QueueLink({
  href,
  title,
  count,
  tone,
  icon: Icon,
}: {
  href: string;
  title: string;
  count: number;
  tone: 'warn' | 'danger' | 'info' | 'good';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneClass =
    tone === 'warn'
      ? 'border-brass/30 bg-brass/5'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30'
        : tone === 'good'
          ? 'border-accent/25 bg-accent/5'
          : 'border-border bg-muted/30';

  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 transition hover:border-accent/40 hover:shadow-panel',
        toneClass,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-navy dark:text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{formatNumber(count)} requiring attention</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-accent" />
    </Link>
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

  const assessments = useQuery({
    queryKey: ['assessments-queue'],
    queryFn: async () => {
      const res = await api<Assessment[] | Assessment>('/assessments');
      return Array.isArray(res) ? res : res ? [res] : [];
    },
  });
  const invoices = useQuery({
    queryKey: ['invoices-queue'],
    queryFn: async () => {
      const res = await api<Invoice[] | Invoice>('/invoices');
      return Array.isArray(res) ? res : res ? [res] : [];
    },
  });
  const refunds = useQuery({
    queryKey: ['refunds-queue'],
    queryFn: async () => {
      const res = await api<Refund[] | Refund>('/refunds');
      return Array.isArray(res) ? res : res ? [res] : [];
    },
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

  const agencyName = displayAgencyName(
    tenant.data?.agency?.name ?? tenant.data?.agency?.legalName,
  );
  const agencyCode = displayAgencyCode(tenant.data?.agency?.code ?? tenant.data?.tenantCode);

  const pendingApprovals =
    assessments.data?.filter((a) => a.status === 'PENDING_APPROVAL').length ?? 0;
  const overdueInvoices = invoices.data?.filter((a) => a.status === 'OVERDUE').length ?? 0;
  const pendingRefunds = refunds.data?.filter((r) => r.status === 'PENDING').length ?? 0;

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
              {BRAND.tagline}. Demo payments use seeded codes NCS202607000001–000005.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-6 rounded-full bg-gradient-to-r from-brass to-accent" />
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">
            Needs action
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QueueLink
            href="/assessments"
            title="Assessments awaiting approval"
            count={pendingApprovals}
            tone="warn"
            icon={ClipboardList}
          />
          <QueueLink
            href="/invoices"
            title="Overdue invoices"
            count={overdueInvoices}
            tone="danger"
            icon={FileText}
          />
          <QueueLink
            href="/refunds"
            title="Refunds pending dual control"
            count={pendingRefunds}
            tone="info"
            icon={Wallet}
          />
          <QueueLink
            href="/settlements"
            title="Settlement batches pending"
            count={data.settlementStatus.pending}
            tone="good"
            icon={Banknote}
          />
        </div>
      </section>

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
                No paid revenue sources yet. Run <code>pnpm db:seed</code> to load demo collections.
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
              <p className="mt-1 font-serif text-3xl text-navy dark:text-foreground tabular-nums">
                {formatNumber(data.settlementStatus.pending)}
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Paid requests: {formatNumber(data.paid)}</p>
              <p>Failed requests: {formatNumber(data.failed)}</p>
              <p>Expired requests: {formatNumber(data.expired)}</p>
            </div>
            <Link href="/settlements" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              Open settlements <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
