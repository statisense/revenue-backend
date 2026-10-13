import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PaymentStatus } from '@revenue/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AbacService } from '../common/services/abac.service';
import { CryptoService } from '../common/services/crypto.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateRefundDto, UpsertGatewayConfigDto } from '../common/dto/ops.dto';

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly abac: AbacService,
    private readonly crypto: CryptoService,
  ) {}

  async listVirtualAccounts(actor: AuthUser, agencyId?: string) {
    const resolved = await this.abac.resolveAgencyIdAsync(actor, agencyId);
    return this.prisma.virtualAccount.findMany({
      where: { agencyId: resolved },
      include: { paymentRequest: { select: { paymentCode: true, status: true, amountMinor: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listGatewayConfigs(actor: AuthUser, agencyId?: string) {
    const resolved = await this.abac.resolveAgencyIdAsync(actor, agencyId);
    const configs = await this.prisma.gatewayConfig.findMany({ where: { agencyId: resolved } });
    return configs.map((c) => ({
      id: c.id,
      provider: c.provider,
      isActive: c.isActive,
      isDefault: c.isDefault,
      publicKey: c.publicKey,
      hasSecret: Boolean(c.secretKeyEnc),
      hasWebhookSecret: Boolean(c.webhookSecretEnc),
      updatedAt: c.updatedAt,
    }));
  }

  async upsertGatewayConfig(actor: AuthUser, dto: UpsertGatewayConfigDto, agencyId?: string) {
    const resolved = await this.abac.resolveAgencyIdAsync(actor, agencyId);
    if (dto.isDefault) {
      await this.prisma.gatewayConfig.updateMany({
        where: { agencyId: resolved },
        data: { isDefault: false },
      });
    }
    const config = await this.prisma.gatewayConfig.upsert({
      where: { agencyId_provider: { agencyId: resolved, provider: dto.provider } },
      create: {
        agencyId: resolved,
        provider: dto.provider,
        publicKey: dto.publicKey,
        secretKeyEnc: this.crypto.encrypt(dto.secretKey),
        webhookSecretEnc: dto.webhookSecret ? this.crypto.encrypt(dto.webhookSecret) : null,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
      },
      update: {
        publicKey: dto.publicKey,
        secretKeyEnc: this.crypto.encrypt(dto.secretKey),
        webhookSecretEnc: dto.webhookSecret ? this.crypto.encrypt(dto.webhookSecret) : undefined,
        isActive: dto.isActive,
        isDefault: dto.isDefault,
      },
    });
    await this.audit.log({
      agencyId: resolved,
      actorId: actor.id,
      action: AuditAction.CONFIG,
      entityType: 'GatewayConfig',
      entityId: config.id,
      after: { provider: dto.provider, isDefault: dto.isDefault },
    });
    return { id: config.id, provider: config.provider, isActive: config.isActive, isDefault: config.isDefault };
  }

  async createRefund(actor: AuthUser, dto: CreateRefundDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: { refunds: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    this.abac.assertAgencyAccess(actor, payment.agencyId);
    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Only paid payments can be refunded');
    }
    const reserved = payment.refunds
      .filter((r) => r.status === PaymentStatus.PAID || r.status === PaymentStatus.PENDING)
      .reduce((s, r) => s + r.amountMinor, 0);
    if (reserved + dto.amountMinor > payment.amountMinor) {
      throw new BadRequestException('Refund exceeds payment amount (including pending requests)');
    }

    // Dual-control: create as PENDING; payment status updates only on approve.
    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountMinor: dto.amountMinor,
        currency: payment.currency,
        reason: dto.reason,
        status: PaymentStatus.PENDING,
      },
    });

    await this.audit.log({
      agencyId: payment.agencyId,
      actorId: actor.id,
      action: AuditAction.REFUND,
      entityType: 'Refund',
      entityId: refund.id,
      after: { amountMinor: dto.amountMinor, paymentId: payment.id, status: PaymentStatus.PENDING },
    });

    return this.prisma.refund.findUniqueOrThrow({
      where: { id: refund.id },
      include: { payment: { select: { id: true, providerRef: true, amountMinor: true } } },
    });
  }

  async approveRefund(actor: AuthUser, id: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: { payment: { include: { refunds: true } } },
    });
    if (!refund) throw new NotFoundException('Refund not found');
    this.abac.assertAgencyAccess(actor, refund.payment.agencyId);
    if (refund.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Only pending refunds can be approved');
    }

    const paidPortion = refund.payment.refunds
      .filter((r) => r.status === PaymentStatus.PAID)
      .reduce((s, r) => s + r.amountMinor, 0);
    if (paidPortion + refund.amountMinor > refund.payment.amountMinor) {
      throw new BadRequestException('Refund exceeds payment amount');
    }

    const newStatus =
      paidPortion + refund.amountMinor >= refund.payment.amountMinor
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;

    await this.prisma.$transaction([
      this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: PaymentStatus.PAID,
          processedAt: new Date(),
          providerRef: refund.providerRef || `RFN-${Date.now()}`,
        },
      }),
      this.prisma.payment.update({
        where: { id: refund.paymentId },
        data: { status: newStatus },
      }),
    ]);

    await this.audit.log({
      agencyId: refund.payment.agencyId,
      actorId: actor.id,
      action: AuditAction.APPROVE,
      entityType: 'Refund',
      entityId: refund.id,
      after: { status: PaymentStatus.PAID, paymentStatus: newStatus },
    });

    return this.prisma.refund.findUniqueOrThrow({
      where: { id: refund.id },
      include: { payment: { select: { id: true, providerRef: true, amountMinor: true } } },
    });
  }

  async rejectRefund(actor: AuthUser, id: string, reason?: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!refund) throw new NotFoundException('Refund not found');
    this.abac.assertAgencyAccess(actor, refund.payment.agencyId);
    if (refund.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Only pending refunds can be rejected');
    }

    const updated = await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: PaymentStatus.FAILED,
        processedAt: new Date(),
        reason: reason ? `${refund.reason ? `${refund.reason} · ` : ''}Rejected: ${reason}` : refund.reason,
      },
      include: { payment: { select: { id: true, providerRef: true, amountMinor: true } } },
    });

    await this.audit.log({
      agencyId: refund.payment.agencyId,
      actorId: actor.id,
      action: AuditAction.REJECT,
      entityType: 'Refund',
      entityId: refund.id,
      after: { status: PaymentStatus.FAILED, reason },
    });

    return updated;
  }

  async listRefunds(actor: AuthUser, agencyId?: string) {
    const resolved = await this.abac.resolveAgencyIdAsync(actor, agencyId);
    return this.prisma.refund.findMany({
      where: { payment: { agencyId: resolved } },
      include: { payment: { select: { id: true, providerRef: true, amountMinor: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async runMaintenanceJobs(actor: AuthUser) {
    const now = new Date();
    const expiredVa = await this.prisma.virtualAccount.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    const expiredPr = await this.prisma.paymentRequest.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
    const overdueInv = await this.prisma.invoice.updateMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueAt: { lt: now },
      },
      data: { status: 'OVERDUE' },
    });
    await this.audit.log({
      actorId: actor.id,
      action: AuditAction.CONFIG,
      entityType: 'MaintenanceJob',
      after: {
        expiredVirtualAccounts: expiredVa.count,
        expiredPaymentRequests: expiredPr.count,
        overdueInvoices: overdueInv.count,
      },
    });
    return {
      expiredVirtualAccounts: expiredVa.count,
      expiredPaymentRequests: expiredPr.count,
      overdueInvoices: overdueInv.count,
    };
  }

  async tenantInfo() {
    const code = process.env.TENANT_AGENCY_CODE ?? 'NCS';
    const agency = await this.prisma.agency.findUnique({
      where: { code },
      include: {
        branches: true,
        _count: {
          select: {
            users: true,
            invoices: true,
            payments: true,
            assessments: true,
          },
        },
      },
    });
    return { tenantCode: code, agency };
  }
}
