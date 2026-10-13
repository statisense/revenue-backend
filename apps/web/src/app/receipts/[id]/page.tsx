'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { publicApi, ApiError } from '@/lib/public-api';
import { ReceiptDocument, type ReceiptDocumentData } from '@/components/receipt-document';

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = decodeURIComponent(params.id);

  const [receipt, setReceipt] = useState<ReceiptDocumentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await publicApi<ReceiptDocumentData>(`/receipts/${encodeURIComponent(id)}`);
        if (!cancelled) setReceipt(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load receipt');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading official receipt…
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="font-serif text-2xl">Receipt unavailable</h1>
          <p className="mt-2 text-sm">{error || 'Unknown error'}</p>
          <button className="mt-4 text-sm underline" onClick={() => router.push('/pay')}>
            Back to pay portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-3 py-6 sm:px-4 sm:py-10">
      <ReceiptDocument receipt={receipt} backHref="/pay" />
    </div>
  );
}
