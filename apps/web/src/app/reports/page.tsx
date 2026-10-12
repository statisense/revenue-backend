'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  FileBarChart2,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState, PageHeader } from '@/components/page-shell';
import { Input } from '@/components/ui/input';
import { PERIODS, buildDocId, type ReportMeta } from './report-shared';
import { renderReportView } from './report-views';

type CatalogItem = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  category: string;
  audience: string;
  standards: string[];
};

const FALLBACK_CATALOG: CatalogItem[] = [
  {
    id: 'collection',
    code: 'RCP',
    title: 'Collection Performance',
    subtitle: 'Confirmed collections, conversion, and period-on-period growth',
    category: 'Management',
    audience: 'Executive · Treasury · Audit',
    standards: ['IPSAS cash basis', 'Management reporting'],
  },
  {
    id: 'aged-receivables',
    code: 'AR-AGE',
    title: 'Aged Receivables',
    subtitle: 'Outstanding invoices aged by due date (current, 31–60, 61–90, 90+ days)',
    category: 'Receivables',
    audience: 'Finance · Credit control · Audit',
    standards: ['AR aging schedule'],
  },
  {
    id: 'cash-receipts',
    code: 'CRJ',
    title: 'Cash Receipts Journal',
    subtitle: 'Day-book of confirmed receipts with payer, channel, and invoice reference',
    category: 'Cash book',
    audience: 'Cashier · Treasury · Internal audit',
    standards: ['Cash receipts journal'],
  },
  {
    id: 'revenue-gl',
    code: 'REV-GL',
    title: 'Revenue by Type & GL',
    subtitle: 'Recognised revenue lines mapped to fee types and general-ledger codes',
    category: 'Revenue recognition',
    audience: 'Finance · Chart of accounts · Audit',
    standards: ['Revenue by account'],
  },
  {
    id: 'treasury-settlement',
    code: 'TSA',
    title: 'Treasury Settlement & Remittance',
    subtitle: 'Settlement batches and payment remittances to treasury / TSA accounts',
    category: 'Treasury',
    audience: 'Treasury · Accountant-General liaison',
    standards: ['TSA remittance register'],
  },
  {
    id: 'refunds',
    code: 'REF',
    title: 'Refunds & Adjustments',
    subtitle: 'Refunds processed against collections with reason and status control',
    category: 'Adjustments',
    audience: 'Treasury · Compliance · Audit',
    standards: ['Refund register'],
  },
  {
    id: 'payment-channels',
    code: 'CHN',
    title: 'Payment Channel Performance',
    subtitle: 'Collections by gateway provider and payment method',
    category: 'Operations',
    audience: 'Payments ops · Treasury · IT',
    standards: ['Channel mix'],
  },
  {
    id: 'officer-productivity',
    code: 'OFF',
    title: 'Officer Assessment Productivity',
    subtitle: 'Assessments raised by officer with value and workflow status mix',
    category: 'Operations',
    audience: 'Branch managers · Compliance',
    standards: ['Officer productivity'],
  },
  {
    id: 'branch-comparative',
    code: 'BRN',
    title: 'Branch / Command Comparative',
    subtitle: 'Collections, outstanding, and assessment volume by branch or command',
    category: 'Comparative',
    audience: 'Regional management · Executive',
    standards: ['Branch scorecard'],
  },
];

function rowsForCsv(type: string, data: any): string[][] {
  const meta = data.meta as ReportMeta | undefined;
  const preamble: string[][] = meta
    ? [
        ['Document', buildDocId(meta)],
        ['Agency', `${meta.agency.code} — ${meta.agency.name}`],
        ['Report', meta.title],
        ['Period', meta.period],
        ['Coverage start', String(meta.start)],
        ['Coverage end', String(meta.end)],
        ['Generated at', String(meta.generatedAt)],
        ['Currency', meta.currency],
        ['Classification', meta.classification],
        ['Basis', 'Cash / IPSAS'],
        [],
      ]
    : [];

  let body: string[][];
  switch (type) {
    case 'aged-receivables':
      body = [
        ['Invoice', 'Payer', 'Branch', 'Due', 'Days', 'Bucket', 'Balance'],
        ...(data.rows ?? []).map((r: any) => [
          r.invoiceNumber,
          r.payerName,
          r.branch,
          r.dueAt ?? '',
          r.daysPastDue,
          r.bucket,
          (r.balanceMinor / 100).toFixed(2),
        ]),
      ];
      break;
    case 'cash-receipts':
      body = [
        ['Paid at', 'Receipt', 'Code', 'Invoice', 'Payer', 'Method', 'Provider', 'Branch', 'Amount'],
        ...(data.rows ?? []).map((r: any) => [
          r.paidAt ?? '',
          r.receiptNumber,
          r.paymentCode,
          r.invoiceNumber,
          r.payerName,
          r.method,
          r.provider,
          r.branch,
          (r.amountMinor / 100).toFixed(2),
        ]),
      ];
      break;
    case 'revenue-gl':
      body = [
        ['Code', 'Revenue type', 'Category', 'GL', 'Lines', 'Amount', 'Share %'],
        ...(data.lines ?? []).map((r: any) => [
          r.revenueTypeCode,
          r.revenueTypeName,
          r.category,
          r.glCode,
          r.lineCount,
          (r.amountMinor / 100).toFixed(2),
          r.sharePct,
        ]),
      ];
      break;
    case 'treasury-settlement':
      body = [
        ['Invoice', 'Payer', 'Batch', 'Status', 'TSA account', 'Amount'],
        ...(data.rows ?? []).map((r: any) => [
          r.invoiceNumber,
          r.payerName,
          r.batchNumber,
          r.status,
          r.tsaAccount ?? '',
          (r.amountMinor / 100).toFixed(2),
        ]),
      ];
      break;
    case 'refunds':
      body = [
        ['Created', 'Status', 'Invoice', 'Payer', 'Code', 'Reason', 'Amount'],
        ...(data.rows ?? []).map((r: any) => [
          r.createdAt ?? '',
          r.status,
          r.invoiceNumber,
          r.payerName,
          r.paymentCode,
          r.reason,
          (r.amountMinor / 100).toFixed(2),
        ]),
      ];
      break;
    case 'payment-channels':
      body = [
        ['Dimension', 'Key', 'Count', 'Amount', 'Share %'],
        ...(data.byProvider ?? []).map((r: any) => [
          'Provider',
          r.provider,
          r.count,
          (r.amountMinor / 100).toFixed(2),
          r.sharePct,
        ]),
        ...(data.byMethod ?? []).map((r: any) => [
          'Method',
          r.method,
          r.count,
          (r.amountMinor / 100).toFixed(2),
          r.sharePct,
        ]),
      ];
      break;
    case 'officer-productivity':
      body = [
        ['Officer', 'Assessments', 'Approved', 'Pending', 'Rejected', 'Invoiced', 'Value'],
        ...(data.officers ?? []).map((r: any) => [
          r.name,
          r.assessments,
          r.approved,
          r.pending,
          r.rejected,
          r.invoiced,
          (r.amountMinor / 100).toFixed(2),
        ]),
      ];
      break;
    case 'branch-comparative':
      body = [
        ['Code', 'Branch', 'State', 'Collected', 'Outstanding', 'Assessments', 'Share %'],
        ...(data.rows ?? []).map((r: any) => [
          r.code,
          r.name,
          r.state ?? '',
          (r.collectedMinor / 100).toFixed(2),
          (r.outstandingMinor / 100).toFixed(2),
          r.assessments,
          r.collectionSharePct,
        ]),
      ];
      break;
    default:
      body = [
        ['Paid at', 'Payment code', 'Invoice', 'Payer', 'Provider', 'Amount'],
        ...(data.recentCollections ?? []).map((r: any) => [
          r.paidAt ?? '',
          r.paymentCode,
          r.invoiceNumber,
          r.payerName,
          r.provider ?? '',
          (r.amountMinor / 100).toFixed(2),
        ]),
      ];
  }

  return [...preamble, ...body];
}

export default function ReportsPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [period, setPeriod] = useState('monthly');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [catalogQueryText, setCatalogQueryText] = useState('');

  const catalogQuery = useQuery({
    queryKey: ['reports-catalog'],
    queryFn: () => api<CatalogItem[]>('/reports/catalog'),
  });

  const catalog = catalogQuery.data?.length ? catalogQuery.data : FALLBACK_CATALOG;
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(catalog.map((c) => c.category)))],
    [catalog],
  );
  const filtered = catalog.filter((c) => {
    if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
    const q = catalogQueryText.trim().toLowerCase();
    if (!q) return true;
    return [c.code, c.title, c.subtitle, c.category, c.audience, ...(c.standards ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
  const selected = catalog.find((c) => c.id === selectedType) ?? null;

  const packQuery = useQuery({
    queryKey: ['reports-pack', selectedType, period],
    queryFn: () => api<any>(`/reports/pack?type=${selectedType}&period=${period}`),
    enabled: Boolean(selectedType),
  });

  function exportCsv() {
    if (!packQuery.data || !selectedType) return;
    const rows = rowsForCsv(selectedType, packQuery.data);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const meta = packQuery.data.meta as ReportMeta | undefined;
    a.download = `${meta ? buildDocId(meta) : `ncs-${selectedType}-${period}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Revenue reports"
          description="Official collection, receivables, cash book, GL, and treasury packs for management and audit"
          actions={
            selectedType ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedType(null)}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Catalog
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => packQuery.refetch()}
                  disabled={packQuery.isFetching}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', packQuery.isFetching && 'animate-spin')} />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={!packQuery.data}>
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
                <Button size="sm" onClick={() => window.print()} disabled={!packQuery.data}>
                  <Printer className="h-3.5 w-3.5" />
                  Print / PDF
                </Button>
              </div>
            ) : undefined
          }
        />

        <div className="mb-5 overflow-hidden rounded-lg border border-brass/25 bg-gradient-to-r from-navy/[0.04] via-card to-accent/[0.05] shadow-panel">
          <div className="h-0.5 w-full bg-gradient-to-r from-navy via-brass to-accent" />
          <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-white">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">
                  Official — for internal use
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Cash / IPSAS basis · Document-controlled packs · Printable A4 with sign-off blocks
                </p>
              </div>
            </div>
            <Badge variant="outline" className="w-fit shrink-0">
              {catalog.length} report packs
            </Badge>
          </div>
        </div>

        {selectedType ? (
          <div className="mb-4 overflow-hidden rounded-lg border border-border/90 bg-card/90 shadow-panel">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.14em] text-brass-deep">
                  {selected?.code} · {selected?.category}
                </p>
                <h2 className="font-serif text-xl text-navy dark:text-foreground">{selected?.title}</h2>
                <p className="mt-1 max-w-xl text-xs text-muted-foreground">{selected?.subtitle}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-border/80 bg-muted/40 p-1">
                {PERIODS.map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant={period === p.id ? 'default' : 'ghost'}
                    className={cn(
                      'h-8 px-3',
                      period !== p.id && 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setPeriod(p.id)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Select a pack to generate an interactive, printable report aligned to revenue practice — cash book,
            AR aging, GL revenue, TSA remittance, channel mix, and branch scorecards.
          </p>
        )}
      </div>

      {!selectedType && (
        <div className="print:hidden space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-card/80 p-3 shadow-panel sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={catalogQueryText}
                onChange={(e) => setCatalogQueryText(e.target.value)}
                placeholder="Search report packs, standards, audience…"
                className="h-10 border-border/80 bg-background/80 pl-9"
                aria-label="Search report catalog"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm transition',
                    categoryFilter === cat
                      ? 'bg-navy text-white shadow-sm'
                      : 'border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground tabular-nums sm:ml-auto">
              {filtered.length} of {catalog.length}
            </p>
          </div>

          {catalogQuery.isLoading ? <LoadingState label="Loading report catalog…" /> : null}

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No report packs match your search.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedType(item.id)}
                  className={cn(
                    'group overflow-hidden rounded-xl border border-border/90 bg-card text-left shadow-panel transition duration-300 hover:border-accent/40 hover:shadow-lift animate-fade-up',
                    idx % 3 === 0 && 'stagger-1',
                    idx % 3 === 1 && 'stagger-2',
                    idx % 3 === 2 && 'stagger-3',
                  )}
                >
                  <div className="h-0.5 w-full bg-gradient-to-r from-navy via-brass to-accent" />
                  <div className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white seal-ring">
                        <FileBarChart2 className="h-4 w-4" />
                      </div>
                      <Badge variant="outline">{item.code}</Badge>
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-brass-deep">{item.category}</p>
                    <h3 className="mt-1 font-serif text-lg text-navy transition-colors group-hover:text-accent dark:text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.subtitle}</p>
                    <p className="mt-3 text-[11px] text-muted-foreground">{item.audience}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                      {item.standards.join(' · ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedType && packQuery.isLoading && (
        <div className="print:hidden">
          <LoadingState label={`Compiling ${selected?.title ?? 'report'}…`} />
        </div>
      )}

      {selectedType && packQuery.error && (
        <div className="print:hidden">
          <ErrorState
            message={
              packQuery.error instanceof Error ? packQuery.error.message : 'Failed to load report pack'
            }
            onRetry={() => packQuery.refetch()}
          />
        </div>
      )}

      {selectedType && packQuery.data ? renderReportView(selectedType, packQuery.data) : null}
    </div>
  );
}
