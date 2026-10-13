'use client';

import { FileBarChart2, Landmark, ShieldCheck } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type ReportMeta = {
  type?: string;
  code?: string;
  title: string;
  subtitle: string;
  category?: string;
  audience?: string;
  standards?: string[];
  agency: { code: string; name: string; shortName?: string | null };
  period: string;
  start: string;
  end: string;
  generatedAt: string;
  currency: string;
  classification: string;
};

export const PERIODS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annual', label: 'Annual' },
] as const;

export const CHART_COLORS = ['#0C6B45', '#081A30', '#B89A4F', '#3D6A9A', '#8A7033', '#4FB885', '#6F93BD'];

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(1));
}

export function buildDocId(meta: ReportMeta) {
  const stamp = new Date(meta.generatedAt).toISOString().slice(0, 10).replace(/-/g, '');
  const period = String(meta.period).toUpperCase().slice(0, 3);
  return `${meta.code ?? 'RPT'}-${meta.agency.code}-${period}-${stamp}`;
}

export function shareBar(value: number, max: number) {
  const width = max <= 0 ? 0 : Math.max(4, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-1.5 rounded-full bg-gradient-to-r from-accent to-accent-600"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}) {
  const toneBar =
    tone === 'good'
      ? 'from-accent via-accent to-accent-600'
      : tone === 'warn'
        ? 'from-brass via-brass-soft to-brass'
        : tone === 'danger'
          ? 'from-red-700 via-red-600 to-red-500'
          : 'from-navy/70 via-brass to-accent/70';

  return (
    <div className="overflow-hidden rounded-lg border border-border/90 bg-card shadow-panel">
      <div className={cn('h-0.5 w-full bg-gradient-to-r', toneBar)} />
      <div className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-1.5 break-words font-serif text-2xl tracking-tight text-navy dark:text-foreground tabular-nums">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4">
      {eyebrow ? (
        <div className="mb-1.5 flex items-center gap-2">
          <div className="h-0.5 w-6 rounded-full bg-gradient-to-r from-brass to-accent" />
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">{eyebrow}</p>
        </div>
      ) : null}
      <h2 className="font-serif text-xl text-navy dark:text-foreground">{title}</h2>
      {description ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function ReportSheet({ children }: { children: React.ReactNode }) {
  return (
    <article className="report-print-root report-sheet space-y-8 overflow-hidden rounded-xl border border-border/90 bg-card shadow-panel print:rounded-none print:border-0 print:shadow-none">
      <div className="h-1 w-full bg-gradient-to-r from-navy via-brass to-accent print:h-0.5" />
      <div className="space-y-8 px-4 pb-6 pt-2 sm:px-6 sm:pb-8 lg:px-8">{children}</div>
    </article>
  );
}

export function ReportMasthead({
  meta,
  summary,
}: {
  meta: ReportMeta;
  summary?: React.ReactNode;
}) {
  const docId = buildDocId(meta);

  return (
    <header className="space-y-5 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brass/25 bg-gradient-to-r from-navy/[0.04] via-muted/40 to-accent/[0.05] px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-navy dark:text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="font-medium">{meta.classification}</span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Doc · {docId}</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-navy text-white seal-ring">
              <Landmark className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-brass-deep">
                {meta.agency.code} · Official revenue report
              </p>
              <p className="font-serif text-lg leading-snug text-navy dark:text-foreground sm:text-xl">
                {meta.agency.name}
              </p>
              {meta.agency.shortName ? (
                <p className="text-xs text-muted-foreground">{meta.agency.shortName}</p>
              ) : null}
            </div>
          </div>

          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {meta.code ?? 'RPT'} · {meta.category ?? 'Revenue Intelligence'}
          </p>
          <h1 className="mt-1 font-serif text-2xl text-navy dark:text-foreground sm:text-3xl">{meta.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{meta.subtitle}</p>
          {meta.audience ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Intended audience: <span className="text-foreground/80">{meta.audience}</span>
            </p>
          ) : null}
          {summary ? (
            <div className="mt-4 rounded-lg border border-border/80 bg-muted/30 px-3.5 py-3 text-sm leading-relaxed text-foreground/85">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-brass-deep">
                Executive abstract
              </p>
              {summary}
            </div>
          ) : null}
        </div>

        <aside className="w-full max-w-xs shrink-0 overflow-hidden rounded-lg border border-border/90 bg-card shadow-panel sm:w-72">
          <div className="border-b border-border bg-navy px-4 py-2.5 text-white">
            <div className="flex items-center gap-2">
              <FileBarChart2 className="h-3.5 w-3.5 text-brass-soft" />
              <p className="text-[11px] font-medium uppercase tracking-[0.14em]">Document control</p>
            </div>
          </div>
          <dl className="space-y-2.5 px-4 py-3.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Period</dt>
              <dd className="font-medium capitalize">{meta.period}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">Coverage</dt>
              <dd className="text-right text-xs leading-relaxed">
                {formatDate(meta.start)}
                <br />
                to {formatDate(meta.end)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Generated</dt>
              <dd className="text-right text-xs">{formatDate(meta.generatedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Currency</dt>
              <dd className="font-medium tabular-nums">{meta.currency}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Basis</dt>
              <dd className="text-right text-xs font-medium">Cash / IPSAS</dd>
            </div>
            <Badge className="w-full justify-center" variant="outline">
              {meta.classification}
            </Badge>
          </dl>
        </aside>
      </div>

      {meta.standards?.length ? (
        <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          Reporting alignment: {meta.standards.join(' · ')}
        </p>
      ) : null}
    </header>
  );
}

export function ReportFooter({ meta }: { meta: ReportMeta }) {
  const docId = buildDocId(meta);

  return (
    <footer className="space-y-5 border-t border-border pt-6 text-xs text-muted-foreground">
      <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-3 leading-relaxed">
        <p className="font-medium text-foreground">Basis of preparation & limitations</p>
        <p className="mt-1.5">
          This pack is prepared on a cash-collection basis for confirmed payments and ledger-linked invoices at
          generation time. Outstanding, pending, and in-flight settlements are point-in-time and may change after
          print or CSV export. Figures are denominated in {meta.currency} unless otherwise stated. Use for internal
          management, treasury remittance control, and audit support — not as a substitute for audited financial
          statements.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {[
          { title: 'Prepared by', line: `System-generated · ${meta.agency.code}`, note: 'Revenue Collection Console' },
          { title: 'Reviewed by', line: '', note: 'Treasury / Finance sign-off' },
          { title: 'Approved by', line: '', note: 'Head of Revenue / Command' },
        ].map((block) => (
          <div key={block.title}>
            <p className="font-medium text-foreground">{block.title}</p>
            <p className="mt-8 min-h-[1.25rem] border-b border-foreground/25 pb-1 text-foreground/80">
              {block.line || '\u00a0'}
            </p>
            <p className="mt-1.5">{block.note}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider">Date / signature</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 border-t border-dashed border-border pt-4 text-center">
        <p className="tracking-[0.16em] text-foreground/70">{meta.classification}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider">
          {docId} · {meta.agency.name}
        </p>
        <p className="report-print-page text-[10px] text-muted-foreground print:block">
          End of report — retain with treasury working papers
        </p>
      </div>
    </footer>
  );
}

export function DataTable({
  headers,
  children,
  empty,
  colSpan,
  caption,
  footer,
}: {
  headers: { label: string; align?: 'left' | 'right' }[];
  children: React.ReactNode;
  empty?: boolean;
  colSpan: number;
  caption?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/90 bg-card shadow-panel print:shadow-none">
      <div className="h-0.5 w-full bg-gradient-to-r from-navy via-brass to-accent" />
      {caption ? (
        <p className="border-b border-border/70 bg-gradient-to-r from-navy/[0.03] via-muted/40 to-accent/[0.04] px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:px-4">
          {caption}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h.label}
                  className={cn(
                    'whitespace-nowrap border-b border-border/90 bg-[#F3F6FA] px-3.5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:bg-navy-800 sm:px-4',
                    h.align === 'right' && 'text-right',
                  )}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr]:border-b [&_tr]:border-border/60 [&_tr]:transition-colors [&_tr]:last:border-0 [&_tr:nth-child(odd)]:bg-[#FBFCFD] [&_tr:hover]:bg-[#F3F8F5] dark:[&_tr:nth-child(odd)]:bg-white/[0.02] dark:[&_tr:hover]:bg-accent/[0.08] [&_td]:px-3.5 [&_td]:py-3 [&_td]:align-middle sm:[&_td]:px-4">
            {empty ? (
              <tr>
                <td colSpan={colSpan} className="!px-4 !py-12 text-center text-muted-foreground">
                  No rows for this reporting period.
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
          {footer && !empty ? (
            <tfoot className="border-t border-border bg-muted/35 font-medium [&_td]:px-3.5 [&_td]:py-3.5 sm:[&_td]:px-4">
              {footer}
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
