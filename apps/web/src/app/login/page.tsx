'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Landmark, Loader2, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { isAuthenticated, setSession, type AuthUser } from '@/lib/auth';
import { ensureAutoLogin, isAutoLoginEnabled } from '@/lib/auto-login';
import { completeHrSso, hasHrSsoQuery, stripHrSsoQueryFromUrl } from '@/lib/hr-sso';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  totpCode: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type LoginResponse =
  | { requires2fa: true }
  | {
      requires2fa: false;
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    };

const DEMO_ACCOUNTS = [
  { email: 'admin@ncs.gov.ng', role: 'Super Admin', note: 'Full platform access' },
  { email: 'officer.apapa@ncs.gov.ng', role: 'Assessment Officer', note: 'HQ / field office' },
  { email: 'approver@ncs.gov.ng', role: 'Approver', note: 'Assessment approvals' },
] as const;

const DEMO_PASSWORD = 'ChangeMe@12345';

export default function LoginPage() {
  const router = useRouter();
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(isAutoLoginEnabled());

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@ncs.gov.ng', password: DEMO_PASSWORD, totpCode: '' },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sso = hasHrSsoQuery();
      try {
        if (sso) {
          setAutoBusy(true);
          await completeHrSso();
          if (!cancelled) router.replace('/dashboard');
          return;
        }
        if (isAuthenticated()) {
          router.replace('/dashboard');
          return;
        }
        if (!isAutoLoginEnabled()) {
          setAutoBusy(false);
          return;
        }
        await ensureAutoLogin();
        if (!cancelled) router.replace('/dashboard');
      } catch (err) {
        if (!cancelled) {
          if (sso) stripHrSsoQueryFromUrl();
          setAutoBusy(false);
          setError(err instanceof Error ? err.message : 'Sign-in failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const data = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email: values.email,
          password: values.password,
          ...(needs2fa && values.totpCode ? { totpCode: values.totpCode } : {}),
        },
      });

      if (data.requires2fa) {
        setNeeds2fa(true);
        return;
      }

      setSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in');
    }
  }

  function fillDemo(email: string) {
    setValue('email', email);
    setValue('password', DEMO_PASSWORD);
    setError(null);
  }

  if (autoBusy) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-navy px-4 text-sm text-white/75">
        <div className="h-9 w-9 rounded-full border-2 border-brass/50 border-t-accent animate-spin" />
        <p>Signing in as super admin…</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-3 py-8 sm:px-4 sm:py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 15% 10%, rgba(12,107,69,0.22), transparent 42%), radial-gradient(ellipse at 85% 5%, rgba(184,154,79,0.14), transparent 40%), linear-gradient(165deg, #04101f 0%, #081a30 48%, #0a241c 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 grid w-full max-w-4xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden animate-fade-up flex-col justify-center text-white lg:flex">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-accent seal-ring">
            <Landmark className="h-7 w-7" />
          </div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-brass-soft">
            Federal Republic of Nigeria
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight">
            Nigeria Government Revenue System
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
            Secure assessment, billing, payment, and treasury settlement for MDAs — built for
            institutional trust, dual control, and auditability.
          </p>
          <div className="mt-8 flex items-center gap-2 text-xs text-white/50">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent-300" />
            Encrypted sessions · Role-based access · Append-only audit
          </div>
        </div>

        <Card className="animate-scale-in w-full border-white/10 bg-white/96 shadow-lift backdrop-blur dark:bg-card/95">
          <CardHeader className="space-y-2 text-center lg:text-left">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-white lg:hidden">
              <Landmark className="h-5 w-5" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-brass-deep lg:hidden">
              Nigeria Government Revenue System
            </p>
            <CardTitle className="text-xl text-navy dark:text-foreground sm:text-2xl">
              Officer sign-in
            </CardTitle>
            <CardDescription>
              Access the national revenue collection workspace with your official credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="email">
                  Official email
                </label>
                <Input id="email" type="email" autoComplete="username" {...register('email')} />
                {errors.email && <p className="text-xs text-red-700">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                />
                {errors.password && <p className="text-xs text-red-700">{errors.password.message}</p>}
              </div>
              {needs2fa && (
                <div className="space-y-1.5 animate-fade-up">
                  <label className="text-sm font-medium" htmlFor="totpCode">
                    Authentication code
                  </label>
                  <Input
                    id="totpCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    {...register('totpCode')}
                  />
                </div>
              )}
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {needs2fa ? 'Verify & sign in' : 'Sign in securely'}
              </Button>
              <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-sm">
                <Link className="text-accent underline-offset-2 hover:underline" href="/forgot-password">
                  Forgot password?
                </Link>
                <Link className="text-navy/60 underline-offset-2 hover:underline" href="/pay">
                  Public pay portal
                </Link>
              </p>
            </form>

            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Seeded demo accounts
              </p>
              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((acct) => (
                  <button
                    key={acct.email}
                    type="button"
                    onClick={() => fillDemo(acct.email)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border/80 bg-muted/40 px-3 py-2 text-left transition hover:border-accent/40 hover:bg-accent/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{acct.email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {acct.role} · {acct.note}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-accent">Use</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Password for all seeded users: <code className="text-foreground">{DEMO_PASSWORD}</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
