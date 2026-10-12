import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { AssessmentStatus, AuditAction, InvoiceStatus, PaymentStatus } from '@revenue/database';
import { generateInvoiceNumber } from '@revenue/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AbacService } from '../common/services/abac.service';
import { SequenceService } from '../common/services/sequence.service';
import { PaymentService } from '../payment/payment.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CancelInvoiceDto,
  CreateInvoiceDto,
  CreateInvoiceFromAssessmentDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto';
import { computeLineAmounts } from '../common/utils/line-tax';

const MUTABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.ISSUED,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.EXPIRED,
];

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly abac: AbacService,
    private readonly sequences: SequenceService,
    @Inject(forwardRef(() => PaymentService))
    private readonly payments: PaymentService,
  ) {}

  private assertMutable(invoice: { status: InvoiceStatus; amountPaidMinor: number }) {
    if (!MUTABLE_INVOICE_STATUSES.includes(invoice.status) || invoice.amountPaidMinor > 0) {
      throw new BadRequestException(
        'Only unpaid, non-cancelled invoices (with no payments applied) can be changed',
      );
    }
  }

  private async resolveTaxRates(agencyId: string, taxTypeIds: (string | undefined)[]) {
    const ids = [...new Set(taxTypeIds.filter(Boolean) as string[])];
    if (!ids.length) return new Map<string, number>();
    const taxes = await this.prisma.taxType.findMany({
      where: { id: { in: ids }, agencyId, isActive: true },
    });
    return new Map(taxes.map((t) => [t.id, Number(t.ratePercent)]));
  }

  private async buildLines(
    agencyId: string,
    dtoLines: CreateInvoiceDto['lines'],
  ) {
    const rateById = await this.resolveTaxRates(
      agencyId,
      dtoLines.map((l) => l.taxTypeId),
    );

    let subtotal = 0;
    let taxTotal = 0;
    const lines = dtoLines.map((line) => {
      const rate = line.taxTypeId ? (rateById.get(line.taxTypeId) ?? 0) : 0;
      if (line.taxTypeId && !rateById.has(line.taxTypeId)) {
        throw new BadRequestException(`Unknown or inactive tax type: ${line.taxTypeId}`);
      }
      const amounts = computeLineAmounts(line.quantity, line.unitAmountMinor, rate);
      subtotal += amounts.baseMinor;
      taxTotal += amounts.taxMinor;
      return {
        revenueTypeId: line.revenueTypeId,
        taxTypeId: line.taxTypeId || null,
        description: line.description,
        quantity: line.quantity,
        unitAmountMinor: line.unitAmountMinor,
        taxRatePercent: amounts.taxRatePercent,
        taxMinor: amounts.taxMinor,
        lineTotalMinor: amounts.lineTotalMinor,
      };
    });

    return { lines, subtotal, taxTotal, total: subtotal + taxTotal };
  }

  async create(actor: AuthUser, dto: CreateInvoiceDto) {
    const agencyId = this.abac.resolveAgencyId(actor, dto.agencyId);
    const agency = await this.prisma.agency.findUniqueOrThrow({ where: { id: agencyId } });
    const year = new Date().getUTCFullYear();
    const seq = await this.sequences.next(agencyId, 'INVOICE', year);

    const rateById = await this.resolveTaxRates(
      agencyId,
      dto.lines.map((l) => l.taxTypeId),
    );

    let subtotal = 0;
    let taxTotal = 0;
    const lines = dto.lines.map((line) => {
      const rate = line.taxTypeId ? (rateById.get(line.taxTypeId) ?? 0) : 0;
      if (line.taxTypeId && !rateById.has(line.taxTypeId)) {
        throw new BadRequestException(`Unknown or inactive tax type: ${line.taxTypeId}`);
      }
      const amounts = computeLineAmounts(line.quantity, line.unitAmountMinor, rate);
      subtotal += amounts.baseMinor;
      taxTotal += amounts.taxMinor;
      return {
        revenueTypeId: line.revenueTypeId,
        taxTypeId: line.taxTypeId || null,
        description: line.description,
        quantity: line.quantity,
        unitAmountMinor: line.unitAmountMinor,
        taxRatePercent: amounts.taxRatePercent,
        taxMinor: amounts.taxMinor,
        lineTotalMinor: amounts.lineTotalMinor,
      };
    });

    const ttlHours = dto.dueInHours ?? Number(process.env.PAYMENT_LINK_TTL_HOURS ?? 72);
    const invoice = await this.prisma.invoice.create({
      data: {
        agencyId,
        branchId: dto.branchId,
        assessmentId: dto.assessmentId,
        invoiceNumber: generateInvoiceNumber(agency.code, year, seq),
        payerName: dto.payerName,
        payerEmail: dto.payerEmail,
        payerPhone: dto.payerPhone,
        payerTin: dto.payerTin,
        subtotalMinor: subtotal,
        taxMinor: taxTotal,
        totalMinor: subtotal + taxTotal,
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
        dueAt: new Date(Date.now() + ttlHours * 3600_000),
        lines: { create: lines },
      },
      include: { lines: { include: { revenueType: true, taxType: true } } },
    });

    await this.audit.log({
      agencyId,
      actorId: actor.id,
      action: AuditAction.INVOICE,
      entityType: 'Invoice',
      entityId: invoice.id,
      after: invoice,
    });

    if (dto.autoPaymentRequest !== false) {
      const paymentRequest = await this.payments.createPaymentRequestForInvoice(actor, invoice.id);
      return { ...invoice, paymentRequest };
    }
    return invoice;
  }

  async createFromAssessment(actor: AuthUser, assessmentId: string, dto: CreateInvoiceFromAssessmentDto) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { lines: true },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    this.abac.assertAgencyAccess(actor, assessment.agencyId);
    if (assessment.status !== AssessmentStatus.APPROVED) {
      throw new BadRequestException('Only approved assessments can be invoiced');
    }

    const invoice = await this.create(actor, {
      agencyId: assessment.agencyId,
      assessmentId: assessment.id,
      branchId: assessment.branchId ?? undefined,
      payerName: assessment.payerName,
      payerEmail: assessment.payerEmail ?? undefined,
      payerPhone: assessment.payerPhone ?? undefined,
      payerTin: assessment.payerTin ?? undefined,
      dueInHours: dto.dueInHours,
      lines: assessment.lines.map((l) => ({
        revenueTypeId: l.revenueTypeId,
        taxTypeId: l.taxTypeId ?? undefined,
        description: l.description,
        quantity: Number(l.quantity),
        unitAmountMinor: l.unitAmountMinor,
      })),
      autoPaymentRequest: true,
    });

    await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: AssessmentStatus.INVOICED },
    });

    return invoice;
  }

  async list(actor: AuthUser, agencyId?: string) {
    const resolved = await this.abac.resolveAgencyIdAsync(actor, agencyId);
    return this.prisma.invoice.findMany({
      where: { agencyId: resolved },
      include: {
        lines: { include: { revenueType: true, taxType: true } },
        paymentRequests: { include: { virtualAccount: true, paymentLink: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getOne(actor: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: { include: { revenueType: true, taxType: true } },
        paymentRequests: { include: { virtualAccount: true, paymentLink: true, payments: true } },
        receipts: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    this.abac.assertAgencyAccess(actor, invoice.agencyId);
    return invoice;
  }

  async update(actor: AuthUser, id: string, dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Invoice not found');
    this.abac.assertAgencyAccess(actor, existing.agencyId);
    this.assertMutable(existing);

    let linePayload:
      | {
          lines: Awaited<ReturnType<InvoiceService['buildLines']>>['lines'];
          subtotal: number;
          taxTotal: number;
          total: number;
        }
      | undefined;

    if (dto.lines?.length) {
      linePayload = await this.buildLines(existing.agencyId, dto.lines);
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      if (linePayload) {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLine.createMany({
          data: linePayload.lines.map((l) => ({ ...l, invoiceId: id })),
        });
      }

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          payerName: dto.payerName ?? undefined,
          payerEmail: dto.payerEmail,
          payerPhone: dto.payerPhone,
          payerTin: dto.payerTin,
          branchId: dto.branchId,
          ...(linePayload
            ? {
                subtotalMinor: linePayload.subtotal,
                taxMinor: linePayload.taxTotal,
                totalMinor: linePayload.total,
              }
            : {}),
        },
        include: {
          lines: { include: { revenueType: true, taxType: true } },
          paymentRequests: true,
        },
      });

      if (linePayload) {
        await tx.paymentRequest.updateMany({
          where: {
            invoiceId: id,
            status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
          },
          data: { amountMinor: linePayload.total },
        });
      }

      return updated;
    });

    await this.audit.log({
      agencyId: existing.agencyId,
      actorId: actor.id,
      action: AuditAction.INVOICE,
      entityType: 'Invoice',
      entityId: id,
      before: existing,
      after: invoice,
    });

    return invoice;
  }

  async cancel(actor: AuthUser, id: string, dto: CancelInvoiceDto = {}) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Invoice not found');
    this.abac.assertAgencyAccess(actor, existing.agencyId);
    this.assertMutable(existing);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.CANCELLED,
          notes: dto.reason
            ? [existing.notes, `Cancelled: ${dto.reason}`].filter(Boolean).join('\n')
            : existing.notes,
        },
        include: {
          lines: { include: { revenueType: true, taxType: true } },
          paymentRequests: true,
        },
      });

      await tx.paymentRequest.updateMany({
        where: {
          invoiceId: id,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        },
        data: { status: PaymentStatus.EXPIRED },
      });

      return updated;
    });

    await this.audit.log({
      agencyId: existing.agencyId,
      actorId: actor.id,
      action: AuditAction.INVOICE,
      entityType: 'Invoice',
      entityId: id,
      before: existing,
      after: { status: InvoiceStatus.CANCELLED, reason: dto.reason ?? null },
    });

    return invoice;
  }
}
