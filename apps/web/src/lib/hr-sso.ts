import { api } from './api';
import { isAuthenticated, setSession, type AuthUser } from './auth';

const HR_CTX_KEY = 'revenue_hr_ctx';
const HR_PROFILE_KEY = 'revenue_hr_profile';
const HR_META_KEY = 'revenue_hr_meta';

export type HrSsoQuery = {
  ctx: string;
  companyId: string;
  staffId: string;
  from?: string;
};

type HrSsoResponse = {
  requires2fa: false;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  hr: {
    ctx: string;
    companyId: string;
    staffId: string;
    from: string | null;
    profile: Record<string, unknown>;
  };
};

/** True when the URL carries a basement / NCAA HR deep-link. */
export function parseHrSsoQuery(search?: string): HrSsoQuery | null {
  if (typeof window === 'undefined' && !search) return null;
  const params = new URLSearchParams(search ?? window.location.search);
  const ctx = params.get('ctx')?.trim();
  const companyId = (params.get('cid') ?? params.get('company_id'))?.trim();
  const staffId = (params.get('stid') ?? params.get('staff_id'))?.trim();
  const from = params.get('from')?.trim() || undefined;
  if (!ctx || !companyId || !staffId) return null;
  return { ctx, companyId, staffId, from };
}

export function hasHrSsoQuery(search?: string): boolean {
  return Boolean(parseHrSsoQuery(search));
}

export function storeHrSession(hr: HrSsoResponse['hr']) {
  localStorage.setItem(HR_CTX_KEY, hr.ctx);
  localStorage.setItem(HR_PROFILE_KEY, JSON.stringify(hr.profile ?? {}));
  localStorage.setItem(
    HR_META_KEY,
    JSON.stringify({
      companyId: hr.companyId,
      staffId: hr.staffId,
      from: hr.from,
    }),
  );
}

export function clearHrSession() {
  localStorage.removeItem(HR_CTX_KEY);
  localStorage.removeItem(HR_PROFILE_KEY);
  localStorage.removeItem(HR_META_KEY);
}

export function getHrProfile(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(HR_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Remove SSO params from the address bar without a navigation. */
export function stripHrSsoQueryFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  ['ctx', 'cid', 'stid', 'company_id', 'staff_id', 'from'].forEach((k) => url.searchParams.delete(k));
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}

/**
 * Completes server-side HR SSO and establishes a normal app session.
 * Returns true when the user is authenticated afterward.
 */
export async function completeHrSso(query?: HrSsoQuery | null): Promise<boolean> {
  const params = query ?? parseHrSsoQuery();
  if (!params) return false;

  const data = await api<HrSsoResponse>('/auth/hr-sso', {
    method: 'POST',
    auth: false,
    body: {
      ctx: params.ctx,
      company_id: params.companyId,
      staff_id: params.staffId,
      from: params.from,
    },
  });

  setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  });
  storeHrSession(data.hr);
  stripHrSsoQueryFromUrl();
  return isAuthenticated();
}
