'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { BRAND, displayAgencyName } from '@/lib/brand';
import { formatDate } from '@/lib/utils';
import {
  FiscalDocFooter,
  FiscalDocSheet,
  FiscalDocToolbar,
  FiscalLifecycle,
  FiscalMasthead,
  FiscalParty,
  money,
  type LifecycleStep,
} from '@/components/fiscal-document';

export type ReceiptDocumentData = {
  id: string;
  receiptNumber: string;
  amountMinor?: number;
  currency?: string;
  issuedAt?: string | null;
  createdAt?: string;
  digitalSignature?: string | null;
  qrVerification?: string | null;
  paymentReference?: string | null;
  invoiceNumber?: string | null;
  agencyName?: string | null;
  agency?: { name?: string; code?: string; email?: string | null; phone?: string | null } | null;
  invoice?: {
    id?: string;
    invoiceNumber?: string;
    payerName?: string;
    payerEmail?: string | null;
    payerPhone?: string | null;
    payerTin?: string | null;
  } | null;
  payment?: {
    amountMinor?: number;
    currency?: string;
    paidAt?: string | null;
    providerRef?: string | null;
    paymentRequest?: {
      paymentCode?: string;
      paymentReference?: string;
      invoiceId?: string;
    } | null;
  } | null;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-navy dark:text-foreground">{value}</p>
    </div>
  );
}

export function ReceiptDocument({
  receipt,
  onClose,
  showLifecycle = true,
  backHref,
}: {
  receipt: ReceiptDocumentData;
  onClose?: () => void;
  showLifecycle?: boolean;
  backHref?: string;
}) {
  const amountMinor = receipt.amountMinor ?? receipt.payment?.amountMinor ?? 0;
  const currency = receipt.currency ?? receipt.payment?.currency ?? 'NGN';
  const agencyName = displayAgencyName(receipt.agencyName || receipt.agency?.name);
  const invoiceNumber = receipt.invoiceNumber || receipt.invoice?.invoiceNumber;
  const payerName = receipt.invoice?.payerName || 'Payer';
  const paymentCode = receipt.payment?.paymentRequest?.paymentCode;
  const paymentRef =
    receipt.paymentReference ||
    receipt.payment?.paymentRequest?.paymentReference ||
    receipt.payment?.providerRef ||
    '—';

  const lifecycle: LifecycleStep[] = [
    {
      key: 'invoice',
      label: 'Invoice issued',
      detail: invoiceNumber || undefined,
      state: invoiceNumber ? 'done' : 'todo',
    },
    {
      key: 'payment',
      label: 'Payment confirmed',
      detail: paymentCode
        ? `${paymentCode}${receipt.payment?.paidAt ? ` · ${formatDate(receipt.payment.paidAt)}` : ''}`
        : formatDate(receipt.payment?.paidAt || receipt.issuedAt || receipt.createdAt),
      state: 'done',
    },
    {
      key: 'receipt',
      label: 'Receipt issued',
      detail: `${receipt.receiptNumber} · ${formatDate(receipt.issuedAt || receipt.createdAt)}`,
      state: 'done',
    },
    {
      key: 'verify',
      label: 'Verifiable proof',
      detail: receipt.qrVerification || receipt.digitalSignature ? 'Signed / QR ready' : 'Record retained',
      href: `/receipts/verify/${encodeURIComponent(receipt.receiptNumber)}`,
      state: 'done',
    },
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      <FiscalDocToolbar
        title={`Receipt ${receipt.receiptNumber}`}
        onClose={onClose}
        extra={
          <>
            {invoiceNumber ? (
              <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs text-muted-foreground">
                Invoice {invoiceNumber}
              </span>
            ) : null}
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium transition hover:bg-muted"
              >
                Back
              </Link>
            ) : null}
            <Link
              href={`/receipts/verify/${encodeURIComponent(receipt.receiptNumber)}`}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium transition hover:bg-muted"
            >
              Verify
            </Link>
          </>
        }
      />

      {showLifecycle ? <FiscalLifecycle steps={lifecycle} /> : null}

      <FiscalDocSheet docType="RECEIPT">
        <FiscalMasthead
          agencyName={agencyName}
          agencyCode={receipt.agency?.code}
          docLabel="Receipt"
          docNumber={receipt.receiptNumber}
          status="PAID"
          meta={[
            { label: 'Issued', value: formatDate(receipt.issuedAt || receipt.createdAt) },
            {
              label: 'Paid at',
              value: formatDate(receipt.payment?.paidAt || receipt.issuedAt || receipt.createdAt),
            },
            { label: 'Currency', value: currency },
          ]}
        />

        <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-accent/[0.06] via-card to-brass/[0.05] px-4 py-5 sm:px-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brass-deep">
            Amount received
          </p>
          <p className="mt-1 font-serif text-3xl tabular-nums text-navy dark:text-foreground sm:text-4xl">
            {money(amountMinor, currency)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmed collection for {BRAND.shortName} · legal proof of payment
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <FiscalParty
            title="Received from"
            name={payerName}
            lines={[
              receipt.invoice?.payerTin ? `TIN: ${receipt.invoice.payerTin}` : null,
              receipt.invoice?.payerEmail,
              receipt.invoice?.payerPhone,
            ]}
          />
          <FiscalParty
            title="Received by"
            name={agencyName}
            lines={[receipt.agency?.email, receipt.agency?.phone, receipt.agency?.code]}
          />
        </div>

        <div className="grid gap-4 rounded-lg border border-border/90 bg-muted/15 p-4 sm:grid-cols-2">
          <Field label="Invoice number" value={invoiceNumber || '—'} />
          <Field label="Payment code" value={paymentCode || '—'} />
          <Field label="Payment reference" value={paymentRef} />
          <Field label="Provider reference" value={receipt.payment?.providerRef || '—'} />
        </div>

        {receipt.qrVerification ? (
          <section className="rounded-lg border border-border/90 p-4 text-center">
            <div className="mb-2 flex items-center justify-center gap-2 text-sm font-medium text-navy dark:text-foreground">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Verification QR
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receipt.qrVerification}
              alt="Receipt verification QR"
              className="mx-auto h-32 w-32 sm:h-36 sm:w-36"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Scan or open the verification page to confirm authenticity.
            </p>
          </section>
        ) : null}

        {receipt.digitalSignature ? (
          <section className="rounded-lg border border-border/90 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Digital signature
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
              {receipt.digitalSignature}
            </p>
          </section>
        ) : null}

        <FiscalDocFooter note="This receipt is the official proof of payment. Present it with the related invoice for audit, clearance, or refund requests." />
      </FiscalDocSheet>
    </div>
  );
}
