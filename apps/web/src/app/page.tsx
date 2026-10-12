'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { ensureAutoLogin, isAutoLoginEnabled } from '@/lib/auto-login';
import { completeHrSso, hasHrSsoQuery, stripHrSsoQueryFromUrl } from '@/lib/hr-sso';

export default function HomePage() {
  const router = useRouter();
  const [message, setMessage] = useState('Redirecting…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const sso = hasHrSsoQuery();
      try {
        if (sso) {
          setMessage('Signing in with HR credentials…');
          await completeHrSso();
          if (!cancelled) router.replace('/dashboard');
          return;
        }

        if (isAuthenticated()) {
          router.replace('/dashboard');
          return;
        }

        if (isAutoLoginEnabled()) {
          setMessage('Signing in as super admin…');
          await ensureAutoLogin();
          if (!cancelled) router.replace('/dashboard');
          return;
        }

        router.replace('/login');
      } catch {
        if (!cancelled) {
          if (sso) stripHrSsoQueryFromUrl();
          setMessage(sso ? 'HR sign-in failed — opening login…' : 'Auto-login failed — opening sign-in…');
          router.replace('/login');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
      <div className="h-8 w-8 rounded-full border-2 border-brass/40 border-t-accent animate-spin" />
      <p>{message}</p>
    </div>
  );
}
