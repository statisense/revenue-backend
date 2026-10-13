'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, ArrowRight, ShieldCheck } from 'lucide-react';

const SAMPLE_CODES = [
  { code: 'NCS202607000001', label: 'Pending · Licence / permit fee' },
  { code: 'NCS202607000002', label: 'Paid · Service charge settlement' },
  { code: 'NCS202607000003', label: 'Expired · Administrative fee demo' },
  { code: 'NCS202607000004', label: 'Pending · Remita VA demo' },
  { code: 'NCS202607000005', label: 'Paid · Alternate receipt demo' },
] as const;

export default function PayLandingPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function go(trimmed: string) {
    if (!trimmed) {
      setError('Enter a payment code to continue');
      return;
    }
    setError(null);
    router.push(`/pay/${encodeURIComponent(trimmed)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(code.trim().toUpperCase());
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-3 py-8 sm:px-4 sm:py-12">
      <div className="grid w-full items-center gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="animate-fade-up hidden text-[color:var(--ink)] lg:block">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-navy text-white seal-ring">
            <Landmark className="h-7 w-7" />
          </div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-brass-deep">Public payment portal</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-navy">
            Nigeria Government Revenue Pay
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[color:var(--pay-muted)]">
            Settle agency invoices with bank transfer to a dedicated virtual account, QR, or your
            preferred gateway — receipts are issued instantly on confirmation.
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs text-[color:var(--pay-muted)]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent" />
            HMAC-secured codes · Virtual accounts · Signed digital receipts
          </div>
        </div>

        <div className="animate-scale-in w-full overflow-hidden rounded-2xl border border-[color:var(--pay-border)] bg-white shadow-lift">
          <div className="bg-gradient-to-br from-navy via-navy to-navy-700 px-4 py-6 text-white sm:px-6 sm:py-8">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-accent seal-ring lg:hidden">
              <Landmark className="h-5 w-5" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-brass-soft">NGRS collections</p>
            <h2 className="mt-2 font-serif text-2xl sm:text-3xl">Pay with code</h2>
            <p className="mt-2 text-sm text-white/75">
              Enter the payment code from your invoice SMS, email, or assessment notice.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
            <div className="space-y-1.5">
              <label htmlFor="code" className="text-sm font-medium text-navy">
                Payment code
              </label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. NCS202607000001"
                className="h-11 w-full rounded-md border border-[color:var(--pay-border)] bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
                autoComplete="off"
                inputMode="text"
              />
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-white transition duration-300 ease-agency hover:bg-accent-600 active:scale-[0.98]"
            >
              Continue to payment
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
          </form>

          <div className="border-t border-[color:var(--pay-border)] px-4 py-5 sm:px-6">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--pay-muted)]">
              Seeded demo codes
            </p>
            <div className="space-y-2">
              {SAMPLE_CODES.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setCode(item.code);
                    go(item.code);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-[color:var(--pay-border)] bg-[color:var(--surface)] px-3 py-2.5 text-left transition hover:border-accent/40 hover:bg-accent/5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-medium text-navy">{item.code}</p>
                    <p className="truncate text-[11px] text-[color:var(--pay-muted)]">{item.label}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-accent" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
