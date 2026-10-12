'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CHART_COLORS,
  DataTable,
  KpiCard,
  ReportFooter,
  ReportMasthead,
  ReportSheet,
  SectionTitle,
  shareBar,
  pct,
  type ReportMeta,
} from './report-shared';

const STATUS_COLORS: Record<string, string> = {
  PAID: '#0C6B45',
  PENDING: '#B89A4F',
  FAILED: '#B91C1C',
  EXPIRED: '#6B7280',
  PROCESSING: '#3D6A9A',
  REFUNDED: '#7C3AED',
  SETTLED: '#0C6B45',
  APPROVED: '#0C6B45',
  REJECTED: '#B91C1C',
  INVOICED: '#3D6A9A',
  DRAFT: '#6B7280',
  PENDING_APPROVAL: '#B89A4F',
};

function Sheet({ children }: { children: React.ReactNode }) {
  return <ReportSheet>{children}</ReportSheet>;
}

export function CollectionView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  const trendChart = useMemo(
    () =>
      (data.trend ?? []).map((t: any) => ({
        date: String(t.date).slice(5),
        amount: t.amountMinor / 100,
      })),
    [data.trend],
  );
  const typeChart = useMemo(
    () =>
      (data.byRevenueType ?? []).slice(0, 8).map((t: any) => ({
        name: t.name.length > 18 ? `${t.name.slice(0, 18)}…` : t.name,
        amount: t.amountMinor / 100,
      })),
    [data.byRevenueType],
  );
  const statusChart = useMemo(
    () =>
      (data.statusMix ?? []).map((s: any) => ({
        name: s.status,
        value: s.count,
      })),
    [data.statusMix],
  );
  const collected = data.kpis.collectedMinor ?? 0;
  const maxType = Math.max(0, ...(data.byRevenueType?.map((r: any) => r.amountMinor) ?? [0]));
  const maxBranch = Math.max(0, ...(data.byBranch?.map((r: any) => r.amountMinor) ?? [0]));
  const maxOfficer = Math.max(0, ...(data.byOfficer?.map((r: any) => r.amountMinor) ?? [0]));

  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            Confirmed collections of <span className="font-medium">{formatMoney(data.kpis.collectedMinor)}</span>{' '}
            across {formatNumber(data.kpis.collectedCount)} receipts, with{' '}
            {formatMoney(data.kpis.outstandingMinor)} receivable and {formatNumber(data.kpis.conversionRate)}%
            conversion.
          </>
        }
      />

      <section>
        <SectionTitle eyebrow="01 · Executive summary" title="Collection posture" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Collected" value={formatMoney(data.kpis.collectedMinor)} hint={`${formatNumber(data.kpis.collectedCount)} payments`} tone="good" />
          <KpiCard label="Outstanding" value={formatMoney(data.kpis.outstandingMinor)} hint={`${formatNumber(data.kpis.outstandingCount)} invoices`} tone="warn" />
          <KpiCard label="Pending requests" value={formatMoney(data.kpis.pendingMinor)} hint={`${formatNumber(data.kpis.pendingCount)} awaiting`} />
          <KpiCard label="Conversion" value={`${formatNumber(data.kpis.conversionRate)}%`} hint={`Avg ${formatMoney(data.kpis.averageTicketMinor)}`} tone="good" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Period growth"
            value={`${data.kpis.growthVsPriorPeriodPct >= 0 ? '+' : ''}${data.kpis.growthVsPriorPeriodPct}%`}
            hint={`Prior ${formatMoney(data.kpis.priorCollectedMinor)}`}
            tone={data.kpis.growthVsPriorPeriodPct >= 0 ? 'good' : 'danger'}
          />
          <KpiCard label="Refunds" value={formatMoney(data.kpis.refundsMinor)} hint={`${formatNumber(data.kpis.refundsCount)} records`} />
          <KpiCard label="Settlements pending" value={formatNumber(data.kpis.settlementsPending)} />
          <div className="flex items-center gap-3 rounded-lg border border-border bg-gradient-to-br from-navy/[0.04] to-accent/[0.06] p-4">
            {data.kpis.growthVsPriorPeriodPct >= 0 ? (
              <TrendingUp className="h-8 w-8 text-accent" />
            ) : (
              <TrendingDown className="h-8 w-8 text-red-700" />
            )}
            <div>
              <p className="text-sm font-medium">Performance signal</p>
              <p className="text-xs text-muted-foreground">
                {data.kpis.growthVsPriorPeriodPct >= 0 ? 'Collections improved vs prior window.' : 'Collections softened vs prior window.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="02 · Trend" title="Daily collection trajectory" />
        <Card>
          <CardContent className="h-72 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendChart}>
                <defs>
                  <linearGradient id="collectFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0C6B45" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0C6B45" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,26,48,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => new Intl.NumberFormat('en-NG', { notation: 'compact' }).format(v)} />
                <Tooltip formatter={(v: number) => formatMoney(Math.round(v * 100))} />
                <Area type="monotone" dataKey="amount" stroke="#0C6B45" fill="url(#collectFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-6">
        <SectionTitle eyebrow="03 · Composition" title="Revenue mix & outcomes" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By revenue type</CardTitle>
              <CardDescription>Paid invoice lines</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeChart} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,26,48,0.1)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatMoney(Math.round(v * 100))} />
                  <Bar dataKey="amount" fill="#081A30" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Request status mix</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {statusChart.map((entry: any) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? CHART_COLORS[0]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {[
            { title: 'Revenue types', rows: data.byRevenueType, max: maxType, countKey: 'count' },
            { title: 'Branches', rows: data.byBranch, max: maxBranch, countKey: 'count' },
            { title: 'Officers', rows: data.byOfficer, max: maxOfficer, countKey: 'assessments' },
          ].map((block) => (
            <div key={block.title}>
              <h3 className="mb-3 font-serif text-lg">{block.title}</h3>
              <div className="space-y-3">
                {(block.rows ?? []).map((row: any) => (
                  <div key={row.name} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{row.name}</span>
                      <span className="shrink-0 tabular-nums">{formatMoney(row.amountMinor)}</span>
                    </div>
                    {shareBar(row.amountMinor, block.max)}
                    <p className="text-[11px] text-muted-foreground">
                      {formatNumber(row[block.countKey] ?? 0)} · {pct(row.amountMinor, collected)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-3 font-serif text-lg">Top payers</h3>
          <DataTable
            caption="Concentration analysis — top payers in period"
            headers={[
              { label: '#' },
              { label: 'Payer' },
              { label: 'Payments' },
              { label: 'Amount', align: 'right' },
              { label: 'Share', align: 'right' },
            ]}
            colSpan={5}
            empty={!data.topPayers?.length}
          >
            {data.topPayers?.map((p: any, idx: number) => (
              <tr key={p.payerName}>
                <td className="text-muted-foreground">{idx + 1}</td>
                <td className="font-medium">{p.payerName}</td>
                <td>{formatNumber(p.count)}</td>
                <td className="text-right tabular-nums">{formatMoney(p.amountMinor)}</td>
                <td className="text-right text-muted-foreground">{pct(p.amountMinor, collected)}%</td>
              </tr>
            ))}
          </DataTable>
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="04 · Register"
          title="Collections register"
          description="Confirmed receipts forming the cash book source for this reporting window."
        />
        <DataTable
          caption="Collections register (confirmed payments)"
          headers={[
            { label: 'Paid at' },
            { label: 'Code' },
            { label: 'Invoice' },
            { label: 'Payer' },
            { label: 'Provider' },
            { label: 'Amount', align: 'right' },
          ]}
          colSpan={6}
          empty={!data.recentCollections?.length}
          footer={
            <tr>
              <td colSpan={5}>Period total (register sample)</td>
              <td className="text-right tabular-nums">
                {formatMoney(
                  (data.recentCollections ?? []).reduce((s: number, r: any) => s + (r.amountMinor ?? 0), 0),
                )}
              </td>
            </tr>
          }
        >
          {data.recentCollections?.map((r: any) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{formatDate(r.paidAt)}</td>
              <td className="font-mono text-xs">{r.paymentCode}</td>
              <td>{r.invoiceNumber}</td>
              <td>{r.payerName}</td>
              <td>{r.provider || '—'}</td>
              <td className="text-right font-medium tabular-nums">
                {formatMoney(r.amountMinor, r.currency)}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function AgedReceivablesView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  const bucketChart = (data.buckets ?? []).map((b: any) => ({
    name: b.label,
    amount: b.amountMinor / 100,
  }));

  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            Open receivables of <span className="font-medium">{formatMoney(data.kpis.outstandingMinor)}</span> across{' '}
            {formatNumber(data.kpis.outstandingCount)} invoices. Overdue share{' '}
            {formatNumber(data.kpis.overdueSharePct)}%.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · Aging summary" title="Receivables by age band" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total outstanding" value={formatMoney(data.kpis.outstandingMinor)} tone="warn" />
          <KpiCard label="Current / 0–30" value={formatMoney(data.kpis.currentMinor)} tone="good" />
          <KpiCard label="31–90 days" value={formatMoney(data.kpis.days31to60Minor + data.kpis.days61to90Minor)} />
          <KpiCard label="Over 90 days" value={formatMoney(data.kpis.over90Minor)} tone="danger" />
        </div>
        <Card className="mt-4">
          <CardContent className="h-64 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bucketChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,26,48,0.1)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => new Intl.NumberFormat('en-NG', { notation: 'compact' }).format(v)} />
                <Tooltip formatter={(v: number) => formatMoney(Math.round(v * 100))} />
                <Bar dataKey="amount" fill="#B89A4F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>
      <section>
        <SectionTitle
          eyebrow="02 · Detail"
          title="Aging schedule"
          description="Outstanding invoices aged by due date for credit control and audit follow-up."
        />
        <DataTable
          caption="AR aging schedule"
          headers={[
            { label: 'Invoice' },
            { label: 'Payer' },
            { label: 'Branch' },
            { label: 'Due' },
            { label: 'Days' },
            { label: 'Bucket' },
            { label: 'Balance', align: 'right' },
          ]}
          colSpan={7}
          empty={!data.rows?.length}
          footer={
            <tr>
              <td colSpan={6}>Total outstanding</td>
              <td className="text-right tabular-nums">{formatMoney(data.kpis.outstandingMinor)}</td>
            </tr>
          }
        >
          {data.rows?.map((r: any) => (
            <tr key={r.invoiceNumber}>
              <td className="font-medium">{r.invoiceNumber}</td>
              <td>{r.payerName}</td>
              <td>{r.branch}</td>
              <td>{formatDate(r.dueAt)}</td>
              <td className="tabular-nums">{r.daysPastDue}</td>
              <td>{r.bucket}</td>
              <td className="text-right font-medium tabular-nums">{formatMoney(r.balanceMinor)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function CashReceiptsView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  const daily = (data.dailyTotals ?? []).map((d: any) => ({
    date: String(d.date).slice(5),
    amount: d.amountMinor / 100,
  }));

  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            Cash book records {formatNumber(data.kpis.receiptCount)} receipts totalling{' '}
            <span className="font-medium">{formatMoney(data.kpis.totalMinor)}</span>.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · Cash control" title="Receipts summary" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Receipts" value={formatNumber(data.kpis.receiptCount)} />
          <KpiCard label="Total collected" value={formatMoney(data.kpis.totalMinor)} tone="good" />
          <KpiCard label="Average ticket" value={formatMoney(data.kpis.averageTicketMinor)} />
          <KpiCard label="Active days" value={formatNumber(data.kpis.distinctDays)} />
        </div>
        <Card className="mt-4">
          <CardContent className="h-56 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,26,48,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => new Intl.NumberFormat('en-NG', { notation: 'compact' }).format(v)} />
                <Tooltip formatter={(v: number) => formatMoney(Math.round(v * 100))} />
                <Area type="monotone" dataKey="amount" stroke="#081A30" fill="#081A3022" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>
      <section>
        <SectionTitle
          eyebrow="02 · Journal"
          title="Cash receipts journal"
          description="Day-book of confirmed receipts with payer, channel, and invoice reference."
        />
        <DataTable
          caption="Cash receipts journal (CRJ)"
          headers={[
            { label: 'Paid at' },
            { label: 'Receipt #' },
            { label: 'Code' },
            { label: 'Invoice' },
            { label: 'Payer' },
            { label: 'Method' },
            { label: 'Provider' },
            { label: 'Branch' },
            { label: 'Amount', align: 'right' },
          ]}
          colSpan={9}
          empty={!data.rows?.length}
          footer={
            <tr>
              <td colSpan={8}>Journal total</td>
              <td className="text-right tabular-nums">{formatMoney(data.kpis.totalMinor)}</td>
            </tr>
          }
        >
          {data.rows?.map((r: any, i: number) => (
            <tr key={`${r.paymentCode}-${i}`}>
              <td className="whitespace-nowrap">{formatDate(r.paidAt)}</td>
              <td className="font-mono text-xs">{r.receiptNumber}</td>
              <td className="font-mono text-xs">{r.paymentCode}</td>
              <td>{r.invoiceNumber}</td>
              <td>{r.payerName}</td>
              <td>{r.method}</td>
              <td>{r.provider}</td>
              <td>{r.branch}</td>
              <td className="text-right font-medium tabular-nums">{formatMoney(r.amountMinor)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function RevenueGlView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  const glChart = (data.byGlCode ?? []).map((g: any) => ({
    name: g.glCode,
    amount: g.amountMinor / 100,
  }));

  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            Recognised revenue of <span className="font-medium">{formatMoney(data.kpis.totalMinor)}</span> across{' '}
            {formatNumber(data.kpis.revenueTypeCount)} fee types and {formatNumber(data.kpis.glAccountCount)} GL
            accounts.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · GL control" title="Revenue by ledger account" />
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard label="Total revenue" value={formatMoney(data.kpis.totalMinor)} tone="good" />
          <KpiCard label="Fee types" value={formatNumber(data.kpis.revenueTypeCount)} />
          <KpiCard label="GL accounts" value={formatNumber(data.kpis.glAccountCount)} />
        </div>
        <Card className="mt-4">
          <CardContent className="h-56 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={glChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,26,48,0.1)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => new Intl.NumberFormat('en-NG', { notation: 'compact' }).format(v)} />
                <Tooltip formatter={(v: number) => formatMoney(Math.round(v * 100))} />
                <Bar dataKey="amount" fill="#0C6B45" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>
      <section>
        <SectionTitle
          eyebrow="02 · Fee lines"
          title="Revenue type / GL mapping"
          description="Recognised revenue mapped to fee types and general-ledger codes."
        />
        <DataTable
          caption="Revenue by type & GL"
          headers={[
            { label: 'Code' },
            { label: 'Revenue type' },
            { label: 'Category' },
            { label: 'GL code' },
            { label: 'Lines' },
            { label: 'Amount', align: 'right' },
            { label: 'Share', align: 'right' },
          ]}
          colSpan={7}
          empty={!data.lines?.length}
          footer={
            <tr>
              <td colSpan={5}>Recognised total</td>
              <td className="text-right tabular-nums">{formatMoney(data.kpis.totalMinor)}</td>
              <td className="text-right">100%</td>
            </tr>
          }
        >
          {data.lines?.map((r: any) => (
            <tr key={r.revenueTypeCode}>
              <td className="font-mono text-xs">{r.revenueTypeCode}</td>
              <td className="font-medium">{r.revenueTypeName}</td>
              <td>{r.category}</td>
              <td className="font-mono text-xs">{r.glCode}</td>
              <td>{formatNumber(r.lineCount)}</td>
              <td className="text-right tabular-nums">{formatMoney(r.amountMinor)}</td>
              <td className="text-right text-muted-foreground">{r.sharePct}%</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function TreasurySettlementView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            Period settled <span className="font-medium">{formatMoney(data.kpis.periodSettledMinor)}</span> across{' '}
            {formatNumber(data.kpis.batchCount)} batches. Pending remittance{' '}
            {formatMoney(data.kpis.pendingMinor)}.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · Treasury posture" title="Settlement control totals" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Batches" value={formatNumber(data.kpis.batchCount)} />
          <KpiCard label="Settlements (period)" value={formatNumber(data.kpis.settlementCount)} />
          <KpiCard label="Settled (period)" value={formatMoney(data.kpis.periodSettledMinor)} tone="good" />
          <KpiCard label="Pending remittance" value={formatMoney(data.kpis.pendingMinor)} tone="warn" />
        </div>
      </section>
      <section>
        <SectionTitle eyebrow="02 · Batches" title="Settlement batches" />
        <DataTable
          headers={[
            { label: 'Batch #' },
            { label: 'Status' },
            { label: 'TSA ref' },
            { label: 'Settled' },
            { label: 'Amount', align: 'right' },
          ]}
          colSpan={5}
          empty={!data.batches?.length}
        >
          {data.batches?.map((b: any) => (
            <tr key={b.batchNumber} className="border-b border-border/80 last:border-0">
              <td className="px-3 py-2.5 font-mono text-xs">{b.batchNumber}</td>
              <td className="px-3 py-2.5">{b.status}</td>
              <td className="px-3 py-2.5">{b.tsaReference || '—'}</td>
              <td className="px-3 py-2.5">{formatDate(b.settledAt)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(b.totalMinor)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <section>
        <SectionTitle
          eyebrow="03 · Detail"
          title="Settlement register"
          description="Payment remittances mapped to settlement batches and TSA accounts."
        />
        <DataTable
          caption="TSA remittance register"
          headers={[
            { label: 'Invoice' },
            { label: 'Payer' },
            { label: 'Batch' },
            { label: 'Status' },
            { label: 'TSA account' },
            { label: 'Amount', align: 'right' },
          ]}
          colSpan={6}
          empty={!data.rows?.length}
          footer={
            <tr>
              <td colSpan={5}>Register total</td>
              <td className="text-right tabular-nums">
                {formatMoney((data.rows ?? []).reduce((s: number, r: any) => s + (r.amountMinor ?? 0), 0))}
              </td>
            </tr>
          }
        >
          {data.rows?.map((r: any) => (
            <tr key={r.id}>
              <td>{r.invoiceNumber}</td>
              <td>{r.payerName}</td>
              <td className="font-mono text-xs">{r.batchNumber}</td>
              <td>{r.status}</td>
              <td className="font-mono text-xs">{r.tsaAccount || '—'}</td>
              <td className="text-right tabular-nums">{formatMoney(r.amountMinor)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function RefundsView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            {formatNumber(data.kpis.refundCount)} refunds totalling{' '}
            <span className="font-medium">{formatMoney(data.kpis.totalMinor)}</span> in the selected window.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · Adjustments" title="Refund control" />
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard label="Refund count" value={formatNumber(data.kpis.refundCount)} tone="warn" />
          <KpiCard label="Total refunded" value={formatMoney(data.kpis.totalMinor)} tone="danger" />
          <KpiCard label="Average refund" value={formatMoney(data.kpis.averageMinor)} />
        </div>
      </section>
      <section>
        <SectionTitle
          eyebrow="02 · Register"
          title="Refunds & adjustments"
          description="Refunds processed against collections with reason and status control."
        />
        <DataTable
          caption="Refund register"
          headers={[
            { label: 'Created' },
            { label: 'Status' },
            { label: 'Invoice' },
            { label: 'Payer' },
            { label: 'Code' },
            { label: 'Reason' },
            { label: 'Amount', align: 'right' },
          ]}
          colSpan={7}
          empty={!data.rows?.length}
          footer={
            <tr>
              <td colSpan={6}>Total refunded</td>
              <td className="text-right tabular-nums">{formatMoney(data.kpis.totalMinor)}</td>
            </tr>
          }
        >
          {data.rows?.map((r: any) => (
            <tr key={r.id}>
              <td>{formatDate(r.createdAt)}</td>
              <td>{r.status}</td>
              <td>{r.invoiceNumber}</td>
              <td>{r.payerName}</td>
              <td className="font-mono text-xs">{r.paymentCode}</td>
              <td className="max-w-[200px] truncate">{r.reason}</td>
              <td className="text-right tabular-nums">{formatMoney(r.amountMinor)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function PaymentChannelsView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  const providerChart = (data.byProvider ?? []).map((p: any) => ({
    name: p.provider,
    value: p.count,
    amount: p.amountMinor / 100,
  }));

  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            {formatNumber(data.kpis.paymentCount)} payments via {formatNumber(data.kpis.providerCount)} gateways /
            {formatNumber(data.kpis.methodCount)} methods, totalling{' '}
            <span className="font-medium">{formatMoney(data.kpis.totalMinor)}</span>.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · Channel mix" title="Gateway & method performance" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Payments" value={formatNumber(data.kpis.paymentCount)} />
          <KpiCard label="Collected" value={formatMoney(data.kpis.totalMinor)} tone="good" />
          <KpiCard label="Providers" value={formatNumber(data.kpis.providerCount)} />
          <KpiCard label="Methods" value={formatNumber(data.kpis.methodCount)} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By provider</CardTitle>
            </CardHeader>
            <CardContent className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={providerChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85}>
                    {providerChart.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <div className="space-y-3">
            <h3 className="font-serif text-lg">Providers</h3>
            {(data.byProvider ?? []).map((p: any) => (
              <div key={p.provider} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{p.provider}</span>
                  <span className="tabular-nums">{formatMoney(p.amountMinor)}</span>
                </div>
                {shareBar(p.amountMinor, data.kpis.totalMinor)}
                <p className="text-[11px] text-muted-foreground">
                  {formatNumber(p.count)} payments · {p.sharePct}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section>
        <SectionTitle eyebrow="02 · Methods" title="Payment method breakdown" />
        <DataTable
          caption="Collections by payment method"
          headers={[
            { label: 'Method' },
            { label: 'Count' },
            { label: 'Amount', align: 'right' },
            { label: 'Share', align: 'right' },
          ]}
          colSpan={4}
          empty={!data.byMethod?.length}
          footer={
            <tr>
              <td>Total</td>
              <td>{formatNumber(data.kpis.paymentCount)}</td>
              <td className="text-right tabular-nums">{formatMoney(data.kpis.totalMinor)}</td>
              <td className="text-right">100%</td>
            </tr>
          }
        >
          {data.byMethod?.map((m: any) => (
            <tr key={m.method}>
              <td className="font-medium">{m.method}</td>
              <td>{formatNumber(m.count)}</td>
              <td className="text-right tabular-nums">{formatMoney(m.amountMinor)}</td>
              <td className="text-right text-muted-foreground">{m.sharePct}%</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function OfficerProductivityView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            {formatNumber(data.kpis.officerCount)} officers raised {formatNumber(data.kpis.assessmentCount)}{' '}
            assessments valued at <span className="font-medium">{formatMoney(data.kpis.totalMinor)}</span>.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · Productivity" title="Officer scorecard" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Officers" value={formatNumber(data.kpis.officerCount)} />
          <KpiCard label="Assessments" value={formatNumber(data.kpis.assessmentCount)} />
          <KpiCard label="Total value" value={formatMoney(data.kpis.totalMinor)} tone="good" />
          <KpiCard label="Avg / officer" value={formatMoney(data.kpis.averagePerOfficer)} />
        </div>
      </section>
      <section>
        <SectionTitle eyebrow="02 · Detail" title="By officer" />
        <DataTable
          caption="Officer assessment productivity"
          headers={[
            { label: 'Officer' },
            { label: 'Assessments' },
            { label: 'Approved' },
            { label: 'Pending' },
            { label: 'Rejected' },
            { label: 'Invoiced' },
            { label: 'Value', align: 'right' },
          ]}
          colSpan={7}
          empty={!data.officers?.length}
          footer={
            <tr>
              <td>Total</td>
              <td>{formatNumber(data.kpis.assessmentCount)}</td>
              <td colSpan={4} />
              <td className="text-right tabular-nums">{formatMoney(data.kpis.totalMinor)}</td>
            </tr>
          }
        >
          {data.officers?.map((o: any) => (
            <tr key={o.name}>
              <td className="font-medium">{o.name}</td>
              <td>{formatNumber(o.assessments)}</td>
              <td>{formatNumber(o.approved)}</td>
              <td>{formatNumber(o.pending)}</td>
              <td>{formatNumber(o.rejected)}</td>
              <td>{formatNumber(o.invoiced)}</td>
              <td className="text-right tabular-nums">{formatMoney(o.amountMinor)}</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function BranchComparativeView({ data }: { data: any }) {
  const meta = data.meta as ReportMeta;
  const chart = (data.rows ?? []).slice(0, 10).map((r: any) => ({
    name: r.name.length > 14 ? `${r.name.slice(0, 14)}…` : r.name,
    collected: r.collectedMinor / 100,
    outstanding: r.outstandingMinor / 100,
  }));

  return (
    <Sheet>
      <ReportMasthead
        meta={meta}
        summary={
          <>
            {formatNumber(data.kpis.branchCount)} branches collected{' '}
            <span className="font-medium">{formatMoney(data.kpis.totalCollectedMinor)}</span>. Leading command:{' '}
            {data.kpis.leadingBranch}.
          </>
        }
      />
      <section>
        <SectionTitle eyebrow="01 · Comparative" title="Branch scorecard" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Branches" value={formatNumber(data.kpis.branchCount)} />
          <KpiCard label="Collected" value={formatMoney(data.kpis.totalCollectedMinor)} tone="good" />
          <KpiCard label="Outstanding" value={formatMoney(data.kpis.totalOutstandingMinor)} tone="warn" />
          <KpiCard label="Leading branch" value={data.kpis.leadingBranch} />
        </div>
        <Card className="mt-4">
          <CardContent className="h-64 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(8,26,48,0.1)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => new Intl.NumberFormat('en-NG', { notation: 'compact' }).format(v)} />
                <Tooltip />
                <Legend />
                <Bar dataKey="collected" name="Collected" fill="#0C6B45" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outstanding" name="Outstanding" fill="#B89A4F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </section>
      <section>
        <SectionTitle eyebrow="02 · Detail" title="Branch comparative table" />
        <DataTable
          caption="Branch / command comparative scorecard"
          headers={[
            { label: 'Code' },
            { label: 'Branch' },
            { label: 'State' },
            { label: 'Collected' },
            { label: 'Outstanding' },
            { label: 'Assessments' },
            { label: 'Share', align: 'right' },
          ]}
          colSpan={7}
          empty={!data.rows?.length}
          footer={
            <tr>
              <td colSpan={3}>All branches</td>
              <td className="tabular-nums">{formatMoney(data.kpis.totalCollectedMinor)}</td>
              <td className="tabular-nums">{formatMoney(data.kpis.totalOutstandingMinor)}</td>
              <td />
              <td className="text-right">100%</td>
            </tr>
          }
        >
          {data.rows?.map((r: any) => (
            <tr key={r.branchId}>
              <td className="font-mono text-xs">{r.code}</td>
              <td className="font-medium">{r.name}</td>
              <td>{r.state || '—'}</td>
              <td className="tabular-nums">{formatMoney(r.collectedMinor)}</td>
              <td className="tabular-nums">{formatMoney(r.outstandingMinor)}</td>
              <td>{formatNumber(r.assessments)}</td>
              <td className="text-right text-muted-foreground">{r.collectionSharePct}%</td>
            </tr>
          ))}
        </DataTable>
      </section>
      <ReportFooter meta={meta} />
    </Sheet>
  );
}

export function renderReportView(type: string, data: any) {
  switch (type) {
    case 'collection':
      return <CollectionView data={data} />;
    case 'aged-receivables':
      return <AgedReceivablesView data={data} />;
    case 'cash-receipts':
      return <CashReceiptsView data={data} />;
    case 'revenue-gl':
      return <RevenueGlView data={data} />;
    case 'treasury-settlement':
      return <TreasurySettlementView data={data} />;
    case 'refunds':
      return <RefundsView data={data} />;
    case 'payment-channels':
      return <PaymentChannelsView data={data} />;
    case 'officer-productivity':
      return <OfficerProductivityView data={data} />;
    case 'branch-comparative':
      return <BranchComparativeView data={data} />;
    default:
      return <CollectionView data={data} />;
  }
}
