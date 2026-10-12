const ACCESS_KEY = 'revenue_access_token';
const REFRESH_KEY = 'revenue_refresh_token';
const USER_KEY = 'revenue_user';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  agencyId?: string | null;
  isSuperAdmin?: boolean;
};

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(tokens: {
  accessToken: string;
  refreshToken?: string;
  user?: AuthUser;
}) {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  }
  if (tokens.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
  }
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('revenue_hr_ctx');
  localStorage.removeItem('revenue_hr_profile');
  localStorage.removeItem('revenue_hr_meta');
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}
