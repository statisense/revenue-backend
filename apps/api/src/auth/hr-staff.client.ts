import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type HrStaffRecord = {
  raw: Record<string, unknown>;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  staffId: string;
  companyId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  const byLower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    byLower.set(k.toLowerCase(), v);
  }
  for (const key of keys) {
    const v = obj[key] ?? byLower.get(key.toLowerCase());
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function unwrapStaffPayload(body: unknown): Record<string, unknown> {
  const root = asRecord(body);
  if (!root) throw new UnauthorizedException('HR returned an empty staff payload');

  for (const key of ['data', 'staff', 'user', 'result', 'payload']) {
    const nested = asRecord(root[key]);
    if (nested) {
      const deeper = asRecord(nested.data) ?? asRecord(nested.staff) ?? asRecord(nested.user);
      return deeper ?? nested;
    }
  }

  if (Array.isArray(root.data) && root.data[0]) {
    const first = asRecord(root.data[0]);
    if (first) return first;
  }

  return root;
}

/** Soft-decode HR JWT payload (signature is validated by the HR API, not us). */
export function decodeHrCtxClaims(ctx: string): {
  staffId?: string;
  companyId?: string;
  expire?: number;
} {
  const parts = ctx.split('.');
  if (parts.length < 2) return {};
  try {
    const json = Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const payload = JSON.parse(json) as Record<string, unknown>;
    const staffId =
      pickString(payload, ['staff_id', 'staffId', 'stid', 'sub']) ??
      (typeof payload.staff_id === 'number' ? String(payload.staff_id) : undefined);
    const companyId =
      pickString(payload, ['company', 'company_id', 'companyId', 'cid']) ??
      (typeof payload.company === 'number' ? String(payload.company) : undefined);
    const expireRaw = payload.expire ?? payload.exp;
    const expire = typeof expireRaw === 'number' ? expireRaw : Number(expireRaw);
    return {
      staffId,
      companyId,
      expire: Number.isFinite(expire) ? expire : undefined,
    };
  } catch {
    return {};
  }
}

@Injectable()
export class HrStaffClient {
  private readonly logger = new Logger(HrStaffClient.name);

  constructor(private readonly config: ConfigService) {}

  async fetchStaff(input: {
    ctx: string;
    companyId: string;
    staffId: string;
  }): Promise<HrStaffRecord> {
    const url = this.config.get<string>(
      'HR_STAFF_API_URL',
      'https://hr.ncaa.gov.ng/old_hr/apis/apps/get_staff_data',
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          token: input.ctx,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          company_id: input.companyId,
          staff_id: input.staffId,
        }),
      });
    } catch (err) {
      this.logger.warn(`HR staff API unreachable: ${(err as Error).message}`);
      throw new ServiceUnavailableException('HR staff service is unreachable');
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }

    if (!res.ok) {
      this.logger.warn(`HR staff API HTTP ${res.status}: ${text.slice(0, 300)}`);
      throw new UnauthorizedException('HR rejected the staff token or ids');
    }

    const root = asRecord(body);
    if (root) {
      const status = root.status ?? root.Status ?? root.success ?? root.Success;
      if (status === false || status === 0 || status === 'false' || status === 'error' || status === 'failed') {
        const msg =
          pickString(root, ['message', 'Message', 'error', 'Error', 'msg']) ??
          'HR rejected the staff token or ids';
        throw new UnauthorizedException(msg);
      }
    }

    const staff = unwrapStaffPayload(body);
    const emailFromHr = pickString(staff, [
      'email',
      'Email',
      'staff_email',
      'staffEmail',
      'work_email',
      'official_email',
    ]);
    const firstName =
      pickString(staff, [
        'FIRST_NAME',
        'first_name',
        'firstName',
        'firstname',
        'given_name',
        'other_names',
      ]) ?? 'Staff';
    let lastName =
      pickString(staff, [
        'LAST_NAME',
        'last_name',
        'lastName',
        'lastname',
        'surname',
        'family_name',
      ]) ?? 'User';
    const fullName = pickString(staff, [
      'NAME',
      'name',
      'full_name',
      'fullName',
      'staff_name',
      'STAFF_NAME',
    ]);
    if (fullName && firstName === 'Staff' && lastName === 'User') {
      const parts = fullName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        lastName = parts.slice(1).join(' ');
      } else if (parts.length === 1) {
        lastName = parts[0]!;
      }
    }

    const phone = pickString(staff, [
      'phone',
      'PHONE',
      'mobile',
      'MOBILE',
      'phone_number',
      'telephone',
      'gsm',
    ]);
    const email =
      emailFromHr?.toLowerCase() ??
      `hr-staff-${input.companyId}-${input.staffId}@sso.ncaa.local`;

    return {
      raw: staff,
      email,
      firstName,
      lastName:
        firstName === 'Staff' && lastName === 'User' && fullName ? fullName : lastName,
      phone,
      staffId: input.staffId,
      companyId: input.companyId,
    };
  }
}
