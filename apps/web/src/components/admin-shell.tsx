'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Sun,
  Users,
  Wallet,
  BarChart3,
  Banknote,
  Landmark,
  CreditCard,
  Bell,
  KeyRound,
  RotateCcw,
  Receipt,
  Shield,
  Percent,
  X,
  ChevronDown,
  UserRound,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { getStoredUser, isAuthenticated } from '@/lib/auth';
import { logoutApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navGroups = [
  {
    label: 'Collections',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/revenue', label: 'Revenue Types', icon: Landmark },
      { href: '/taxes', label: 'Tax Types', icon: Percent },
      { href: '/assessments', label: 'Assessments', icon: ClipboardList },
      { href: '/invoices', label: 'Invoices', icon: FileText },
      { href: '/payments', label: 'Payments', icon: Wallet },
      { href: '/virtual-accounts', label: 'Virtual Accounts', icon: CreditCard },
    ],
  },
  {
    label: 'Treasury',
    items: [
      { href: '/settlements', label: 'Settlements', icon: Banknote },
      { href: '/refunds', label: 'Refunds', icon: RotateCcw },
      { href: '/gateways', label: 'Gateways', icon: KeyRound },
      { href: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/agencies', label: 'Agencies', icon: Building2 },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/audit', label: 'Audit Trail', icon: ScrollText },
      { href: '/users', label: 'Users & Roles', icon: Users },
    ],
  },
];

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-all duration-300 ease-agency sm:py-2',
                  active
                    ? 'bg-white/12 text-white shadow-[inset_3px_0_0_0_#B89A4F]'
                    : 'text-white/65 hover:bg-white/8 hover:text-white',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    active ? 'text-brass-soft' : 'text-white/50 group-hover:text-white/80',
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

function HeaderActions({
  userName,
  userRole,
  userEmail,
  onLogout,
}: {
  userName: string;
  userRole: string;
  userEmail: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileOpen) return;
    function onPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setProfileOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setProfileOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  const dark = mounted && (resolvedTheme === 'dark' || theme === 'dark');
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <Link
        href="/notifications"
        aria-label="Notifications"
        className={cn(
          'relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          pathname.startsWith('/notifications') && 'bg-muted text-foreground',
        )}
      >
        <Bell className="h-4 w-4" />
        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-card" />
      </Link>

      <button
        type="button"
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden />

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          onClick={() => setProfileOpen((o) => !o)}
          className={cn(
            'inline-flex max-w-[12rem] items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted sm:max-w-[16rem] sm:px-2',
            profileOpen && 'bg-muted',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold tracking-wide text-white seal-ring dark:bg-accent">
            {initials || <UserRound className="h-3.5 w-3.5" />}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-medium leading-tight text-foreground">
              {userName}
            </span>
            <span className="block truncate text-[10px] uppercase tracking-wider text-muted-foreground">
              {userRole}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'hidden h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform sm:block',
              profileOpen && 'rotate-180',
            )}
          />
        </button>

        {profileOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-64 origin-top-right animate-scale-in overflow-hidden rounded-xl border border-border/80 bg-card shadow-lift"
          >
            <div className="border-b border-border/80 bg-muted/40 px-4 py-3">
              <p className="truncate text-sm font-medium text-foreground">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{userEmail || userRole}</p>
              <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-700 dark:text-accent-100">
                <Shield className="h-2.5 w-2.5" />
                {userRole}
              </p>
            </div>
            <div className="p-1.5">
              <Link
                href="/users"
                role="menuitem"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                Users & roles
              </Link>
              <Link
                href="/agencies"
                role="menuitem"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Agency profile
              </Link>
              <Link
                href="/notifications"
                role="menuitem"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Bell className="h-4 w-4 text-muted-foreground" />
                Notification centre
              </Link>
            </div>
            <div className="border-t border-border/80 p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    const user = getStoredUser();
    setUserName(user ? `${user.firstName} ${user.lastName}` : 'Officer');
    setUserRole(user?.isSuperAdmin ? 'Super Admin' : 'Revenue Officer');
    setUserEmail(user?.email ?? '');
    setReady(true);
  }, [router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  async function logout() {
    await logoutApi();
    router.replace('/login');
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="h-10 w-10 rounded-full border-2 border-brass/50 border-t-accent animate-spin" />
          <p className="text-sm text-muted-foreground">Opening secure workspace…</p>
        </div>
      </div>
    );
  }

  const brandBlock = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent seal-ring">
        <Receipt className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-serif text-[1.05rem] leading-none tracking-tight sm:text-[1.15rem]">
          NGRS
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-brass-soft/90">
          Nigeria Gov. Revenue
        </p>
      </div>
    </div>
  );

  const userFooter = (
    <div className="border-t border-white/10 p-4">
      <div className="flex items-start gap-2.5 rounded-md bg-white/5 px-3 py-2.5">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass-soft" />
        <div className="min-w-0">
          <p className="truncate text-sm text-white/90">{userName}</p>
          <p className="truncate text-[11px] uppercase tracking-wider text-white/45">{userRole}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-b from-navy-700 via-navy to-navy-800 text-white print:hidden lg:flex lg:min-h-screen lg:flex-col lg:border-r lg:border-white/10">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 20% 0%, rgba(184,154,79,0.18), transparent 45%), radial-gradient(ellipse at 80% 100%, rgba(12,107,69,0.2), transparent 50%)',
          }}
        />
        <div className="relative flex h-[4.25rem] items-center border-b border-white/10 px-5 hairline-top">
          {brandBlock}
        </div>
        <nav className="relative flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-5">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="relative mt-auto">{userFooter}</div>
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 print:hidden lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-navy-900/55 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-gradient-to-b from-navy-700 via-navy to-navy-800 text-white shadow-lift animate-fade-up">
            <div className="flex h-[4.25rem] items-center justify-between gap-2 border-b border-white/10 px-4">
              {brandBlock}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-white hover:bg-white/10"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
              <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </nav>
            {userFooter}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border/70 bg-card/90 px-3 shadow-[0_1px_0_rgba(184,154,79,0.12)] backdrop-blur-md print:hidden sm:px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">
                <span className="font-medium text-navy dark:text-foreground">NGRS</span>
                <span className="mx-1.5 text-brass/50 sm:mx-2">·</span>
                <span className="hidden min-[380px]:inline">Nigeria Government Revenue System</span>
                <span className="min-[380px]:hidden">Revenue system</span>
              </p>
            </div>
          </div>
          <HeaderActions
            userName={userName}
            userRole={userRole}
            userEmail={userEmail}
            onLogout={logout}
          />
        </header>
        <main className="w-full min-w-0 flex-1 animate-fade-up p-3 sm:p-5 lg:p-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
