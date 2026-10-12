import { api } from './api';
import { isAuthenticated, setSession, type AuthUser } from './auth';

/** Temporary demo bypass — set NEXT_PUBLIC_AUTO_LOGIN=false to disable. */
export function isAutoLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTO_LOGIN !== 'false';
}

const AUTO_EMAIL = process.env.NEXT_PUBLIC_AUTO_LOGIN_EMAIL ?? 'admin@ncs.gov.ng';
const AUTO_PASSWORD = process.env.NEXT_PUBLIC_AUTO_LOGIN_PASSWORD ?? 'ChangeMe@12345';

type LoginResponse =
  | { requires2fa: true }
  | {
      requires2fa: false;
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    };

/**
 * Signs in as the seeded super admin when auto-login is enabled.
 * Returns true if a session is ready (existing or newly created).
 */
export async function ensureAutoLogin(): Promise<boolean> {
  if (!isAutoLoginEnabled()) return false;
  if (isAuthenticated()) return true;

  const data = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: AUTO_EMAIL, password: AUTO_PASSWORD },
  });

  if (data.requires2fa) {
    throw new Error('Auto-login blocked: account requires 2FA');
  }

  setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  });
  return true;
}
