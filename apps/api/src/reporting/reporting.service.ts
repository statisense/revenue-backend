import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AssessmentStatus,
  PaymentStatus,
  InvoiceStatus,
  SettlementStatus,
} from '@revenue/database';
import { PrismaService } from '../prisma/prisma.service';
import { AbacService } from '../common/services/abac.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { REPORT_CATALOG, type ReportPackId } from './report-catalog';

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abac: AbacService,
  ) {}

  private async agencyFilter(actor: AuthUser, agencyId?: string) {
    return this.abac.resolveAgencyIdAsync(actor, agencyId);
  }

  private range(period: string, anchor = new Date()) {
    const end = new Date(anchor);
    const start = new Date(anchor);
    switch (period) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        start.setDate(end.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'quarterly': {
        const q = Math.floor(end.getMonth() / 3) * 3;
        start.setMonth(q, 1);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'annual':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        break;
      default:
        start.setHours(0, 0, 0, 0);
    }
    return { start, end };
  }

  private priorRange(period: string, currentStart: Date, currentEnd: Date) {
    const ms = currentEnd.getTime() - currentStart.getTime();
    const end = new Date(currentStart.getTime() - 1);
    const start = new Date(end.getTime() - ms);
    return { start, end, period };
  }

  private dayKey(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  private daysBetween(from: Date, to: Date) {
    return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
  }

  private agingBucket(daysPastDue: number) {
    if (daysPastDue <= 30) return '0-30';
    if (daysPastDue <= 60) return '31-60';
    if (daysPastDue <= 90) return '61-90';
    return '90+';
  }

  catalog() {
    return REPORT_CATALOG;
  }

  async resolveAgencyMeta(actor: AuthUser, agencyId?: string) {
    const resolved = await this.agencyFilter(actor, agencyId);
    const agency = await this.prisma.agency.findUnique({
      where: { id: resolved },
      select: { id: true, code: true, name: true, shortName: true, defaultCurrency: true },
    });
    return {
      resolved,
      agency: agency ?? {
        id: resolved,
        code: 'NGRS',
        name: 'Nigeria Government Revenue System',
        shortName: 'NGRS',
        defaultCurrency: 'NGN',
      },
    };
  }

  private packMeta(
    pack: (typeof REPORT_CATALOG)[number],
    agency: { code: string; name: string; shortName?: string | null; defaultCurrency?: string },
    period: string,
    start: Date,
    end: Date,
  ) {
    return {
      type: pack.id,
      code: pack.code,
      title: pack.title,
      subtitle: pack.subtitle,
      category: pack.category,
      audience: pack.audience,
      standards: pack.standards,
      agency: {
        code: agency.code === 'NCS' ? 'NGRS' : agency.code,
        name: /customs/i.test(agency.name)
          ? 'Nigeria Government Revenue System'
          : agency.name,
        shortName:
          agency.shortName === 'NCS' || !agency.shortName
            ? 'NGRS'
            : agency.shortName,
      },
      period,
      start,
      end,
      generatedAt: new Date(),
      currency: agency.defaultCurrency ?? 'NGN',
      classification: 'OFFICIAL — FOR INTERNAL USE',
    };
  }

  async reportPack(actor: AuthUser, type: string, period: string, agencyId?: string) {
    const known = REPORT_CATALOG.find((r) => r.id === type);
    if (!known) {
      throw new BadRequestException(
        `Unknown report type "${type}". Valid: ${REPORT_CATALOG.map((r) => r.id).join(', ')}`,
      );
    }
    switch (type as ReportPackId) {
      case 'collection':
        return this.collectionReport(actor, period, agencyId);
      case 'aged-receivables':
        return this.agedReceivablesReport(actor, period, agencyId);
      case 'cash-receipts':
        return this.cashReceiptsReport(actor, period, agencyId);
      case 'revenue-gl':
        return this.revenueGlReport(actor, period, agencyId);
      case 'treasury-settlement':
        return this.treasurySettlementReport(actor, period, agencyId);
      case 'refunds':
        return this.refundsReport(actor, period, agencyId);
      case 'payment-channels':
        return this.paymentChannelsReport(actor, period, agencyId);
      case 'officer-productivity':
        return this.officerProductivityReport(actor, period, agencyId);
      case 'branch-comparative':
        return this.branchComparativeReport(actor, period, agencyId);
      default:
        throw new BadRequestException(`Unhandled report type "${type}"`);
    }
  }

  async dashboard(actor: AuthUser, agencyId?: string) {
    const resolved = await this.agencyFilter(actor, agencyId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const basePayment = { agencyId: resolved, status: PaymentStatus.PAID };

    const [
      todayAgg,
      monthAgg,
      pending,
      paid,
      failed,
      expired,
      refunds,
      outstanding,
      topSources,
      settlementsPending,
      paymentsTotal,
      paidRequests,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { ...basePayment, paidAt: { gte: todayStart } },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { ...basePayment, paidAt: { gte: monthStart } },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.prisma.paymentRequest.count({
        where: { agencyId: resolved, status: PaymentStatus.PENDING },
      }),
      this.prisma.paymentRequest.count({
        where: { agencyId: resolved, status: PaymentStatus.PAID },
      }),
      this.prisma.paymentRequest.count({
        where: { agencyId: resolved, status: PaymentStatus.FAILED },
      }),
      this.prisma.paymentRequest.count({
        where: { agencyId: resolved, status: PaymentStatus.EXPIRED },
      }),
      this.prisma.refund.aggregate({
        where: { payment: { agencyId: resolved } },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: {
          agencyId: resolved,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID] },
        },
        _sum: { totalMinor: true },
        _count: true,
      }),
      this.prisma.invoiceLine.groupBy({
        by: ['revenueTypeId'],
        where: { invoice: { agencyId: resolved, status: InvoiceStatus.PAID } },
        _sum: { lineTotalMinor: true },
        orderBy: { _sum: { lineTotalMinor: 'desc' } },
        take: 5,
      }),
      this.prisma.settlement.count({
        where: { agencyId: resolved, status: SettlementStatus.PENDING },
      }),
      this.prisma.paymentRequest.count({ where: { agencyId: resolved } }),
      this.prisma.paymentRequest.count({
        where: { agencyId: resolved, status: PaymentStatus.PAID },
      }),
    ]);

    const revenueTypes = await this.prisma.revenueType.findMany({
      where: { id: { in: topSources.map((t) => t.revenueTypeId) } },
    });

    return {
      todaysRevenue: todayAgg._sum.amountMinor ?? 0,
      todaysCount: todayAgg._count,
      monthlyRevenue: monthAgg._sum.amountMinor ?? 0,
      monthlyCount: monthAgg._count,
      agencyId: resolved,
      pendingPayments: pending,
      paid,
      failed,
      expired,
      refunds: {
        count: refunds._count,
        amountMinor: refunds._sum.amountMinor ?? 0,
      },
      outstanding: {
        count: outstanding._count,
        amountMinor: outstanding._sum.totalMinor ?? 0,
      },
      topRevenueSources: topSources.map((s) => ({
        revenueTypeId: s.revenueTypeId,
        name: revenueTypes.find((r) => r.id === s.revenueTypeId)?.name ?? s.revenueTypeId,
        amountMinor: s._sum.lineTotalMinor ?? 0,
      })),
      paymentConversion:
        paymentsTotal === 0 ? 0 : Number(((paidRequests / paymentsTotal) * 100).toFixed(2)),
      settlementStatus: {
        pending: settlementsPending,
      },
    };
  }

  async periodReport(actor: AuthUser, period: string, agencyId?: string) {
    const resolved = await this.agencyFilter(actor, agencyId);
    const { start, end } = this.range(period);
    const payments = await this.prisma.payment.findMany({
      where: {
        agencyId: resolved,
        status: PaymentStatus.PAID,
        paidAt: { gte: start, lte: end },
      },
      include: { invoice: true },
      orderBy: { paidAt: 'asc' },
    });
    const totalMinor = payments.reduce((s, p) => s + p.amountMinor, 0);
    return {
      period,
      start,
      end,
      count: payments.length,
      totalMinor,
      payments,
    };
  }

  /** Full industry-style collection performance pack for the reports console. */
  async collectionReport(actor: AuthUser, period: string, agencyId?: string) {
    const resolved = await this.agencyFilter(actor, agencyId);
    const { start, end } = this.range(period);
    const prior = this.priorRange(period, start, end);

    const agency = await this.prisma.agency.findUnique({
      where: { id: resolved },
      select: { id: true, code: true, name: true, shortName: true, defaultCurrency: true },
    });

    const [
      paidPayments,
      priorPaid,
      outstanding,
      pendingRequests,
      refunds,
      settlementsPending,
      requestStatusGroups,
      paidInvoices,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          agencyId: resolved,
          status: PaymentStatus.PAID,
          paidAt: { gte: start, lte: end },
        },
        include: {
          invoice: { select: { invoiceNumber: true, payerName: true, branchId: true } },
          paymentRequest: { select: { paymentCode: true, provider: true } },
        },
        orderBy: { paidAt: 'asc' },
      }),
      this.prisma.payment.aggregate({
        where: {
          agencyId: resolved,
          status: PaymentStatus.PAID,
          paidAt: { gte: prior.start, lte: prior.end },
        },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.prisma.invoice.aggregate({
        where: {
          agencyId: resolved,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID] },
        },
        _sum: { totalMinor: true },
        _count: true,
      }),
      this.prisma.paymentRequest.aggregate({
        where: { agencyId: resolved, status: PaymentStatus.PENDING },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.prisma.refund.aggregate({
        where: {
          payment: { agencyId: resolved },
          createdAt: { gte: start, lte: end },
        },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.prisma.settlement.count({
        where: { agencyId: resolved, status: SettlementStatus.PENDING },
      }),
      this.prisma.paymentRequest.groupBy({
        by: ['status'],
        where: { agencyId: resolved, createdAt: { gte: start, lte: end } },
        _count: true,
        _sum: { amountMinor: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          agencyId: resolved,
          status: InvoiceStatus.PAID,
          OR: [{ paidAt: { gte: start, lte: end } }, { updatedAt: { gte: start, lte: end } }],
        },
        include: {
          lines: { include: { revenueType: true } },
          branch: true,
        },
      }),
    ]);

    const collectedMinor = paidPayments.reduce((s, p) => s + p.amountMinor, 0);
    const collectedCount = paidPayments.length;
    const priorMinor = priorPaid._sum.amountMinor ?? 0;
    const growthVsPriorPeriodPct =
      priorMinor === 0
        ? collectedMinor > 0
          ? 100
          : 0
        : Number((((collectedMinor - priorMinor) / priorMinor) * 100).toFixed(1));

    // Daily trend
    const trendMap = new Map<string, { amountMinor: number; count: number }>();
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    while (cursor <= endDay) {
      trendMap.set(this.dayKey(cursor), { amountMinor: 0, count: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const p of paidPayments) {
      if (!p.paidAt) continue;
      const key = this.dayKey(new Date(p.paidAt));
      const row = trendMap.get(key) ?? { amountMinor: 0, count: 0 };
      row.amountMinor += p.amountMinor;
      row.count += 1;
      trendMap.set(key, row);
    }
    const trend = [...trendMap.entries()].map(([date, v]) => ({
      date,
      amountMinor: v.amountMinor,
      count: v.count,
    }));

    // By revenue type (from paid invoice lines in period via payments' invoices)
    const typeMap = new Map<string, { name: string; code: string; amountMinor: number; count: number }>();
    for (const inv of paidInvoices) {
      for (const line of inv.lines) {
        const id = line.revenueTypeId;
        const cur = typeMap.get(id) ?? {
          name: line.revenueType?.name ?? id,
          code: line.revenueType?.code ?? '',
          amountMinor: 0,
          count: 0,
        };
        cur.amountMinor += line.lineTotalMinor;
        cur.count += 1;
        typeMap.set(id, cur);
      }
    }
    const byRevenueType = [...typeMap.values()].sort((a, b) => b.amountMinor - a.amountMinor);

    // By branch
    const branchMap = new Map<string, { name: string; amountMinor: number; count: number }>();
    for (const p of paidPayments) {
      const branchId = p.invoice?.branchId ?? 'unassigned';
      const cur = branchMap.get(branchId) ?? {
        name: 'Unassigned',
        amountMinor: 0,
        count: 0,
      };
      cur.amountMinor += p.amountMinor;
      cur.count += 1;
      branchMap.set(branchId, cur);
    }
    const branchIds = [...branchMap.keys()].filter((id) => id !== 'unassigned');
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } } });
    for (const [id, row] of branchMap) {
      if (id === 'unassigned') continue;
      row.name = branches.find((b) => b.id === id)?.name ?? id;
    }
    const byBranch = [...branchMap.values()].sort((a, b) => b.amountMinor - a.amountMinor);

    // By officer (assessments created in period)
    const officerGroups = await this.prisma.assessment.groupBy({
      by: ['createdById'],
      where: { agencyId: resolved, createdAt: { gte: start, lte: end } },
      _sum: { totalMinor: true },
      _count: true,
    });
    const officers = await this.prisma.user.findMany({
      where: { id: { in: officerGroups.map((g) => g.createdById) } },
    });
    const byOfficer = officerGroups
      .map((g) => {
        const u = officers.find((x) => x.id === g.createdById);
        return {
          officerId: g.createdById,
          name: u ? `${u.firstName} ${u.lastName}` : g.createdById,
          assessments: g._count,
          amountMinor: g._sum.totalMinor ?? 0,
        };
      })
      .sort((a, b) => b.amountMinor - a.amountMinor);

    // Top payers
    const payerMap = new Map<string, { payerName: string; amountMinor: number; count: number }>();
    for (const p of paidPayments) {
      const name = p.invoice?.payerName || 'Unknown payer';
      const cur = payerMap.get(name) ?? { payerName: name, amountMinor: 0, count: 0 };
      cur.amountMinor += p.amountMinor;
      cur.count += 1;
      payerMap.set(name, cur);
    }
    const topPayers = [...payerMap.values()].sort((a, b) => b.amountMinor - a.amountMinor).slice(0, 10);

    const statusMix = requestStatusGroups.map((g) => ({
      status: g.status,
      count: g._count,
      amountMinor: g._sum.amountMinor ?? 0,
    }));

    const recentCollections = [...paidPayments]
      .reverse()
      .slice(0, 25)
      .map((p) => ({
        id: p.id,
        paidAt: p.paidAt,
        amountMinor: p.amountMinor,
        currency: p.currency,
        payerName: p.invoice?.payerName ?? '—',
        invoiceNumber: p.invoice?.invoiceNumber ?? '—',
        paymentCode: p.paymentRequest?.paymentCode ?? '—',
        provider: p.provider ?? p.paymentRequest?.provider ?? null,
        providerRef: p.providerRef,
      }));

    const totalRequestsInPeriod = statusMix.reduce((s, r) => s + r.count, 0);
    const paidRequestsInPeriod = statusMix.find((s) => s.status === PaymentStatus.PAID)?.count ?? 0;

    return {
      meta: {
        ...this.packMeta(
          REPORT_CATALOG.find((r) => r.id === 'collection')!,
          agency ?? {
            code: 'NGRS',
            name: 'Nigeria Government Revenue System',
            shortName: 'NGRS',
            defaultCurrency: 'NGN',
          },
          period,
          start,
          end,
        ),
      },
      kpis: {
        collectedMinor,
        collectedCount,
        outstandingMinor: outstanding._sum.totalMinor ?? 0,
        outstandingCount: outstanding._count,
        pendingMinor: pendingRequests._sum.amountMinor ?? 0,
        pendingCount: pendingRequests._count,
        averageTicketMinor: collectedCount ? Math.round(collectedMinor / collectedCount) : 0,
        conversionRate:
          totalRequestsInPeriod === 0
            ? 0
            : Number(((paidRequestsInPeriod / totalRequestsInPeriod) * 100).toFixed(1)),
        refundsMinor: refunds._sum.amountMinor ?? 0,
        refundsCount: refunds._count,
        settlementsPending,
        priorCollectedMinor: priorMinor,
        priorCollectedCount: priorPaid._count,
        growthVsPriorPeriodPct,
      },
      trend,
      byRevenueType,
      byBranch,
      byOfficer,
      statusMix,
      topPayers,
      recentCollections,
    };
  }

  /** AR aging schedule — outstanding invoices by days past due. */
  async agedReceivablesReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);
    const asOf = end;

    const invoices = await this.prisma.invoice.findMany({
      where: {
        agencyId: resolved,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID] },
      },
      include: {
        branch: { select: { name: true, code: true } },
        lines: { include: { revenueType: { select: { name: true, code: true } } } },
      },
      orderBy: { dueAt: 'asc' },
    });

    const buckets: Record<string, { label: string; count: number; amountMinor: number }> = {
      '0-30': { label: 'Current / 0–30 days', count: 0, amountMinor: 0 },
      '31-60': { label: '31–60 days', count: 0, amountMinor: 0 },
      '61-90': { label: '61–90 days', count: 0, amountMinor: 0 },
      '90+': { label: 'Over 90 days', count: 0, amountMinor: 0 },
    };

    const rows = invoices.map((inv) => {
      const balanceMinor = Math.max(0, inv.totalMinor - inv.amountPaidMinor);
      const anchor = inv.dueAt ?? inv.issuedAt ?? inv.createdAt;
      const daysPastDue = this.daysBetween(new Date(anchor), asOf);
      const bucket = this.agingBucket(daysPastDue);
      buckets[bucket].count += 1;
      buckets[bucket].amountMinor += balanceMinor;
      return {
        invoiceNumber: inv.invoiceNumber,
        payerName: inv.payerName,
        status: inv.status,
        branch: inv.branch?.name ?? 'Unassigned',
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        totalMinor: inv.totalMinor,
        amountPaidMinor: inv.amountPaidMinor,
        balanceMinor,
        daysPastDue,
        bucket,
        primaryRevenueType: inv.lines[0]?.revenueType?.name ?? '—',
      };
    });

    const totalOutstanding = rows.reduce((s, r) => s + r.balanceMinor, 0);
    const pack = REPORT_CATALOG.find((r) => r.id === 'aged-receivables')!;

    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        outstandingCount: rows.length,
        outstandingMinor: totalOutstanding,
        currentMinor: buckets['0-30'].amountMinor,
        days31to60Minor: buckets['31-60'].amountMinor,
        days61to90Minor: buckets['61-90'].amountMinor,
        over90Minor: buckets['90+'].amountMinor,
        overdueSharePct:
          totalOutstanding === 0
            ? 0
            : Number(
                (
                  ((buckets['31-60'].amountMinor +
                    buckets['61-90'].amountMinor +
                    buckets['90+'].amountMinor) /
                    totalOutstanding) *
                  100
                ).toFixed(1),
              ),
      },
      buckets: Object.entries(buckets).map(([id, b]) => ({
        id,
        ...b,
        sharePct:
          totalOutstanding === 0
            ? 0
            : Number(((b.amountMinor / totalOutstanding) * 100).toFixed(1)),
      })),
      rows: rows.sort((a, b) => b.daysPastDue - a.daysPastDue),
    };
  }

  /** Cash receipts journal — confirmed PAID payments in period. */
  async cashReceiptsReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);

    const payments = await this.prisma.payment.findMany({
      where: {
        agencyId: resolved,
        status: PaymentStatus.PAID,
        paidAt: { gte: start, lte: end },
      },
      include: {
        invoice: { select: { invoiceNumber: true, payerName: true, branchId: true } },
        paymentRequest: { select: { paymentCode: true } },
        receipt: { select: { receiptNumber: true, issuedAt: true } },
      },
      orderBy: { paidAt: 'asc' },
    });

    const branchIds = [
      ...new Set(payments.map((p) => p.invoice?.branchId).filter(Boolean) as string[]),
    ];
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } } });
    const branchName = (id?: string | null) =>
      id ? (branches.find((b) => b.id === id)?.name ?? id) : 'Unassigned';

    const byDay = new Map<string, { amountMinor: number; count: number }>();
    const rows = payments.map((p) => {
      const day = p.paidAt ? this.dayKey(new Date(p.paidAt)) : 'unknown';
      const cur = byDay.get(day) ?? { amountMinor: 0, count: 0 };
      cur.amountMinor += p.amountMinor;
      cur.count += 1;
      byDay.set(day, cur);
      return {
        paidAt: p.paidAt,
        receiptNumber: p.receipt?.receiptNumber ?? '—',
        paymentCode: p.paymentRequest?.paymentCode ?? '—',
        invoiceNumber: p.invoice?.invoiceNumber ?? '—',
        payerName: p.payerName || p.invoice?.payerName || '—',
        method: p.method,
        provider: p.provider,
        providerRef: p.providerRef,
        branch: branchName(p.invoice?.branchId),
        amountMinor: p.amountMinor,
        currency: p.currency,
      };
    });

    const totalMinor = rows.reduce((s, r) => s + r.amountMinor, 0);
    const pack = REPORT_CATALOG.find((r) => r.id === 'cash-receipts')!;

    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        receiptCount: rows.length,
        totalMinor,
        averageTicketMinor: rows.length ? Math.round(totalMinor / rows.length) : 0,
        distinctDays: byDay.size,
      },
      dailyTotals: [...byDay.entries()]
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      rows,
    };
  }

  /** Revenue by type and GL code from paid invoice lines. */
  async revenueGlReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        agencyId: resolved,
        status: InvoiceStatus.PAID,
        OR: [{ paidAt: { gte: start, lte: end } }, { updatedAt: { gte: start, lte: end } }],
      },
      include: {
        lines: {
          include: {
            revenueType: {
              include: { category: { select: { name: true, code: true } } },
            },
          },
        },
      },
    });

    const map = new Map<
      string,
      {
        revenueTypeCode: string;
        revenueTypeName: string;
        glCode: string;
        category: string;
        amountMinor: number;
        lineCount: number;
      }
    >();

    for (const inv of invoices) {
      for (const line of inv.lines) {
        const rt = line.revenueType;
        const key = rt?.id ?? line.revenueTypeId;
        const cur = map.get(key) ?? {
          revenueTypeCode: rt?.code ?? '',
          revenueTypeName: rt?.name ?? line.revenueTypeId,
          glCode: rt?.glCode || 'UNASSIGNED',
          category: rt?.category?.name ?? 'Uncategorised',
          amountMinor: 0,
          lineCount: 0,
        };
        cur.amountMinor += line.lineTotalMinor;
        cur.lineCount += 1;
        map.set(key, cur);
      }
    }

    const lines = [...map.values()].sort((a, b) => b.amountMinor - a.amountMinor);
    const totalMinor = lines.reduce((s, r) => s + r.amountMinor, 0);

    const byGl = new Map<string, { glCode: string; amountMinor: number; lineCount: number }>();
    for (const row of lines) {
      const cur = byGl.get(row.glCode) ?? { glCode: row.glCode, amountMinor: 0, lineCount: 0 };
      cur.amountMinor += row.amountMinor;
      cur.lineCount += row.lineCount;
      byGl.set(row.glCode, cur);
    }

    const pack = REPORT_CATALOG.find((r) => r.id === 'revenue-gl')!;
    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        totalMinor,
        revenueTypeCount: lines.length,
        glAccountCount: byGl.size,
      },
      byGlCode: [...byGl.values()]
        .sort((a, b) => b.amountMinor - a.amountMinor)
        .map((r) => ({
          ...r,
          sharePct: totalMinor === 0 ? 0 : Number(((r.amountMinor / totalMinor) * 100).toFixed(1)),
        })),
      lines: lines.map((r) => ({
        ...r,
        sharePct: totalMinor === 0 ? 0 : Number(((r.amountMinor / totalMinor) * 100).toFixed(1)),
      })),
    };
  }

  /** Treasury settlement / TSA remittance control. */
  async treasurySettlementReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);

    const [settlements, batches, statusGroups] = await Promise.all([
      this.prisma.settlement.findMany({
        where: {
          agencyId: resolved,
          OR: [
            { createdAt: { gte: start, lte: end } },
            { settledAt: { gte: start, lte: end } },
          ],
        },
        include: {
          payment: {
            select: {
              providerRef: true,
              paidAt: true,
              invoice: { select: { invoiceNumber: true, payerName: true } },
            },
          },
          batch: { select: { batchNumber: true, tsaReference: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.settlementBatch.findMany({
        where: {
          agencyId: resolved,
          OR: [
            { createdAt: { gte: start, lte: end } },
            { settledAt: { gte: start, lte: end } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.settlement.groupBy({
        by: ['status'],
        where: { agencyId: resolved },
        _sum: { amountMinor: true },
        _count: true,
      }),
    ]);

    const pendingMinor =
      statusGroups.find((g) => g.status === SettlementStatus.PENDING)?._sum.amountMinor ?? 0;
    const settledMinor =
      statusGroups.find((g) => g.status === SettlementStatus.SETTLED)?._sum.amountMinor ?? 0;
    const periodSettled = settlements
      .filter((s) => s.status === SettlementStatus.SETTLED)
      .reduce((s, r) => s + r.amountMinor, 0);

    const pack = REPORT_CATALOG.find((r) => r.id === 'treasury-settlement')!;
    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        batchCount: batches.length,
        settlementCount: settlements.length,
        periodSettledMinor: periodSettled,
        pendingMinor,
        settledMinorAllTime: settledMinor,
        unsettledCount:
          statusGroups.find((g) => g.status === SettlementStatus.PENDING)?._count ?? 0,
      },
      statusMix: statusGroups.map((g) => ({
        status: g.status,
        count: g._count,
        amountMinor: g._sum.amountMinor ?? 0,
      })),
      batches: batches.map((b) => ({
        batchNumber: b.batchNumber,
        status: b.status,
        totalMinor: b.totalMinor,
        currency: b.currency,
        tsaReference: b.tsaReference,
        settledAt: b.settledAt,
        createdAt: b.createdAt,
      })),
      rows: settlements.map((s) => ({
        id: s.id,
        status: s.status,
        amountMinor: s.amountMinor,
        currency: s.currency,
        tsaAccount: s.tsaAccount,
        settledAt: s.settledAt,
        createdAt: s.createdAt,
        batchNumber: s.batch?.batchNumber ?? '—',
        tsaReference: s.batch?.tsaReference ?? null,
        invoiceNumber: s.payment?.invoice?.invoiceNumber ?? '—',
        payerName: s.payment?.invoice?.payerName ?? '—',
        providerRef: s.payment?.providerRef ?? null,
      })),
    };
  }

  /** Refunds & adjustments register. */
  async refundsReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);

    const refunds = await this.prisma.refund.findMany({
      where: {
        payment: { agencyId: resolved },
        createdAt: { gte: start, lte: end },
      },
      include: {
        payment: {
          select: {
            amountMinor: true,
            provider: true,
            providerRef: true,
            paidAt: true,
            invoice: { select: { invoiceNumber: true, payerName: true } },
            paymentRequest: { select: { paymentCode: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalMinor = refunds.reduce((s, r) => s + r.amountMinor, 0);
    const byStatus = new Map<string, { status: string; count: number; amountMinor: number }>();
    for (const r of refunds) {
      const cur = byStatus.get(r.status) ?? { status: r.status, count: 0, amountMinor: 0 };
      cur.count += 1;
      cur.amountMinor += r.amountMinor;
      byStatus.set(r.status, cur);
    }

    const pack = REPORT_CATALOG.find((r) => r.id === 'refunds')!;
    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        refundCount: refunds.length,
        totalMinor,
        averageMinor: refunds.length ? Math.round(totalMinor / refunds.length) : 0,
      },
      statusMix: [...byStatus.values()],
      rows: refunds.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
        status: r.status,
        reason: r.reason ?? '—',
        amountMinor: r.amountMinor,
        currency: r.currency,
        originalPaymentMinor: r.payment.amountMinor,
        invoiceNumber: r.payment.invoice?.invoiceNumber ?? '—',
        payerName: r.payment.invoice?.payerName ?? '—',
        paymentCode: r.payment.paymentRequest?.paymentCode ?? '—',
        provider: r.payment.provider,
        providerRef: r.providerRef ?? r.payment.providerRef,
      })),
    };
  }

  /** Payment channel / gateway performance. */
  async paymentChannelsReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);

    const payments = await this.prisma.payment.findMany({
      where: {
        agencyId: resolved,
        status: PaymentStatus.PAID,
        paidAt: { gte: start, lte: end },
      },
      select: {
        amountMinor: true,
        method: true,
        provider: true,
        paidAt: true,
      },
    });

    const byProvider = new Map<string, { provider: string; count: number; amountMinor: number }>();
    const byMethod = new Map<string, { method: string; count: number; amountMinor: number }>();
    for (const p of payments) {
      const prov = byProvider.get(p.provider) ?? {
        provider: p.provider,
        count: 0,
        amountMinor: 0,
      };
      prov.count += 1;
      prov.amountMinor += p.amountMinor;
      byProvider.set(p.provider, prov);

      const meth = byMethod.get(p.method) ?? { method: p.method, count: 0, amountMinor: 0 };
      meth.count += 1;
      meth.amountMinor += p.amountMinor;
      byMethod.set(p.method, meth);
    }

    const totalMinor = payments.reduce((s, p) => s + p.amountMinor, 0);
    const pack = REPORT_CATALOG.find((r) => r.id === 'payment-channels')!;

    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        paymentCount: payments.length,
        totalMinor,
        providerCount: byProvider.size,
        methodCount: byMethod.size,
      },
      byProvider: [...byProvider.values()]
        .sort((a, b) => b.amountMinor - a.amountMinor)
        .map((r) => ({
          ...r,
          sharePct: totalMinor === 0 ? 0 : Number(((r.amountMinor / totalMinor) * 100).toFixed(1)),
        })),
      byMethod: [...byMethod.values()]
        .sort((a, b) => b.amountMinor - a.amountMinor)
        .map((r) => ({
          ...r,
          sharePct: totalMinor === 0 ? 0 : Number(((r.amountMinor / totalMinor) * 100).toFixed(1)),
        })),
    };
  }

  /** Officer assessment productivity. */
  async officerProductivityReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);

    const assessments = await this.prisma.assessment.findMany({
      where: { agencyId: resolved, createdAt: { gte: start, lte: end } },
      select: {
        createdById: true,
        status: true,
        totalMinor: true,
        branchId: true,
      },
    });

    const userIds = [...new Set(assessments.map((a) => a.createdById))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    const branchIds = [...new Set(assessments.map((a) => a.branchId).filter(Boolean) as string[])];
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds } } });

    const officerMap = new Map<
      string,
      {
        name: string;
        assessments: number;
        amountMinor: number;
        approved: number;
        pending: number;
        rejected: number;
        invoiced: number;
      }
    >();

    for (const a of assessments) {
      const u = users.find((x) => x.id === a.createdById);
      const cur = officerMap.get(a.createdById) ?? {
        name: u ? `${u.firstName} ${u.lastName}` : a.createdById,
        assessments: 0,
        amountMinor: 0,
        approved: 0,
        pending: 0,
        rejected: 0,
        invoiced: 0,
      };
      cur.assessments += 1;
      cur.amountMinor += a.totalMinor;
      if (a.status === AssessmentStatus.APPROVED) cur.approved += 1;
      if (a.status === AssessmentStatus.PENDING_APPROVAL) cur.pending += 1;
      if (a.status === AssessmentStatus.REJECTED) cur.rejected += 1;
      if (a.status === AssessmentStatus.INVOICED) cur.invoiced += 1;
      officerMap.set(a.createdById, cur);
    }

    const statusMix = Object.values(AssessmentStatus).map((status) => ({
      status,
      count: assessments.filter((a) => a.status === status).length,
      amountMinor: assessments
        .filter((a) => a.status === status)
        .reduce((s, a) => s + a.totalMinor, 0),
    })).filter((r) => r.count > 0);

    const byBranch = new Map<string, { name: string; assessments: number; amountMinor: number }>();
    for (const a of assessments) {
      const id = a.branchId ?? 'unassigned';
      const name =
        id === 'unassigned'
          ? 'Unassigned'
          : (branches.find((b) => b.id === id)?.name ?? id);
      const cur = byBranch.get(id) ?? { name, assessments: 0, amountMinor: 0 };
      cur.assessments += 1;
      cur.amountMinor += a.totalMinor;
      byBranch.set(id, cur);
    }

    const officers = [...officerMap.values()].sort((a, b) => b.amountMinor - a.amountMinor);
    const totalMinor = officers.reduce((s, o) => s + o.amountMinor, 0);
    const pack = REPORT_CATALOG.find((r) => r.id === 'officer-productivity')!;

    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        officerCount: officers.length,
        assessmentCount: assessments.length,
        totalMinor,
        averagePerOfficer: officers.length ? Math.round(totalMinor / officers.length) : 0,
      },
      statusMix,
      byBranch: [...byBranch.values()].sort((a, b) => b.amountMinor - a.amountMinor),
      officers,
    };
  }

  /** Branch / command comparative scorecard. */
  async branchComparativeReport(actor: AuthUser, period: string, agencyId?: string) {
    const { resolved, agency } = await this.resolveAgencyMeta(actor, agencyId);
    const { start, end } = this.range(period);

    const [branches, payments, outstanding, assessments] = await Promise.all([
      this.prisma.branch.findMany({ where: { agencyId: resolved, isActive: true } }),
      this.prisma.payment.findMany({
        where: {
          agencyId: resolved,
          status: PaymentStatus.PAID,
          paidAt: { gte: start, lte: end },
        },
        select: {
          amountMinor: true,
          invoice: { select: { branchId: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          agencyId: resolved,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID] },
        },
        select: {
          branchId: true,
          totalMinor: true,
          amountPaidMinor: true,
        },
      }),
      this.prisma.assessment.groupBy({
        by: ['branchId'],
        where: { agencyId: resolved, createdAt: { gte: start, lte: end } },
        _count: true,
        _sum: { totalMinor: true },
      }),
    ]);

    const collectedMap = new Map<string, number>();
    const collectedCount = new Map<string, number>();
    for (const p of payments) {
      const id = p.invoice?.branchId ?? 'unassigned';
      collectedMap.set(id, (collectedMap.get(id) ?? 0) + p.amountMinor);
      collectedCount.set(id, (collectedCount.get(id) ?? 0) + 1);
    }

    const outstandingMap = new Map<string, { count: number; amountMinor: number }>();
    for (const inv of outstanding) {
      const id = inv.branchId ?? 'unassigned';
      const bal = Math.max(0, inv.totalMinor - inv.amountPaidMinor);
      const cur = outstandingMap.get(id) ?? { count: 0, amountMinor: 0 };
      cur.count += 1;
      cur.amountMinor += bal;
      outstandingMap.set(id, cur);
    }

    const rows = [
      ...branches.map((b) => ({
        branchId: b.id,
        code: b.code,
        name: b.name,
        state: b.state,
        collectedMinor: collectedMap.get(b.id) ?? 0,
        collectedCount: collectedCount.get(b.id) ?? 0,
        outstandingMinor: outstandingMap.get(b.id)?.amountMinor ?? 0,
        outstandingCount: outstandingMap.get(b.id)?.count ?? 0,
        assessments: assessments.find((a) => a.branchId === b.id)?._count ?? 0,
        assessmentValueMinor:
          assessments.find((a) => a.branchId === b.id)?._sum.totalMinor ?? 0,
      })),
    ];

    if (collectedMap.has('unassigned') || outstandingMap.has('unassigned')) {
      rows.push({
        branchId: 'unassigned',
        code: '—',
        name: 'Unassigned',
        state: null as string | null,
        collectedMinor: collectedMap.get('unassigned') ?? 0,
        collectedCount: collectedCount.get('unassigned') ?? 0,
        outstandingMinor: outstandingMap.get('unassigned')?.amountMinor ?? 0,
        outstandingCount: outstandingMap.get('unassigned')?.count ?? 0,
        assessments: assessments.find((a) => a.branchId === null)?._count ?? 0,
        assessmentValueMinor:
          assessments.find((a) => a.branchId === null)?._sum.totalMinor ?? 0,
      });
    }

    rows.sort((a, b) => b.collectedMinor - a.collectedMinor);
    const totalCollected = rows.reduce((s, r) => s + r.collectedMinor, 0);
    const totalOutstanding = rows.reduce((s, r) => s + r.outstandingMinor, 0);
    const pack = REPORT_CATALOG.find((r) => r.id === 'branch-comparative')!;

    return {
      meta: this.packMeta(pack, agency, period, start, end),
      kpis: {
        branchCount: rows.filter((r) => r.branchId !== 'unassigned').length,
        totalCollectedMinor: totalCollected,
        totalOutstandingMinor: totalOutstanding,
        leadingBranch: rows[0]?.name ?? '—',
      },
      rows: rows.map((r) => ({
        ...r,
        collectionSharePct:
          totalCollected === 0
            ? 0
            : Number(((r.collectedMinor / totalCollected) * 100).toFixed(1)),
      })),
    };
  }


  async byRevenueType(actor: AuthUser, agencyId?: string) {
    const resolved = await this.agencyFilter(actor, agencyId);
    const grouped = await this.prisma.invoiceLine.groupBy({
      by: ['revenueTypeId'],
      where: { invoice: { agencyId: resolved, status: InvoiceStatus.PAID } },
      _sum: { lineTotalMinor: true },
      _count: true,
    });
    const types = await this.prisma.revenueType.findMany({
      where: { id: { in: grouped.map((g) => g.revenueTypeId) } },
    });
    return grouped.map((g) => ({
      revenueTypeId: g.revenueTypeId,
      name: types.find((t) => t.id === g.revenueTypeId)?.name,
      code: types.find((t) => t.id === g.revenueTypeId)?.code,
      amountMinor: g._sum.lineTotalMinor ?? 0,
      count: g._count,
    }));
  }

  async byOfficer(actor: AuthUser, agencyId?: string) {
    const resolved = await this.agencyFilter(actor, agencyId);
    const grouped = await this.prisma.assessment.groupBy({
      by: ['createdById'],
      where: { agencyId: resolved },
      _sum: { totalMinor: true },
      _count: true,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.createdById) } },
    });
    return grouped.map((g) => {
      const u = users.find((x) => x.id === g.createdById);
      return {
        officerId: g.createdById,
        name: u ? `${u.firstName} ${u.lastName}` : g.createdById,
        assessments: g._count,
        amountMinor: g._sum.totalMinor ?? 0,
      };
    });
  }

  async byBranch(actor: AuthUser, agencyId?: string) {
    const resolved = await this.agencyFilter(actor, agencyId);
    const grouped = await this.prisma.invoice.groupBy({
      by: ['branchId'],
      where: { agencyId: resolved, status: InvoiceStatus.PAID },
      _sum: { totalMinor: true },
      _count: true,
    });
    const branches = await this.prisma.branch.findMany({
      where: { agencyId: resolved },
    });
    return grouped.map((g) => ({
      branchId: g.branchId,
      name: branches.find((b) => b.id === g.branchId)?.name ?? 'Unassigned',
      amountMinor: g._sum.totalMinor ?? 0,
      count: g._count,
    }));
  }
}
