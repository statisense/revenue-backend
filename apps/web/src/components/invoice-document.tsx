'use client';

import Link from 'next/link';
import { Ban, Pencil } from 'lucide-react';
import { BRAND, displayAgencyName } from '@/lib/brand';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  FiscalDocFooter,
  FiscalDocSheet,
  FiscalDocToolbar,
  FiscalLifecycle,
  FiscalLinesTable,
  FiscalMasthead,
  FiscalParty,
  FiscalTotals,
  money,
  type LifecycleStep,
} from '@/components/fiscal-document';

export type InvoiceDocumentData = {
  id: string;
  invoiceNumber: string;
  payerName: string;
  payerEmail?: string | null;
  payerPhone?: string | null;
  payerTin?: string | null;
  status: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor?: number;
  dueAt?: string | null;
  issuedAt?: string | null;
  createdAt: string;
  notes?: string | null;
  agency?: { code?: string; name?: string; email?: string | null; phone?: string | null } | null;
  lines: {
    id?: string;
    description: string;
    quantity: number | string;
    unitAmountMinor: number;
    taxRatePercent?: number | string;
    taxMinor?: number;
    lineTotalMinor: number;
    revenueType?: { code: string; name: string } | null;
    taxType?: { code: string; name: string; ratePercent?: number | string } | null;
  }[];
  paymentRequests?: {
    id: string;
    paymentCode: string;
    status: string;
    payUrl?: string | null;
    amountMinor: number;
    createdAt?: string;
    payments?: {
      id: string;
      status: string;
      paidAt?: string | null;
      providerRef?: string | null;
      receipt?: { id: string; receiptNumber: string; issuedAt?: string | null } | null;
    }[];
  }[];
  receipts?: {
    id: string;
    receiptNumber: string;
    amountMinor?: number;
    issuedAt?: string | null;
  }[];
};

function pickPaymentRequest(inv: InvoiceDocumentData) {
  const list = inv.paymentRequests ?? [];
  return (
    list.find((p) => p.status === 'PAID') ??
    list.find((p) => (p.payments ?? []).some((pay) => pay.status === 'PAID')) ??
    list.find((p) => (p.payments?.length ?? 0) > 0) ??
    list[0]
  );
}

function buildLifecycle(inv: InvoiceDocumentData): LifecycleStep[] {
  const pr = pickPaymentRequest(inv);
  const payment = pr?.payments?.find((p) => p.status === 'PAID') ?? pr?.payments?.[0];
  const receipt =
    inv.receipts?.[0] ??
    payment?.receipt ??
    pr?.payments?.map((p) => p.receipt).find(Boolean) ??
    null;

  const issued = Boolean(inv.issuedAt || inv.createdAt);
  const hasRequest = Boolean(pr);
  const paid =
    inv.status === 'PAID' ||
    inv.status === 'PARTIALLY_PAID' ||
    payment?.status === 'PAID' ||
    (inv.amountPaidMinor ?? 0) > 0;
  const hasReceipt = Boolean(receipt?.receiptNumber);

  return [
    {
      key: 'issued',
      label: 'Invoice issued',
      detail: issued ? formatDate(inv.issuedAt ?? inv.createdAt) : undefined,
      state: issued ? 'done' : 'todo',
    },
    {
      key: 'payment',
      label: 'Payment requested',
      detail: pr
        ? `${pr.paymentCode} · ${pr.status}${pr.payUrl ? ' · link ready' : ''}`
        : undefined,
      href: pr?.payUrl || undefined,
      state: hasRequest ? (paid ? 'done' : 'current') : issued ? 'current' : 'todo',
    },
    {
      key: 'paid',
      label: 'Payment confirmed',
      detail: paid
        ? `${money(inv.amountPaidMinor ?? inv.totalMinor)} collected${
            payment?.paidAt ? ` · ${formatDate(payment.paidAt)}` : ''
          }`
        : undefined,
      state: paid ? 'done' : hasRequest ? 'current' : 'todo',
    },
    {
      key: 'receipt',
      label: 'Receipt issued',
      detail: hasReceipt ? receipt!.receiptNumber : undefined,
      href: hasReceipt ? `/receipts/${encodeURIComponent(receipt!.receiptNumber)}` : undefined,
      state: hasReceipt ? 'done' : paid ? 'current' : 'todo',
    },
  ];
}

export function InvoiceDocument({
  invoice,
  onClose,
  onEdit,
  onCancel,
  canMutate,
}: {
  invoice: InvoiceDocumentData;
  onClose?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  canMutate?: boolean;
}) {
  const lifecycle = buildLifecycle(invoice);
  const pr = pickPaymentRequest(invoice);
  const receipt =
    invoice.receipts?.[0] ??
    pr?.payments?.find((p) => p.receipt?.receiptNumber)?.receipt ??
    null;
  const balance = Math.max(0, invoice.totalMinor - (invoice.amountPaidMinor ?? 0));
  const agencyName = displayAgencyName(invoice.agency?.name, BRAND.name);

  return (
    <div className="space-y-4 animate-fade-up">
      <FiscalDocToolbar
        title={`Invoice ${invoice.invoiceNumber}`}
        onClose={onClose}
        extra={
          <>
            {receipt ? (
              <Link
                href={`/receipts/${encodeURIComponent(receipt.receiptNumber)}`}
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium transition hover:bg-muted"
              >
                View receipt
              </Link>
            ) : null}
            {pr?.payUrl ? (
              <a
                href={pr.payUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium transition hover:bg-muted"
              >
                Open pay page
              </a>
            ) : null}
            {canMutate && onEdit ? (
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            ) : null}
            {canMutate && onCancel ? (
              <Button size="sm" variant="destructive" onClick={onCancel} className="gap-1.5">
                <Ban className="h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : null}
          </>
        }
      />

      <FiscalLifecycle steps={lifecycle} />

      <FiscalDocSheet docType="INVOICE">
        <FiscalMasthead
          agencyName={agencyName}
          agencyCode={invoice.agency?.code}
          docLabel="Invoice"
          docNumber={invoice.invoiceNumber}
          status={invoice.status}
          meta={[
            { label: 'Issued', value: formatDate(invoice.issuedAt ?? invoice.createdAt) },
            { label: 'Due', value: formatDate(invoice.dueAt) },
            { label: 'Currency', value: 'NGN' },
          ]}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FiscalParty
            title="Bill to"
            name={invoice.payerName}
            lines={[
              invoice.payerTin ? `TIN: ${invoice.payerTin}` : null,
              invoice.payerEmail,
              invoice.payerPhone,
            ]}
          />
          <FiscalParty
            title="Issued by"
            name={agencyName}
            lines={[invoice.agency?.email, invoice.agency?.phone, invoice.agency?.code]}
          />
        </div>

        <FiscalLinesTable
          rows={invoice.lines.map((line) => ({
            description: line.description,
            meta: [
              line.revenueType ? `${line.revenueType.code} — ${line.revenueType.name}` : null,
              line.taxType
                ? `Tax ${line.taxType.code} (${Number(line.taxRatePercent ?? line.taxType.ratePercent ?? 0)}%)`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
            qty: Number(line.quantity),
            unit: money(line.unitAmountMinor),
            total: money(line.lineTotalMinor),
          }))}
        />

        <FiscalTotals
          rows={[
            { label: 'Subtotal', value: money(invoice.subtotalMinor) },
            { label: 'Tax', value: money(invoice.taxMinor) },
            { label: 'Amount paid', value: money(invoice.amountPaidMinor ?? 0) },
            { label: 'Balance due', value: money(balance) },
          ]}
          grandLabel="Invoice total"
          grandValue={money(invoice.totalMinor)}
        />

        {pr ? (
          <section className="rounded-lg border border-dashed border-border/90 bg-muted/20 px-4 py-3 text-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-brass-deep">
              Payment instructions
            </p>
            <p className="mt-1.5 text-muted-foreground">
              Pay with code <span className="font-mono font-medium text-foreground">{pr.paymentCode}</span>
              {pr.payUrl ? (
                <>
                  {' '}
                  or open the{' '}
                  <a className="text-accent underline" href={pr.payUrl} target="_blank" rel="noreferrer">
                    public pay page
                  </a>
                  .
                </>
              ) : (
                '.'
              )}{' '}
              A signed digital receipt is issued automatically when payment is confirmed.
            </p>
          </section>
        ) : null}

        {invoice.notes ? (
          <section>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm text-foreground/80">{invoice.notes}</p>
          </section>
        ) : null}

        <FiscalDocFooter />
      </FiscalDocSheet>
    </div>
  );
}
