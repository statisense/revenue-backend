import { createHash } from 'crypto';
import * as argon2 from 'argon2';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PrismaClient,
  SettlementStatus,
} from '@revenue/database';
import { PERMISSIONS } from '@revenue/shared';

const AGENCY_ID = 'ncs-agency';
const ROLE_SUPER = 'ncs-role-super-admin';
const CAT_PORT = 'ncs-cat-port';
const TYPE_WHARF = 'ncs-rt-wharfage';
const TYPE_CARGO = 'ncs-rt-cargo-dues';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * In-process tenant seed used when shell `pnpm seed` is unavailable (e.g. some Railway runtimes).
 * Creates NCS agency, SUPER_ADMIN role, catalog rows, and demo payments for a rich dashboard.
 */
export async function seedTenantDemoData(prisma: PrismaClient): Promise<{
  agencyId: string;
  payments: number;
}> {
  for (const code of PERMISSIONS) {
    const [module] = code.split(':');
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: code,
        module: module ?? 'general',
        description: `Permission ${code}`,
      },
    });
  }

  await prisma.currency.upsert({
    where: { code: 'NGN' },
    update: {},
    create: { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 2 },
  });

  await prisma.agency.upsert({
    where: { code: 'NCS' },
    update: {
      name: 'Nigeria Government Revenue System',
      shortName: 'NGRS',
      status: 'ACTIVE',
      email: 'revenue@ngrs.gov.ng',
    },
    create: {
      id: AGENCY_ID,
      code: 'NCS',
      name: 'Nigeria Government Revenue System',
      shortName: 'NGRS',
      status: 'ACTIVE',
      email: 'revenue@ngrs.gov.ng',
      phone: '+23412700000',
      country: 'NG',
      defaultCurrency: 'NGN',
      paymentCodeStyle: 'AGENCY_DATE_SEQ',
      metadata: { seededBy: 'tenant-demo-seed' },
    },
  });

  const agency = await prisma.agency.findUniqueOrThrow({ where: { code: 'NCS' } });
  const agencyId = agency.id;

  await prisma.branch.createMany({
    data: [
      {
        id: 'ncs-branch-hq',
        agencyId,
        code: 'HQ',
        name: 'Headquarters (Lagos)',
        state: 'Lagos',
      },
      {
        id: 'ncs-branch-apapa',
        agencyId,
        code: 'APAPA',
        name: 'Apapa Port',
        state: 'Lagos',
      },
    ],
    skipDuplicates: true,
  });

  const perms = await prisma.permission.findMany({ select: { id: true } });
  await prisma.role.upsert({
    where: { id: ROLE_SUPER },
    update: { name: 'Super Administrator', code: 'SUPER_ADMIN' },
    create: {
      id: ROLE_SUPER,
      code: 'SUPER_ADMIN',
      name: 'Super Administrator',
      description: 'Full platform access',
      isSystem: true,
      agencyId: null,
    },
  });
  for (const p of perms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: ROLE_SUPER, permissionId: p.id } },
      update: {},
      create: { roleId: ROLE_SUPER, permissionId: p.id },
    });
  }

  const passwordHash = await argon2.hash('ChangeMe@12345');
  await prisma.user.upsert({
    where: { email: 'admin@ncs.gov.ng' },
    update: { isSuperAdmin: true, status: 'ACTIVE' },
    create: {
      id: 'ncs-user-admin',
      email: 'admin@ncs.gov.ng',
      passwordHash,
      firstName: 'Chinedu',
      lastName: 'Adebayo',
      status: 'ACTIVE',
      isSuperAdmin: true,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: 'ncs-user-admin', roleId: ROLE_SUPER } },
    update: {},
    create: { userId: 'ncs-user-admin', roleId: ROLE_SUPER },
  });

  await prisma.revenueCategory.upsert({
    where: { id: CAT_PORT },
    update: { name: 'Port Charges', agencyId },
    create: {
      id: CAT_PORT,
      agencyId,
      code: 'PORT',
      name: 'Port Charges',
    },
  });
  await prisma.revenueType.createMany({
    data: [
      {
        id: TYPE_WHARF,
        agencyId,
        categoryId: CAT_PORT,
        code: 'WHARFAGE',
        name: 'Wharfage Dues',
        isActive: true,
      },
      {
        id: TYPE_CARGO,
        agencyId,
        categoryId: CAT_PORT,
        code: 'CARGO_DUES',
        name: 'Cargo Dues',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.taxType.upsert({
    where: { id: 'ncs-tax-vat' },
    update: { ratePercent: 7.5, name: 'VAT', isActive: true, agencyId },
    create: {
      id: 'ncs-tax-vat',
      agencyId,
      code: 'VAT',
      name: 'Value Added Tax',
      description: 'Federal VAT',
      ratePercent: 7.5,
      isActive: true,
    },
  });
  await prisma.taxType.upsert({
    where: { id: 'ncs-tax-wht' },
    update: { ratePercent: 5, name: 'WHT', isActive: true, agencyId },
    create: {
      id: 'ncs-tax-wht',
      agencyId,
      code: 'WHT',
      name: 'Withholding Tax',
      description: 'Withholding tax on services',
      ratePercent: 5,
      isActive: true,
    },
  });

  const now = new Date();
  const today = new Date(now);
  today.setHours(10, 0, 0, 0);
  const earlierMonth = new Date(now.getFullYear(), now.getMonth(), 3, 12, 0, 0);

  const demoRows: Array<{
    amount: number;
    paidAt: Date;
    status: PaymentStatus;
    revenueTypeId: string;
    label: string;
  }> = [
    { amount: 2_500_000_00, paidAt: today, status: PaymentStatus.PAID, revenueTypeId: TYPE_WHARF, label: 'today-1' },
    { amount: 1_800_000_00, paidAt: today, status: PaymentStatus.PAID, revenueTypeId: TYPE_CARGO, label: 'today-2' },
    { amount: 3_200_000_00, paidAt: earlierMonth, status: PaymentStatus.PAID, revenueTypeId: TYPE_WHARF, label: 'month-1' },
    { amount: 950_000_00, paidAt: earlierMonth, status: PaymentStatus.PAID, revenueTypeId: TYPE_CARGO, label: 'month-2' },
    { amount: 400_000_00, paidAt: earlierMonth, status: PaymentStatus.PENDING, revenueTypeId: TYPE_WHARF, label: 'pending-1' },
    { amount: 120_000_00, paidAt: earlierMonth, status: PaymentStatus.FAILED, revenueTypeId: TYPE_CARGO, label: 'failed-1' },
    { amount: 75_000_00, paidAt: earlierMonth, status: PaymentStatus.EXPIRED, revenueTypeId: TYPE_WHARF, label: 'expired-1' },
  ];

  let i = 0;
  let firstPaidPaymentId: string | null = null;
  for (const row of demoRows) {
    i += 1;
    const invoiceId = `ncs-demo-inv-${row.label}`;
    const prId = `ncs-demo-pr-${row.label}`;
    const payId = `ncs-demo-pay-${row.label}`;
    const code = `NCSDEMO${i.toString().padStart(4, '0')}`;
    const payUrl = `https://pay.example.local/pay/${code}`;

    await prisma.invoice.upsert({
      where: { id: invoiceId },
      update: {},
      create: {
        id: invoiceId,
        agencyId,
        invoiceNumber: `NCS-DEMO-${i.toString().padStart(4, '0')}`,
        payerName: 'Demo Shipping Ltd',
        payerEmail: 'payer@example.com',
        status:
          row.status === PaymentStatus.PAID
            ? InvoiceStatus.PAID
            : row.status === PaymentStatus.PENDING
              ? InvoiceStatus.ISSUED
              : InvoiceStatus.OVERDUE,
        currency: 'NGN',
        subtotalMinor: row.amount,
        taxMinor: 0,
        totalMinor: row.amount,
        amountPaidMinor: row.status === PaymentStatus.PAID ? row.amount : 0,
        issuedAt: row.paidAt,
        dueAt: row.paidAt,
        paidAt: row.status === PaymentStatus.PAID ? row.paidAt : null,
      },
    });

    await prisma.invoiceLine.createMany({
      data: [
        {
          id: `ncs-demo-line-${row.label}`,
          invoiceId,
          revenueTypeId: row.revenueTypeId,
          description: `Demo ${row.label}`,
          quantity: 1,
          unitAmountMinor: row.amount,
          lineTotalMinor: row.amount,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.paymentRequest.upsert({
      where: { id: prId },
      update: {},
      create: {
        id: prId,
        agencyId,
        invoiceId,
        paymentCode: code,
        paymentReference: `NCS-PR-DEMO-${i}`,
        amountMinor: row.amount,
        currency: 'NGN',
        status: row.status,
        hmacToken: sha256(`hmac-${row.label}`),
        qrPayload: payUrl,
        payUrl,
        expiresAt: new Date(row.paidAt.getTime() + 86_400_000),
        paidAt: row.status === PaymentStatus.PAID ? row.paidAt : null,
        provider: PaymentProvider.PAYSTACK,
      },
    });

    if (row.status === PaymentStatus.PAID) {
      await prisma.payment.upsert({
        where: { id: payId },
        update: {},
        create: {
          id: payId,
          agencyId,
          paymentRequestId: prId,
          invoiceId,
          provider: PaymentProvider.PAYSTACK,
          providerRef: `demo_ref_${row.label}_${sha256(row.label).slice(0, 8)}`,
          amountMinor: row.amount,
          currency: 'NGN',
          status: PaymentStatus.PAID,
          method: PaymentMethod.DEBIT_CARD,
          paidAt: row.paidAt,
          payerName: 'Demo Shipping Ltd',
          payerEmail: 'payer@example.com',
        },
      });
      if (!firstPaidPaymentId) firstPaidPaymentId = payId;
    }
  }

  if (firstPaidPaymentId) {
    await prisma.settlement.upsert({
      where: { paymentId: firstPaidPaymentId },
      update: { status: SettlementStatus.PENDING },
      create: {
        id: 'ncs-demo-settlement-pending',
        agencyId,
        paymentId: firstPaidPaymentId,
        amountMinor: 2_500_000_00,
        currency: 'NGN',
        status: SettlementStatus.PENDING,
        tsaAccount: 'NCS-TSA-001',
      },
    });
  }

  const payments = await prisma.payment.count({ where: { agencyId } });
  return { agencyId, payments };
}
