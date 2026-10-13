'use client';

import Link from 'next/link';
import { Check, Circle, Download, Printer, X } from 'lucide-react';
import { BRAND, displayAgencyCode, displayAgencyName } from '@/lib/brand';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type LifecycleStep = {
  key: string;
  label: string;
  detail?: string;
  href?: string;
  state: 'done' | 'current' | 'todo';
};

export function FiscalDocToolbar({
  title,
  onClose,
  extra,
}: {
  title: string;
  onClose?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="print:hidden mb-4 flex flex-col gap-3 rounded-lg border border-border/80 bg-card/90 p-3 shadow-panel sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">
          Official document
        </p>
        <p className="font-serif text-lg text-navy dark:text-foreground">{title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <Button
          type="button"
          size="sm"
          onClick={() => window.print()}
          className="gap-1.5"
          title="Opens the print dialog — choose Save as PDF to download"
        >
          <Printer className="h-3.5 w-3.5" />
          Print / PDF
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          className="gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Save PDF
        </Button>
        {onClose ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            Close
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function FiscalLifecycle({ steps }: { steps: LifecycleStep[] }) {
  return (
    <section className="print:hidden rounded-lg border border-border/80 bg-gradient-to-r from-navy/[0.03] via-card to-accent/[0.04] p-4">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">
        Collection journey
      </p>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, idx) => (
          <li
            key={step.key}
            className={cn(
              'relative rounded-md border px-3 py-3',
              step.state === 'done' && 'border-accent/30 bg-accent/5',
              step.state === 'current' && 'border-brass/40 bg-brass/5',
              step.state === 'todo' && 'border-border/80 bg-muted/20 opacity-80',
            )}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium',
                  step.state === 'done' && 'bg-accent text-white',
                  step.state === 'current' && 'bg-brass text-navy',
                  step.state === 'todo' && 'bg-muted text-muted-foreground',
                )}
              >
                {step.state === 'done' ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className="text-sm font-medium text-navy dark:text-foreground">{step.label}</span>
            </div>
            {step.detail ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
            ) : (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Circle className="h-2.5 w-2.5" /> Awaiting
              </p>
            )}
            {step.href ? (
              <Link href={step.href} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">
                Open →
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FiscalDocSheet({
  children,
  docType,
}: {
  children: React.ReactNode;
  docType: 'INVOICE' | 'RECEIPT';
}) {
  return (
    <article
      className={cn(
        'fiscal-print-root report-print-root overflow-hidden rounded-xl border border-border/90 bg-card text-card-foreground shadow-lift print:rounded-none print:border-0 print:shadow-none',
      )}
    >
      <div className="flex items-center justify-between gap-3 bg-navy px-4 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/80 sm:px-6">
        <span>{BRAND.name}</span>
        <span className="text-brass-soft">{docType}</span>
      </div>
      <div className="h-1 w-full bg-gradient-to-r from-navy via-brass to-accent" />
      <div className="space-y-6 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">{children}</div>
    </article>
  );
}

export function FiscalMasthead({
  agencyName,
  agencyCode,
  docLabel,
  docNumber,
  status,
  meta,
}: {
  agencyName?: string | null;
  agencyCode?: string | null;
  docLabel: string;
  docNumber: string;
  status?: string;
  meta?: { label: string; value: string }[];
}) {
  const name = displayAgencyName(agencyName);
  const code = displayAgencyCode(agencyCode);

  return (
    <header className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-brass-deep">
          {code} · Official {docLabel.toLowerCase()}
        </p>
        <h1 className="mt-1 font-serif text-2xl leading-tight text-navy dark:text-foreground sm:text-3xl">
          {name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{BRAND.tagline}</p>
      </div>
      <div className="w-full shrink-0 rounded-lg border border-border/90 bg-muted/30 px-4 py-3 sm:w-64">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {docLabel} no.
        </p>
        <p className="mt-1 break-all font-mono text-sm font-semibold text-navy dark:text-foreground">
          {docNumber}
        </p>
        {status ? (
          <Badge className="mt-2" variant="outline">
            {status}
          </Badge>
        ) : null}
        {meta?.length ? (
          <dl className="mt-3 space-y-1.5 text-xs">
            {meta.map((m) => (
              <div key={m.label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{m.label}</dt>
                <dd className="text-right font-medium">{m.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </header>
  );
}

export function FiscalParty({
  title,
  name,
  lines,
}: {
  title: string;
  name: string;
  lines?: (string | null | undefined)[];
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="mt-1 font-serif text-lg text-navy dark:text-foreground">{name}</p>
      {(lines ?? []).filter(Boolean).map((line) => (
        <p key={line!} className="text-sm text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

export function FiscalLinesTable({
  rows,
  empty = 'No line items',
}: {
  rows: {
    description: string;
    meta?: string;
    qty: string | number;
    unit?: string;
    total: string;
  }[];
  empty?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/90">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-gradient-to-r from-muted/80 via-muted/50 to-muted/30">
          <tr>
            <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:px-4">
              Description
            </th>
            <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              Qty
            </th>
            <th className="hidden px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:table-cell">
              Unit
            </th>
            <th className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:px-4">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={`${row.description}-${i}`} className="border-b border-border/70 last:border-0">
                <td className="max-w-[18rem] px-3 py-3 align-top sm:px-4">
                  <p className="font-medium text-navy dark:text-foreground">{row.description}</p>
                  {row.meta ? <p className="mt-0.5 text-xs text-muted-foreground">{row.meta}</p> : null}
                </td>
                <td className="px-3 py-3 align-top tabular-nums">{row.qty}</td>
                <td className="hidden px-3 py-3 text-right align-top tabular-nums sm:table-cell">
                  {row.unit ?? '—'}
                </td>
                <td className="px-3 py-3 text-right align-top font-medium tabular-nums sm:px-4">
                  {row.total}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function FiscalTotals({
  rows,
  grandLabel,
  grandValue,
}: {
  rows: { label: string; value: string }[];
  grandLabel: string;
  grandValue: string;
}) {
  return (
    <div className="ml-auto w-full max-w-sm space-y-2 rounded-lg border border-border/90 bg-muted/20 px-4 py-3">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-4 text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="tabular-nums">{r.value}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-border pt-2">
        <span className="font-medium text-navy dark:text-foreground">{grandLabel}</span>
        <span className="font-serif text-xl tabular-nums text-navy dark:text-foreground">{grandValue}</span>
      </div>
    </div>
  );
}

export function FiscalDocFooter({ note }: { note?: string }) {
  return (
    <footer className="border-t border-border pt-5 text-xs text-muted-foreground">
      <p className="leading-relaxed">
        {note ||
          `This document is issued by ${BRAND.name}. Figures are denominated in Nigerian Naira (NGN) unless stated otherwise. Retain for your records and present upon request.`}
      </p>
      <p className="mt-3 text-center text-[10px] uppercase tracking-[0.16em] text-foreground/60">
        Official — for payer & agency records · Generated {formatDate(new Date().toISOString())}
      </p>
    </footer>
  );
}

export function money(amountMinor: number, currency = 'NGN') {
  return formatMoney(amountMinor, currency);
}
