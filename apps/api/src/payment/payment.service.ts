import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as QRCode from 'qrcode';
import {
  AuditAction,
  InvoiceStatus,
  LinkEventType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  VirtualAccountStatus,
} from '@revenue/database';
import {
  createPaymentToken,
  generatePaymentCode,
  generatePaymentReference,
  verifyPaymentToken,
  amountsEqual,
} from '@revenue/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AbacService } from '../common/services/abac.service';
import { SequenceService } from '../common/services/sequence.service';
import { VirtualAccountService } from '../virtual-account/virtual-account.service';
import { GatewayService } from '../gateway/gateway.service';
import { ReceiptService } from './receipt.service';
import { SettlementService } from '../settlement/settlement.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreatePaymentLinkDto,
  GenerateAccountDto,
  SharePaymentLinkDto,
  SimulatePaymentDto,
  VerifyPaymentDto,
} from './dto/payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly abac: AbacService,
    private readonly sequences: SequenceService,
    private readonly vas: VirtualAccountService,
    private readonly gateways: GatewayService,
    private readonly receipts: ReceiptService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => SettlementService))
    private readonly settlements: SettlementService,
    @InjectQueue('notifications') private readonly notifyQueue: Queue,
  ) {}

  async createPaymentRequestForInvoice(actor: AuthUser | null, invoiceId: string, dto?: Partial<CreatePaymentLinkDto>) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { agency: true, lines: { include: { revenueType: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (actor) this.abac.assertAgencyAccess(actor, invoice.agencyId);
    if (invoice.status === InvoiceStatus.PAID) throw new BadRequestException('Invoice already paid');
    if (invoice.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Invoice cancelled');

    const existing = await this.prisma.paymentRequest.findFirst({
      where: { invoiceId, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } },
      include: { paymentLink: true, virtualAccount: true },
    });
    if (existing) return existing;

    const provider = dto?.provider ?? PaymentProvider.PAYSTACK;
    const ttlHours = dto?.ttlHours ?? this.config.get<number>('PAYMENT_LINK_TTL_HOURS', 72);
    const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
    const year = new Date().getUTCFullYear();
    const month = new Date().getUTCMonth() + 1;
    const seq = await this.sequences.next(invoice.agencyId, 'PAYMENT_CODE', year, month);
    const style =
      invoice.agency.paymentCodeStyle === 'REV_PREFIX'
        ? 'REV_PREFIX'
        : invoice.agency.paymentCodeStyle === 'CUS_YEAR'
          ? 'CUS_YEAR'
          : 'AGENCY_DATE_SEQ';

    let paymentCode = generatePaymentCode({
      style,
      agencyCode: invoice.agency.code,
      sequence: seq,
      year,
      month,
    });

    // Guarantee uniqueness with retry
    for (let i = 0; i < 5; i++) {
      const clash = await this.prisma.paymentRequest.findUnique({ where: { paymentCode } });
      if (!clash) break;
      paymentCode = generatePaymentCode({
        style: 'REV_PREFIX',
        agencyCode: invoice.agency.code,
      });
    }

    const paymentReference = generatePaymentReference('PR');
    const hmacSecret = this.config.getOrThrow<string>('HMAC_PAYMENT_SECRET');
    const hmacToken = createPaymentToken({
      paymentCode,
      invoiceId: invoice.id,
      amountMinor: invoice.totalMinor,
      expiresAt: expiresAt.toISOString(),
      secret: hmacSecret,
    });
    const payUrl = this.canonicalPayUrl(paymentCode);
    const qrPayload = await QRCode.toDataURL(payUrl);

    const revenueName = invoice.lines[0]?.revenueType?.name ?? invoice.lines[0]?.description ?? 'Revenue Payment';

    const paymentRequest = await this.prisma.paymentRequest.create({
      data: {
        agencyId: invoice.agencyId,
        invoiceId: invoice.id,
        paymentCode,
        paymentReference,
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
        status: PaymentStatus.PENDING,
        hmacToken,
        qrPayload,
        payUrl,
        expiresAt,
        provider,
        preferredMethods: dto?.methods ?? [
          PaymentMethod.BANK_TRANSFER,
          PaymentMethod.DEBIT_CARD,
          PaymentMethod.USSD,
          PaymentMethod.QR,
        ],
        metadata: { revenueName },
        paymentLink: {
          create: {
            slug: paymentCode,
            shortUrl: payUrl,
          },
        },
      },
      include: { paymentLink: true },
    });

    const virtualAccount = await this.vas.allocate({
      agencyId: invoice.agencyId,
      paymentRequestId: paymentRequest.id,
      provider,
      invoiceNumber: invoice.invoiceNumber,
      paymentReference,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      accountName: `${invoice.agency.shortName ?? invoice.agency.code} / ${invoice.payerName}`.slice(0, 100),
      payerEmail: invoice.payerEmail ?? undefined,
      expiresAt,
    });

    await this.audit.log({
      agencyId: invoice.agencyId,
      actorId: actor?.id,
      action: AuditAction.PAYMENT,
      entityType: 'PaymentRequest',
      entityId: paymentRequest.id,
      after: { paymentCode, paymentReference, payUrl, virtualAccount: virtualAccount.accountNumber },
    });

    return this.prisma.paymentRequest.findUniqueOrThrow({
      where: { id: paymentRequest.id },
      include: {
        paymentLink: true,
        virtualAccount: true,
        invoice: { include: { lines: { include: { revenueType: true } }, agency: true } },
      },
    });
  }

  async createLink(actor: AuthUser, dto: CreatePaymentLinkDto) {
    return this.createPaymentRequestForInvoice(actor, dto.invoiceId, dto);
  }

  async generateAccount(actor: AuthUser, dto: GenerateAccountDto) {
    const pr = await this.prisma.paymentRequest.findUnique({
      where: { id: dto.paymentRequestId },
      include: { invoice: true, virtualAccount: true, agency: true },
    });
    if (!pr) throw new NotFoundException('Payment request not found');
    this.abac.assertAgencyAccess(actor, pr.agencyId);
    if (pr.virtualAccount) return pr.virtualAccount;

    return this.vas.allocate({
      agencyId: pr.agencyId,
      paymentRequestId: pr.id,
      provider: dto.provider ?? pr.provider,
      invoiceNumber: pr.invoice.invoiceNumber,
      paymentReference: pr.paymentReference,
      amountMinor: pr.amountMinor,
      currency: pr.currency,
      accountName: `${pr.agency.code} / ${pr.invoice.payerName}`.slice(0, 100),
      payerEmail: pr.invoice.payerEmail ?? undefined,
      expiresAt: pr.expiresAt,
    });
  }

  async getByCode(code: string, trackOpen = true) {
    const pr = await this.prisma.paymentRequest.findUnique({
      where: { paymentCode: code },
      include: {
        virtualAccount: true,
        paymentLink: true,
        invoice: {
          include: {
            agency: true,
            lines: { include: { revenueType: true } },
          },
        },
      },
    });
    if (!pr) throw new NotFoundException('Payment not found');

    if (pr.expiresAt.getTime() < Date.now() && pr.status === PaymentStatus.PENDING) {
      await this.prisma.paymentRequest.update({
        where: { id: pr.id },
        data: { status: PaymentStatus.EXPIRED },
      });
      if (pr.virtualAccount) {
        await this.prisma.virtualAccount.update({
          where: { id: pr.virtualAccount.id },
          data: { status: VirtualAccountStatus.EXPIRED },
        });
      }
      await this.prisma.linkShareEvent.create({
        data: { paymentRequestId: pr.id, eventType: LinkEventType.EXPIRED },
      });
      pr.status = PaymentStatus.EXPIRED;
    }

    if (trackOpen) {
      await this.prisma.linkShareEvent.create({
        data: { paymentRequestId: pr.id, eventType: LinkEventType.OPENED },
      });
      if (pr.paymentLink) {
        await this.prisma.paymentLink.update({
          where: { id: pr.paymentLink.id },
          data: { openCount: { increment: 1 } },
        });
      }
    }

    const tokenCheck = verifyPaymentToken(pr.hmacToken, this.config.getOrThrow('HMAC_PAYMENT_SECRET'));
    const meta = (pr.metadata ?? {}) as { revenueName?: string };
    const payUrl = this.canonicalPayUrl(pr.paymentCode);
    const qrCode = await this.resolveQrDataUrl(pr.qrPayload, payUrl);

    // Heal legacy/demo pay URLs and QR payloads stored with the wrong host
    const patch: { payUrl?: string; qrPayload?: string } = {};
    if (pr.payUrl !== payUrl) patch.payUrl = payUrl;
    if (qrCode && qrCode !== pr.qrPayload && qrCode.startsWith('data:image')) patch.qrPayload = qrCode;
    if (Object.keys(patch).length) {
      await this.prisma.paymentRequest.update({ where: { id: pr.id }, data: patch });
    }

    const paystackPublicKey = this.config.get<string>('PAYSTACK_PUBLIC_KEY') || '';

    return {
      paymentCode: pr.paymentCode,
      paymentReference: pr.paymentReference,
      revenueName: meta.revenueName ?? pr.invoice.lines[0]?.revenueType?.name ?? 'Revenue Payment',
      amountMinor: pr.amountMinor,
      amountFormatted: new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: pr.currency,
      }).format(pr.amountMinor / 100),
      currency: pr.currency,
      invoiceNumber: pr.invoice.invoiceNumber,
      payerEmail: pr.invoice.payerEmail,
      payerName: pr.invoice.payerName,
      agency: {
        code: pr.invoice.agency.code,
        name: pr.invoice.agency.name,
      },
      provider: pr.provider,
      paystackPublicKey: paystackPublicKey.startsWith('pk_') ? paystackPublicKey : null,
      virtualAccount: pr.virtualAccount
        ? {
            bank: pr.virtualAccount.bankName,
            bankCode: pr.virtualAccount.bankCode,
            accountNumber: pr.virtualAccount.accountNumber,
            accountName: pr.virtualAccount.accountName,
            status: pr.virtualAccount.status,
            expiresAt: pr.virtualAccount.expiresAt,
          }
        : null,
      qrCode,
      payUrl,
      expiresAt: pr.expiresAt,
      status: pr.status,
      methods: (pr.preferredMethods as PaymentMethod[] | null) ?? [],
      tokenValid: tokenCheck.valid,
      hmacToken: pr.hmacToken,
    };
  }

  private payBaseUrl() {
    return (this.config.get<string>('PAY_URL') || this.config.get<string>('APP_URL') || '')
      .trim()
      .replace(/\/$/, '');
  }

  private canonicalPayUrl(paymentCode: string) {
    const base = this.payBaseUrl();
    if (!base) throw new BadRequestException('PAY_URL is not configured');
    return `${base}/pay/${paymentCode}`;
  }

  private async resolveQrDataUrl(qrPayload: string | null | undefined, payUrl: string | null | undefined) {
    if (qrPayload?.startsWith('data:image')) return qrPayload;
    const target = payUrl || qrPayload;
    if (!target) return null;
    try {
      return await QRCode.toDataURL(target, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 280,
      });
    } catch (err) {
      this.logger.warn(`QR generation failed: ${(err as Error).message}`);
      return null;
    }
  }

  async trackClick(code: string) {
    const pr = await this.prisma.paymentRequest.findUnique({
      where: { paymentCode: code },
      include: { paymentLink: true },
    });
    if (!pr) throw new NotFoundException('Payment not found');
    await this.prisma.linkShareEvent.create({
      data: { paymentRequestId: pr.id, eventType: LinkEventType.CLICKED },
    });
    if (pr.paymentLink) {
      await this.prisma.paymentLink.update({
        where: { id: pr.paymentLink.id },
        data: { clickCount: { increment: 1 } },
      });
    }
    return { tracked: true };
  }

  async share(actor: AuthUser, code: string, dto: SharePaymentLinkDto) {
    const pr = await this.prisma.paymentRequest.findUnique({ where: { paymentCode: code } });
    if (!pr) throw new NotFoundException('Payment not found');
    this.abac.assertAgencyAccess(actor, pr.agencyId);

    const payUrl = this.canonicalPayUrl(pr.paymentCode);
    if (pr.payUrl !== payUrl) {
      await this.prisma.paymentRequest.update({ where: { id: pr.id }, data: { payUrl } });
    }

    await this.notifyQueue.add('send', {
      channel: dto.channel,
      recipient: dto.recipient,
      subject: `Payment request ${pr.paymentCode}`,
      body: `Please pay via ${payUrl}. Amount: ${(pr.amountMinor / 100).toFixed(2)} ${pr.currency}. Expires ${pr.expiresAt.toISOString()}`,
      agencyId: pr.agencyId,
      metadata: { paymentCode: pr.paymentCode },
    });

    await this.prisma.linkShareEvent.create({
      data: {
        paymentRequestId: pr.id,
        eventType: LinkEventType.SHARED,
        channel: dto.channel as never,
        metadata: { recipient: dto.recipient },
      },
    });
    return { queued: true, payUrl };
  }

  async verify(dto: VerifyPaymentDto) {
    const pr = await this.prisma.paymentRequest.findFirst({
      where: {
        OR: [{ paymentReference: dto.reference }, { paymentCode: dto.reference }],
      },
      include: { virtualAccount: true, invoice: true },
    });
    if (!pr) throw new NotFoundException('Payment request not found');
    const adapter = this.gateways.get(dto.provider ?? pr.provider);
    const result = await adapter.verifyPayment({ reference: pr.paymentReference });
    if (!result.success) return { verified: false, status: pr.status };

    const amount = result.amountMinor > 0 ? result.amountMinor : pr.amountMinor;
    return this.completePayment({
      paymentRequestId: pr.id,
      amountMinor: amount,
      currency: result.currency || pr.currency,
      provider: pr.provider,
      providerRef: result.providerRef,
      method: result.method ?? PaymentMethod.BANK_TRANSFER,
      paidAt: result.paidAt ?? new Date(),
      rawPayload: result.raw,
    });
  }

  async handleWebhook(
    provider: PaymentProvider,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
    payload: unknown,
  ) {
    const adapter = this.gateways.get(provider);
    const signatureValid = adapter.verifyWebhookSignature(headers, rawBody);
    const parsed = adapter.parseWebhook(payload);

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider, providerEventId: parsed.eventId } },
    });
    if (existing?.processedAt) {
      return { duplicate: true, eventId: existing.id };
    }

    const event = await this.prisma.webhookEvent.upsert({
      where: { provider_providerEventId: { provider, providerEventId: parsed.eventId } },
      create: {
        provider,
        providerEventId: parsed.eventId,
        eventType: parsed.eventType,
        signatureValid,
        payload: payload as object,
      },
      update: {
        signatureValid,
        payload: payload as object,
      },
    });

    if (!signatureValid && process.env.NODE_ENV === 'production') {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processingError: 'Invalid signature' },
      });
      throw new BadRequestException('Invalid webhook signature');
    }

    if (parsed.status !== 'success') {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
      return { processed: false, reason: 'non-success status' };
    }

    try {
      const pr = await this.findPaymentRequestForWebhook(parsed.reference, parsed.accountNumber);
      if (!pr) throw new NotFoundException('Matching payment request not found');

      const amountMinor = parsed.amountMinor ?? pr.amountMinor;
      if (!amountsEqual(amountMinor, pr.amountMinor)) {
        throw new BadRequestException(
          `Amount mismatch: expected ${pr.amountMinor}, got ${amountMinor}`,
        );
      }

      if (pr.virtualAccount && parsed.accountNumber && pr.virtualAccount.accountNumber !== parsed.accountNumber) {
        throw new BadRequestException('Virtual account mismatch');
      }

      if (pr.virtualAccount) {
        await this.vas.assertReceivable(pr.virtualAccount.accountNumber, pr.virtualAccount.bankCode);
      }

      const result = await this.completePayment({
        paymentRequestId: pr.id,
        amountMinor,
        currency: parsed.currency ?? pr.currency,
        provider,
        providerRef: parsed.eventId,
        method: PaymentMethod.BANK_TRANSFER,
        paidAt: new Date(),
        rawPayload: payload,
      });

      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
      return { processed: true, payment: result };
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processingError: (error as Error).message },
      });
      throw error;
    }
  }

  async simulatePayment(dto: SimulatePaymentDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Simulation disabled in production');
    }
    const pr = await this.prisma.paymentRequest.findUnique({
      where: { paymentCode: dto.paymentCode },
      include: { virtualAccount: true },
    });
    if (!pr) throw new NotFoundException('Payment request not found');
    return this.completePayment({
      paymentRequestId: pr.id,
      amountMinor: dto.amountMinor ?? pr.amountMinor,
      currency: pr.currency,
      provider: pr.provider,
      providerRef: `SIM-${Date.now()}`,
      method: PaymentMethod.BANK_TRANSFER,
      paidAt: new Date(),
      rawPayload: { simulated: true },
    });
  }

  async completePayment(input: {
    paymentRequestId: string;
    amountMinor: number;
    currency: string;
    provider: PaymentProvider;
    providerRef: string;
    method: PaymentMethod;
    paidAt: Date;
    rawPayload?: unknown;
  }) {
    const pr = await this.prisma.paymentRequest.findUnique({
      where: { id: input.paymentRequestId },
      include: {
        invoice: true,
        virtualAccount: true,
        payments: true,
      },
    });
    if (!pr) throw new NotFoundException('Payment request not found');
    if (pr.status === PaymentStatus.PAID) {
      const existing = pr.payments.find((p) => p.status === PaymentStatus.PAID);
      const receipt = existing
        ? await this.receipts.getByPaymentId(existing.id)
        : null;
      return { alreadyPaid: true, payment: existing, receipt };
    }
    if (pr.status === PaymentStatus.EXPIRED) {
      throw new BadRequestException('Payment request expired');
    }
    if (!amountsEqual(input.amountMinor, pr.amountMinor)) {
      throw new BadRequestException('Amount does not match invoice');
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          agencyId: pr.agencyId,
          invoiceId: pr.invoiceId,
          paymentRequestId: pr.id,
          amountMinor: input.amountMinor,
          currency: input.currency,
          method: input.method,
          provider: input.provider,
          providerRef: input.providerRef,
          status: PaymentStatus.PAID,
          paidAt: input.paidAt,
          payerName: pr.invoice.payerName,
          payerEmail: pr.invoice.payerEmail,
          rawPayload: input.rawPayload as object | undefined,
        },
      });

      await tx.paymentRequest.update({
        where: { id: pr.id },
        data: { status: PaymentStatus.PAID, paidAt: input.paidAt },
      });

      await tx.invoice.update({
        where: { id: pr.invoiceId },
        data: {
          status: InvoiceStatus.PAID,
          amountPaidMinor: input.amountMinor,
          paidAt: input.paidAt,
        },
      });

      if (pr.virtualAccount) {
        await tx.virtualAccount.update({
          where: { id: pr.virtualAccount.id },
          data: { status: VirtualAccountStatus.SETTLED, settlementStatus: 'PENDING' },
        });
      }

      await tx.linkShareEvent.create({
        data: { paymentRequestId: pr.id, eventType: LinkEventType.PAID },
      });

      return created;
    });

    const receipt = await this.receipts.issueForPayment(payment.id);
    await this.settlements.recordPaymentSettlement(payment.id);

    await this.audit.log({
      agencyId: pr.agencyId,
      action: AuditAction.PAYMENT,
      entityType: 'Payment',
      entityId: payment.id,
      after: { amountMinor: payment.amountMinor, providerRef: payment.providerRef },
    });

    if (pr.invoice.payerEmail) {
      await this.notifyQueue.add('send', {
        channel: 'EMAIL',
        recipient: pr.invoice.payerEmail,
        subject: `Payment receipt ${receipt.receiptNumber}`,
        body: `Your payment of ${(payment.amountMinor / 100).toFixed(2)} ${payment.currency} was received. Receipt: ${receipt.receiptNumber}. Reference: ${pr.paymentReference}`,
        agencyId: pr.agencyId,
        metadata: { receiptId: receipt.id, paymentId: payment.id },
      });
    }
    if (pr.invoice.payerPhone) {
      await this.notifyQueue.add('send', {
        channel: 'SMS',
        recipient: pr.invoice.payerPhone,
        body: `Payment confirmed. Ref ${pr.paymentReference}. Receipt ${receipt.receiptNumber}. Amount ${(payment.amountMinor / 100).toFixed(2)} ${payment.currency}`,
        agencyId: pr.agencyId,
      });
    }

    this.logger.log(`Payment completed ${payment.id} for ${pr.paymentCode}`);
    return { payment, receipt };
  }

  async list(actor: AuthUser, agencyId?: string) {
    const resolved = this.abac.resolveAgencyId(actor, agencyId);
    return this.prisma.payment.findMany({
      where: { agencyId: resolved },
      include: { invoice: true, receipt: true, paymentRequest: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async listRequests(actor: AuthUser, agencyId?: string) {
    const resolved = this.abac.resolveAgencyId(actor, agencyId);
    const rows = await this.prisma.paymentRequest.findMany({
      where: { agencyId: resolved },
      include: {
        invoice: {
          include: {
            receipts: { take: 1, orderBy: { issuedAt: 'desc' } },
          },
        },
        virtualAccount: true,
        paymentLink: true,
        payments: {
          include: { receipt: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const base = this.payBaseUrl();
    const staleIds: string[] = [];

    for (const row of rows) {
      const payUrl = base ? `${base}/pay/${row.paymentCode}` : row.payUrl;
      if (base && row.payUrl !== payUrl) {
        row.payUrl = payUrl;
        staleIds.push(row.id);
      }

      // Issue missing receipts for paid collections so the console can link them
      for (const payment of row.payments) {
        if (payment.status === PaymentStatus.PAID && !payment.receipt) {
          try {
            payment.receipt = await this.receipts.issueForPayment(payment.id);
          } catch (err) {
            this.logger.warn(
              `Could not issue receipt for payment ${payment.id}: ${(err as Error).message}`,
            );
          }
        }
      }
    }

    if (staleIds.length && base) {
      await Promise.all(
        staleIds.map((id) => {
          const row = rows.find((r) => r.id === id)!;
          return this.prisma.paymentRequest.update({
            where: { id },
            data: { payUrl: row.payUrl },
          });
        }),
      );
    }

    return rows;
  }

  async getReceipt(id: string) {
    return this.receipts.getById(id);
  }

  private async findPaymentRequestForWebhook(reference: string, accountNumber?: string) {
    if (reference) {
      const byRef = await this.prisma.paymentRequest.findFirst({
        where: {
          OR: [{ paymentReference: reference }, { paymentCode: reference }],
        },
        include: { virtualAccount: true, invoice: true },
      });
      if (byRef) return byRef;
    }
    if (accountNumber) {
      const va = await this.prisma.virtualAccount.findFirst({
        where: { accountNumber },
        include: { paymentRequest: { include: { virtualAccount: true, invoice: true } } },
      });
      return va?.paymentRequest ?? null;
    }
    return null;
  }
}
