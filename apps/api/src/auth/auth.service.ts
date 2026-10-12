import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { randomBytes } from 'crypto';
import { AuditAction } from '@revenue/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CryptoService } from '../common/services/crypto.service';
import { LoginDto, OAuthTokenDto } from './dto/auth.dto';
import { HrSsoDto } from './dto/hr-sso.dto';
import { decodeHrCtxClaims, HrStaffClient } from './hr-staff.client';
import { SeedBootstrapService } from '../ops/seed-bootstrap.service';

const passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly hrStaff: HrStaffClient,
    private readonly seedBootstrap: SeedBootstrapService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'LOCKED' || (user.lockedUntil && user.lockedUntil > new Date())) {
      throw new UnauthorizedException('Account locked');
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed,
          lockedUntil: failed >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null,
          status: failed >= 5 ? 'LOCKED' : user.status,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const user = await this.validateUser(dto.email, dto.password);
    const twoFactor = await this.prisma.twoFactorSecret.findUnique({ where: { userId: user.id } });
    if (twoFactor?.enabled) {
      if (!dto.totpCode) {
        return { requires2fa: true as const };
      }
      const secret = this.crypto.decrypt(twoFactor.secretEnc);
      const ok = authenticator.verify({ token: dto.totpCode, secret });
      if (!ok) throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), status: 'ACTIVE' },
    });

    const tokens = await this.issueTokens(user.id);
    await this.audit.log({
      agencyId: user.agencyId,
      actorId: user.id,
      action: AuditAction.LOGIN,
      entityType: 'User',
      entityId: user.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return { requires2fa: false as const, ...tokens, user: this.sanitizeUser(user) };
  }

  /**
   * Basement / NCAA HR SSO: validate ctx via HR staff API, upsert local admin, issue app JWTs.
   */
  async hrSso(dto: HrSsoDto, meta?: { ip?: string; userAgent?: string }) {
    if (this.config.get<boolean>('HR_SSO_ENABLED') === false) {
      throw new ServiceUnavailableException('HR SSO is disabled');
    }

    const companyId = String(dto.company_id).trim();
    const staffId = String(dto.staff_id).trim();
    if (!dto.ctx?.trim() || !companyId || !staffId) {
      throw new BadRequestException('ctx, company_id, and staff_id are required');
    }

    const claims = decodeHrCtxClaims(dto.ctx);
    if (claims.expire != null) {
      // HR tokens may use unix seconds or milliseconds
      const expMs = claims.expire > 1_000_000_000_000 ? claims.expire : claims.expire * 1000;
      if (expMs < Date.now()) {
        throw new UnauthorizedException('HR token has expired');
      }
    }
    if (claims.staffId && claims.staffId !== staffId) {
      throw new UnauthorizedException('staff_id does not match HR token claims');
    }
    if (claims.companyId && claims.companyId !== companyId) {
      throw new UnauthorizedException('company_id does not match HR token claims');
    }

    const staff = await this.hrStaff.fetchStaff({
      ctx: dto.ctx.trim(),
      companyId,
      staffId,
    });

    // Ensure demo/tenant data + SUPER_ADMIN role exist before linking the HR user
    await this.seedBootstrap.ensureSeeded();

    const user = await this.upsertHrSsoUser(staff);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), status: 'ACTIVE' },
    });

    const tokens = await this.issueTokens(user.id);
    const hydrated = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });

    await this.audit.log({
      agencyId: hydrated.agencyId,
      actorId: hydrated.id,
      action: AuditAction.LOGIN,
      entityType: 'User',
      entityId: hydrated.id,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
      metadata: {
        event: 'hr_sso_login',
        companyId,
        staffId,
        from: dto.from ?? null,
      },
    });

    return {
      requires2fa: false as const,
      ...tokens,
      user: this.sanitizeUser(hydrated),
      hr: {
        ctx: dto.ctx.trim(),
        companyId,
        staffId,
        from: dto.from ?? null,
        profile: staff.raw,
      },
    };
  }

  private async upsertHrSsoUser(staff: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    staffId: string;
    companyId: string;
  }) {
    const employeeNo = `hr:${staff.companyId}:${staff.staffId}`;
    const grantSuperAdmin = this.config.get<boolean>('HR_SSO_GRANT_SUPER_ADMIN') !== false;
    const agencyCode = this.config.get<string>('TENANT_AGENCY_CODE', 'NCS');
    const agency = await this.prisma.agency.findFirst({ where: { code: agencyCode } });

    const existingProfile = await this.prisma.officerProfile.findFirst({
      where: { employeeNo },
      include: {
        user: {
          include: {
            roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          },
        },
      },
    });

    let user =
      existingProfile?.user ??
      (await this.prisma.user.findUnique({
        where: { email: staff.email.toLowerCase() },
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      }));

    if (!user) {
      const passwordHash = await argon2.hash(randomBytes(32).toString('base64url'));
      user = await this.prisma.user.create({
        data: {
          email: staff.email.toLowerCase(),
          passwordHash,
          firstName: staff.firstName.slice(0, 80),
          lastName: staff.lastName.slice(0, 80),
          phone: staff.phone?.slice(0, 40),
          status: 'ACTIVE',
          isSuperAdmin: grantSuperAdmin,
          agencyId: grantSuperAdmin ? null : agency?.id ?? null,
          emailVerifiedAt: new Date(),
        },
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: staff.firstName.slice(0, 80),
          lastName: staff.lastName.slice(0, 80),
          phone: staff.phone?.slice(0, 40) ?? user.phone,
          status: 'ACTIVE',
          isSuperAdmin: grantSuperAdmin ? true : user.isSuperAdmin,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      });
    }

    if (agency) {
      await this.prisma.officerProfile.upsert({
        where: { userId: user.id },
        update: {
          employeeNo,
          title: 'HR SSO Admin',
          agencyId: agency.id,
        },
        create: {
          userId: user.id,
          agencyId: agency.id,
          employeeNo,
          title: 'HR SSO Admin',
        },
      });
    } else {
      // Still stamp employeeNo when tenant agency is missing so re-entry is stable.
      const existing = await this.prisma.officerProfile.findUnique({ where: { userId: user.id } });
      if (existing) {
        await this.prisma.officerProfile.update({
          where: { userId: user.id },
          data: { employeeNo, title: 'HR SSO Admin' },
        });
      }
    }

    if (grantSuperAdmin) {
      const superRole =
        (await this.prisma.role.findFirst({ where: { code: 'SUPER_ADMIN', agencyId: null } })) ??
        (await this.prisma.role.findFirst({ where: { code: 'SUPER_ADMIN' } }));
      if (superRole) {
        const already = await this.prisma.userRole.findUnique({
          where: { userId_roleId: { userId: user.id, roleId: superRole.id } },
        });
        if (!already) {
          await this.prisma.userRole.create({
            data: { userId: user.id, roleId: superRole.id },
          });
        }
      }
    }

    return user;
  }

  async refresh(refreshToken: string) {
    const hash = this.crypto.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.userId);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const hash = this.crypto.hash(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({
      actorId: userId,
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: userId,
    });
    return { success: true };
  }

  async setup2fa(userId: string) {
    const secret = authenticator.generateSecret();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const otpauth = authenticator.keyuri(user.email, 'GovernmentRevenue', secret);
    await this.prisma.twoFactorSecret.upsert({
      where: { userId },
      update: { secretEnc: this.crypto.encrypt(secret), enabled: false },
      create: {
        userId,
        secretEnc: this.crypto.encrypt(secret),
        enabled: false,
        backupCodes: Array.from({ length: 8 }, () => randomBytes(4).toString('hex')),
      },
    });
    return { secret, otpauth };
  }

  async enable2fa(userId: string, totpCode: string) {
    const record = await this.prisma.twoFactorSecret.findUnique({ where: { userId } });
    if (!record) throw new BadRequestException('2FA not initialized');
    const secret = this.crypto.decrypt(record.secretEnc);
    if (!authenticator.verify({ token: totpCode, secret })) {
      throw new UnauthorizedException('Invalid 2FA code');
    }
    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: { enabled: true, verifiedAt: new Date() },
    });
    return { enabled: true, backupCodes: (record.backupCodes as string[] | null) ?? [] };
  }

  async oauthClientCredentials(dto: OAuthTokenDto) {
    if (dto.grant_type !== 'client_credentials') {
      throw new BadRequestException('Unsupported grant_type');
    }
    const keyHash = this.crypto.hash(dto.client_secret);
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        keyPrefix: dto.client_id,
        keyHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { agency: true },
    });
    if (!apiKey) throw new UnauthorizedException('Invalid client credentials');
    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });
    const scopes = (apiKey.scopes as string[]) ?? [];
    const accessToken = await this.jwt.signAsync({
      sub: apiKey.userId ?? `api:${apiKey.id}`,
      agencyId: apiKey.agencyId,
      isSuperAdmin: false,
      roles: ['API_CLIENT'],
      permissions: scopes,
      typ: 'access',
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      scope: scopes.join(' '),
    };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const generic = { message: 'If an account exists for that email, password reset instructions were issued.' };
    if (!user || user.status === 'LOCKED') return generic;

    const token = randomBytes(32).toString('base64url');
    passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 60 * 60 * 1000 });

    await this.prisma.notification.create({
      data: {
        agencyId: user.agencyId ?? undefined,
        userId: user.id,
        channel: 'EMAIL',
        recipient: user.email,
        subject: 'Government Revenue Platform password reset',
        body: `Use this reset token within 1 hour: ${token}`,
        status: 'QUEUED',
      },
    });

    await this.audit.log({
      agencyId: user.agencyId,
      actorId: user.id,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: user.id,
      metadata: { event: 'password_reset_requested' },
    });

    if (process.env.NODE_ENV !== 'production') {
      return { ...generic, resetToken: token };
    }
    return generic;
  }

  async resetPassword(token: string, newPassword: string) {
    const entry = passwordResetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      passwordResetTokens.delete(token);
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    passwordResetTokens.delete(token);
    await this.prisma.user.update({
      where: { id: entry.userId },
      data: {
        passwordHash: await argon2.hash(newPassword),
        failedLogins: 0,
        lockedUntil: null,
        status: 'ACTIVE',
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: entry.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      actorId: entry.userId,
      action: AuditAction.UPDATE,
      entityType: 'User',
      entityId: entry.userId,
      metadata: { event: 'password_reset_completed' },
    });
    return { success: true };
  }

  private async issueTokens(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    const roles = user.roles.map((r) => r.role.code);
    const permissions = [
      ...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
    ];

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      agencyId: user.agencyId,
      isSuperAdmin: user.isSuperAdmin,
      roles,
      permissions,
      typ: 'access',
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const ttl = this.config.get<string>('JWT_REFRESH_TTL', '7d');
    const expiresAt = this.parseTtl(ttl);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.hash(refreshToken),
        expiresAt,
      },
    });
    await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
    };
  }

  private parseTtl(ttl: string): Date {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const n = Number(match[1]);
    const unit = match[2];
    const ms =
      unit === 's' ? n * 1000 : unit === 'm' ? n * 60_000 : unit === 'h' ? n * 3_600_000 : n * 86_400_000;
    return new Date(Date.now() + ms);
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    agencyId: string | null;
    isSuperAdmin: boolean;
    roles?: Array<{ role: { code: string; permissions: Array<{ permission: { code: string } }> } }>;
  }) {
    const roles = user.roles?.map((r) => r.role.code) ?? [];
    const permissions = [
      ...new Set(user.roles?.flatMap((r) => r.role.permissions.map((p) => p.permission.code)) ?? []),
    ];
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      agencyId: user.agencyId,
      isSuperAdmin: user.isSuperAdmin,
      roles,
      permissions,
    };
  }
}
