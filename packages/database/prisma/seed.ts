import { createHash } from 'node:crypto';
import {
  PrismaClient,
  PaymentProvider,
  PaymentMethod,
  PaymentStatus,
  AssessmentStatus,
  InvoiceStatus,
  VirtualAccountStatus,
  SettlementStatus,
  NotificationChannel,
  NotificationStatus,
  LinkEventType,
  ApprovalAction,
  LedgerEntryType,
  AuditAction,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { PERMISSIONS } from '@revenue/shared';

const prisma = new PrismaClient();

const AGENCY_ID = 'ncs-agency';
const PASSWORD = 'ChangeMe@12345';
const YEAR = 2026;
const PAY_BASE = (process.env.PAY_URL ?? 'http://localhost:3001').replace(/\/$/, '');

const IDS = {
  branches: {
    hq: 'ncs-branch-hq',
    apapa: 'ncs-branch-apapa',
    tincan: 'ncs-branch-tincan',
    onne: 'ncs-branch-onne',
    calabar: 'ncs-branch-calabar',
    warri: 'ncs-branch-warri',
  },
  roles: {
    SUPER_ADMIN: 'ncs-role-super-admin',
    AGENCY_ADMIN: 'ncs-role-agency-admin',
    REVENUE_OFFICER: 'ncs-role-revenue-officer',
    APPROVER: 'ncs-role-approver',
    AUDITOR: 'ncs-role-auditor',
    TREASURY: 'ncs-role-treasury',
    CASHIER: 'ncs-role-cashier',
  },
  users: {
    admin: 'ncs-user-admin',
    finance: 'ncs-user-finance',
    officerApapa: 'ncs-user-officer-apapa',
    officerTincan: 'ncs-user-officer-tincan',
    approver: 'ncs-user-approver',
    treasury: 'ncs-user-treasury',
    auditor: 'ncs-user-auditor',
    cashier: 'ncs-user-cashier',
  },
  categories: {
    PORT: 'ncs-cat-port',
    CARGO: 'ncs-cat-cargo',
    MARINE: 'ncs-cat-marine',
    ADMIN: 'ncs-cat-admin',
    ENV: 'ncs-cat-env',
    FINES: 'ncs-cat-fines',
  },
  workflow: 'ncs-workflow-assessment',
  apiKey: 'ncs-api-key-integration',
  twoFactor: 'ncs-2fa-admin',
  session: 'ncs-session-officer-apapa',
  refreshToken: 'ncs-refresh-officer-apapa',
} as const;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function clearAgencyData(agencyId: string): Promise<void> {
  const [paymentRequests, invoices, assessments, payments, notifications, workflows, revenueTypes, roles, users] =
    await Promise.all([
      prisma.paymentRequest.findMany({ where: { agencyId }, select: { id: true } }),
      prisma.invoice.findMany({ where: { agencyId }, select: { id: true } }),
      prisma.assessment.findMany({ where: { agencyId }, select: { id: true } }),
      prisma.payment.findMany({ where: { agencyId }, select: { id: true } }),
      prisma.notification.findMany({ where: { agencyId }, select: { id: true } }),
      prisma.approvalWorkflow.findMany({ where: { agencyId }, select: { id: true } }),
      prisma.revenueType.findMany({ where: { agencyId }, select: { id: true } }),
      prisma.role.findMany({
        where: { OR: [{ agencyId }, { id: { in: Object.values(IDS.roles) } }] },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { agencyId },
            { id: { in: Object.values(IDS.users) } },
            { email: { endsWith: '@ncs.gov.ng' } },
          ],
        },
        select: { id: true },
      }),
    ]);

  const prIds = paymentRequests.map((r) => r.id);
  const invoiceIds = invoices.map((r) => r.id);
  const assessmentIds = assessments.map((r) => r.id);
  const paymentIds = payments.map((r) => r.id);
  const notificationIds = notifications.map((r) => r.id);
  const workflowIds = workflows.map((r) => r.id);
  const revenueTypeIds = revenueTypes.map((r) => r.id);
  const roleIds = roles.map((r) => r.id);
  const userIds = users.map((r) => r.id);
  const none = ['__none__'];

  await prisma.notificationDelivery.deleteMany({
    where: { notificationId: { in: notificationIds.length ? notificationIds : none } },
  });
  await prisma.notification.deleteMany({ where: { agencyId } });
  await prisma.linkShareEvent.deleteMany({
    where: { paymentRequestId: { in: prIds.length ? prIds : none } },
  });
  await prisma.auditLog.deleteMany({ where: { agencyId } });
  await prisma.fileObject.deleteMany({ where: { agencyId } });
  await prisma.ledgerEntry.deleteMany({ where: { agencyId } });
  await prisma.refund.deleteMany({
    where: { paymentId: { in: paymentIds.length ? paymentIds : none } },
  });
  await prisma.receipt.deleteMany({ where: { agencyId } });
  await prisma.settlement.deleteMany({ where: { agencyId } });
  await prisma.settlementBatch.deleteMany({ where: { agencyId } });
  await prisma.paymentAttempt.deleteMany({
    where: { paymentRequestId: { in: prIds.length ? prIds : none } },
  });
  await prisma.payment.deleteMany({ where: { agencyId } });
  await prisma.webhookEvent.deleteMany({
    where: { id: { in: ['ncs-webhook-paystack-1', 'ncs-webhook-flutterwave-1'] } },
  });
  await prisma.virtualAccount.deleteMany({ where: { agencyId } });
  await prisma.paymentLink.deleteMany({
    where: { paymentRequestId: { in: prIds.length ? prIds : none } },
  });
  await prisma.paymentRequest.deleteMany({ where: { agencyId } });
  await prisma.invoiceLine.deleteMany({
    where: { invoiceId: { in: invoiceIds.length ? invoiceIds : none } },
  });
  await prisma.invoice.deleteMany({ where: { agencyId } });
  await prisma.approvalActionLog.deleteMany({
    where: { assessmentId: { in: assessmentIds.length ? assessmentIds : none } },
  });
  await prisma.assessmentLine.deleteMany({
    where: { assessmentId: { in: assessmentIds.length ? assessmentIds : none } },
  });
  await prisma.assessment.deleteMany({ where: { agencyId } });
  await prisma.feeSchedule.deleteMany({
    where: { revenueTypeId: { in: revenueTypeIds.length ? revenueTypeIds : none } },
  });
  await prisma.approvalStep.deleteMany({
    where: { workflowId: { in: workflowIds.length ? workflowIds : none } },
  });
  await prisma.approvalWorkflow.deleteMany({ where: { agencyId } });
  await prisma.sequenceCounter.deleteMany({ where: { agencyId } });
  await prisma.tsaMapping.deleteMany({ where: { agencyId } });
  await prisma.gatewayConfig.deleteMany({ where: { agencyId } });
  await prisma.apiKey.deleteMany({ where: { agencyId } });

  if (userIds.length) {
    await prisma.twoFactorSecret.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.officerProfile.deleteMany({ where: { userId: { in: userIds } } });
  }
  await prisma.officerProfile.deleteMany({ where: { agencyId } });

  if (roleIds.length) {
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  }

  await prisma.revenueType.deleteMany({ where: { agencyId } });
  await prisma.revenueCategory.deleteMany({ where: { agencyId } });
  await prisma.taxType.deleteMany({ where: { agencyId } });
  await prisma.branch.deleteMany({ where: { agencyId } });

  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

async function resetNcsForSeed(): Promise<void> {
  // Clear legacy NPA tenant row if present (rename migration from NPA → NCS)
  const legacy = await prisma.agency.findUnique({ where: { code: 'NPA' } });
  if (legacy) {
    await clearAgencyData(legacy.id);
    await prisma.agency.delete({ where: { id: legacy.id } }).catch(() => undefined);
  }

  const existing = await prisma.agency.findUnique({ where: { code: 'NCS' } });
  if (existing) {
    await clearAgencyData(existing.id);
    if (existing.id !== AGENCY_ID) {
      await prisma.agency.delete({ where: { id: existing.id } });
    }
  } else {
    await clearAgencyData(AGENCY_ID);
  }

  // Also clear fixed-id seed rows that may linger without an agency link
  await prisma.webhookEvent.deleteMany({
    where: {
      id: {
        in: [
          'ncs-webhook-paystack-1',
          'ncs-webhook-flutterwave-1',
          'npa-webhook-paystack-1',
          'npa-webhook-flutterwave-1',
        ],
      },
    },
  });
  await prisma.rolePermission.deleteMany({
    where: { roleId: { in: Object.values(IDS.roles) } },
  });
  await prisma.role.deleteMany({ where: { id: { in: Object.values(IDS.roles) } } });

  // Remove leftover users still on old domain
  const legacyUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@npa.gov.ng' } },
    select: { id: true },
  });
  const legacyUserIds = legacyUsers.map((u) => u.id);
  if (legacyUserIds.length) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: legacyUserIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: legacyUserIds } } });
    await prisma.twoFactorSecret.deleteMany({ where: { userId: { in: legacyUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: legacyUserIds } } });
    await prisma.officerProfile.deleteMany({ where: { userId: { in: legacyUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: legacyUserIds } } });
  }
}

async function seedPermissions(): Promise<void> {
  for (const code of PERMISSIONS) {
    const [module] = code.split(':');
    await prisma.permission.upsert({
      where: { code },
      update: { name: code, module: module ?? 'general' },
      create: {
        code,
        name: code,
        module: module ?? 'general',
        description: `Permission ${code}`,
      },
    });
  }
}

async function seedCurrencies(): Promise<void> {
  const currencies = [
    { code: 'NGN', name: 'Nigerian Naira', symbol: 'â‚¦', decimals: 2 },
    { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
    { code: 'EUR', name: 'Euro', symbol: 'â‚¬', decimals: 2 },
    { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { code: c.code },
      update: c,
      create: c,
    });
  }
}

async function seedBanks(): Promise<void> {
  const banks = [
    { code: '058', name: 'Guaranty Trust Bank', nipCode: '058' },
    { code: '011', name: 'First Bank of Nigeria', nipCode: '011' },
    { code: '033', name: 'United Bank for Africa', nipCode: '033' },
    { code: '057', name: 'Zenith Bank', nipCode: '057' },
    { code: '214', name: 'First City Monument Bank', nipCode: '214' },
    { code: '070', name: 'Fidelity Bank', nipCode: '070' },
    { code: '032', name: 'Union Bank of Nigeria', nipCode: '032' },
    { code: '050', name: 'Ecobank Nigeria', nipCode: '050' },
    { code: '076', name: 'Polaris Bank', nipCode: '076' },
    { code: '035', name: 'Wema Bank', nipCode: '035' },
  ];
  for (const b of banks) {
    await prisma.bank.upsert({
      where: { code: b.code },
      update: b,
      create: b,
    });
  }
}

async function seedAgencyAndBranches() {
  const agencyData = {
    name: 'Nigeria Customs',
    shortName: 'NCS',
    status: 'ACTIVE' as const,
    email: 'revenue@customs.gov.ng',
    phone: '+23412700000',
    website: 'https://customs.gov.ng',
    logoUrl: 'https://customs.gov.ng/assets/logo.png',
    address: 'Abuja, Federal Capital Territory',
    state: 'FCT',
    country: 'NG',
    defaultCurrency: 'NGN',
    paymentCodeStyle: 'AGENCY_DATE_SEQ',
    metadata: {
      sector: 'customs',
      regulator: 'Federal Ministry of Finance',
      tin: '01234567-0001',
      commands: ['Apapa', 'Tin Can', 'Onne', 'Calabar', 'Warri'],
    },
  };

  const agency = await prisma.agency.upsert({
    where: { code: 'NCS' },
    update: agencyData,
    create: {
      id: AGENCY_ID,
      code: 'NCS',
      ...agencyData,
    },
  });

  if (agency.id !== AGENCY_ID) {
    throw new Error(
      `NCS agency id is "${agency.id}" but seed expects "${AGENCY_ID}". Re-run after resetNcsForSeed deletes the old row.`,
    );
  }

  const branches = [
    {
      id: IDS.branches.hq,
      code: 'HQ',
      name: 'Headquarters (Lagos)',
      address: '26/28 Marina, Lagos Island',
      state: 'Lagos',
    },
    {
      id: IDS.branches.apapa,
      code: 'APAPA',
      name: 'Apapa Port',
      address: 'Apapa Wharf, Apapa',
      state: 'Lagos',
    },
    {
      id: IDS.branches.tincan,
      code: 'TINCAN',
      name: 'Tin Can Island Port',
      address: 'Tin Can Island, Apapa',
      state: 'Lagos',
    },
    {
      id: IDS.branches.onne,
      code: 'ONNE',
      name: 'Onne Port Complex',
      address: 'Onne Oil & Gas Free Zone',
      state: 'Rivers',
    },
    {
      id: IDS.branches.calabar,
      code: 'CALABAR',
      name: 'Calabar Port',
      address: 'Calabar New Port',
      state: 'Cross River',
    },
    {
      id: IDS.branches.warri,
      code: 'WARRI',
      name: 'Warri Port',
      address: 'Warri Port Complex',
      state: 'Delta',
    },
  ];

  for (const b of branches) {
    await prisma.branch.upsert({
      where: { agencyId_code: { agencyId: AGENCY_ID, code: b.code } },
      update: {
        name: b.name,
        address: b.address,
        state: b.state,
        isActive: true,
      },
      create: {
        id: b.id,
        agencyId: AGENCY_ID,
        code: b.code,
        name: b.name,
        address: b.address,
        state: b.state,
        isActive: true,
      },
    });
  }

  return agency;
}

async function seedRolesAndPermissions() {
  const allPermissions = await prisma.permission.findMany();
  const byCode = new Map(allPermissions.map((p) => [p.code, p.id]));

  const roleDefs: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    agencyId: string | null;
    permissionCodes: string[];
  }> = [
    {
      id: IDS.roles.SUPER_ADMIN,
      code: 'SUPER_ADMIN',
      name: 'Super Administrator',
      description: 'Full platform access across Government revenue systems',
      agencyId: null,
      permissionCodes: [...PERMISSIONS],
    },
    {
      id: IDS.roles.AGENCY_ADMIN,
      code: 'AGENCY_ADMIN',
      name: 'Agency Administrator',
      description: 'NCS finance and configuration administrator',
      agencyId: AGENCY_ID,
      permissionCodes: [...PERMISSIONS],
    },
    {
      id: IDS.roles.REVENUE_OFFICER,
      code: 'REVENUE_OFFICER',
      name: 'Revenue Officer',
      description: 'Creates assessments and invoices at port branches',
      agencyId: AGENCY_ID,
      permissionCodes: [
        'assessments:read',
        'assessments:write',
        'invoices:read',
        'invoices:write',
        'payments:read',
        'revenue:read',
        'receipts:read',
      ],
    },
    {
      id: IDS.roles.APPROVER,
      code: 'APPROVER',
      name: 'Approver',
      description: 'Reviews and approves revenue assessments',
      agencyId: AGENCY_ID,
      permissionCodes: ['assessments:read', 'assessments:approve', 'invoices:read'],
    },
    {
      id: IDS.roles.AUDITOR,
      code: 'AUDITOR',
      name: 'Auditor',
      description: 'Read-only audit and compliance access',
      agencyId: AGENCY_ID,
      permissionCodes: allPermissions.filter((p) => p.code.endsWith(':read')).map((p) => p.code),
    },
    {
      id: IDS.roles.TREASURY,
      code: 'TREASURY',
      name: 'Treasury Officer',
      description: 'Settlements, TSA mapping, and payment reconciliation',
      agencyId: AGENCY_ID,
      permissionCodes: [
        'payments:read',
        'settlements:read',
        'settlements:write',
        'receipts:read',
        'reports:read',
      ],
    },
    {
      id: IDS.roles.CASHIER,
      code: 'CASHIER',
      name: 'Cashier',
      description: 'Counter payments and receipt issuance',
      agencyId: AGENCY_ID,
      permissionCodes: [
        'payments:read',
        'payments:write',
        'invoices:read',
        'receipts:read',
      ],
    },
  ];

  for (const roleDef of roleDefs) {
    await prisma.role.upsert({
      where: { id: roleDef.id },
      update: {
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        agencyId: roleDef.agencyId,
        isSystem: true,
      },
      create: {
        id: roleDef.id,
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        agencyId: roleDef.agencyId,
        isSystem: true,
      },
    });

    for (const code of roleDef.permissionCodes) {
      const permissionId = byCode.get(code);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleDef.id, permissionId } },
        update: {},
        create: { roleId: roleDef.id, permissionId },
      });
    }
  }
}

async function seedUsers(passwordHash: string) {
  const users = [
    {
      id: IDS.users.admin,
      email: 'admin@ncs.gov.ng',
      firstName: 'Chinedu',
      lastName: 'Adebayo',
      phone: '+2348010000001',
      isSuperAdmin: true,
      agencyId: null as string | null,
      roleId: IDS.roles.SUPER_ADMIN,
      profile: null as null | {
        employeeNo: string;
        title: string;
        branchId: string;
      },
    },
    {
      id: IDS.users.finance,
      email: 'admin.finance@ncs.gov.ng',
      firstName: 'Folake',
      lastName: 'Adeyemi',
      phone: '+2348010000002',
      isSuperAdmin: false,
      agencyId: AGENCY_ID,
      roleId: IDS.roles.AGENCY_ADMIN,
      profile: {
        employeeNo: 'ncs-FIN-0001',
        title: 'Director of Finance',
        branchId: IDS.branches.hq,
      },
    },
    {
      id: IDS.users.officerApapa,
      email: 'officer.apapa@ncs.gov.ng',
      firstName: 'Ada',
      lastName: 'Okoro',
      phone: '+2348012345678',
      isSuperAdmin: false,
      agencyId: AGENCY_ID,
      roleId: IDS.roles.REVENUE_OFFICER,
      profile: {
        employeeNo: 'ncs-REV-0142',
        title: 'Senior Revenue Officer',
        branchId: IDS.branches.apapa,
      },
    },
    {
      id: IDS.users.officerTincan,
      email: 'officer.tincan@ncs.gov.ng',
      firstName: 'Ibrahim',
      lastName: 'Bello',
      phone: '+2348023456789',
      isSuperAdmin: false,
      agencyId: AGENCY_ID,
      roleId: IDS.roles.REVENUE_OFFICER,
      profile: {
        employeeNo: 'ncs-REV-0218',
        title: 'Revenue Officer',
        branchId: IDS.branches.tincan,
      },
    },
    {
      id: IDS.users.approver,
      email: 'approver@ncs.gov.ng',
      firstName: 'Ngozi',
      lastName: 'Eze',
      phone: '+2348034567890',
      isSuperAdmin: false,
      agencyId: AGENCY_ID,
      roleId: IDS.roles.APPROVER,
      profile: {
        employeeNo: 'ncs-APR-0007',
        title: 'Principal Approving Officer',
        branchId: IDS.branches.hq,
      },
    },
    {
      id: IDS.users.treasury,
      email: 'treasury@ncs.gov.ng',
      firstName: 'Tunde',
      lastName: 'Okafor',
      phone: '+2348045678901',
      isSuperAdmin: false,
      agencyId: AGENCY_ID,
      roleId: IDS.roles.TREASURY,
      profile: {
        employeeNo: 'ncs-TRS-0003',
        title: 'Treasury Manager',
        branchId: IDS.branches.hq,
      },
    },
    {
      id: IDS.users.auditor,
      email: 'auditor@ncs.gov.ng',
      firstName: 'Aisha',
      lastName: 'Mohammed',
      phone: '+2348056789012',
      isSuperAdmin: false,
      agencyId: AGENCY_ID,
      roleId: IDS.roles.AUDITOR,
      profile: {
        employeeNo: 'ncs-AUD-0011',
        title: 'Internal Auditor',
        branchId: IDS.branches.hq,
      },
    },
    {
      id: IDS.users.cashier,
      email: 'cashier@ncs.gov.ng',
      firstName: 'Emeka',
      lastName: 'Nwosu',
      phone: '+2348067890123',
      isSuperAdmin: false,
      agencyId: AGENCY_ID,
      roleId: IDS.roles.CASHIER,
      profile: {
        employeeNo: 'ncs-CSH-0034',
        title: 'Port Cashier',
        branchId: IDS.branches.apapa,
      },
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        status: UserStatus.ACTIVE,
        isSuperAdmin: u.isSuperAdmin,
        agencyId: u.agencyId,
        emailVerifiedAt: new Date('2026-01-05T09:00:00Z'),
        failedLogins: 0,
        lockedUntil: null,
      },
      create: {
        id: u.id,
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        status: UserStatus.ACTIVE,
        isSuperAdmin: u.isSuperAdmin,
        agencyId: u.agencyId,
        emailVerifiedAt: new Date('2026-01-05T09:00:00Z'),
      },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: u.email } });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: u.roleId } },
      update: {},
      create: { userId: user.id, roleId: u.roleId },
    });

    if (u.profile) {
      await prisma.officerProfile.upsert({
        where: { userId: user.id },
        update: {
          agencyId: AGENCY_ID,
          branchId: u.profile.branchId,
          employeeNo: u.profile.employeeNo,
          title: u.profile.title,
        },
        create: {
          id: `ncs-profile-${user.id}`,
          userId: user.id,
          agencyId: AGENCY_ID,
          branchId: u.profile.branchId,
          employeeNo: u.profile.employeeNo,
          title: u.profile.title,
        },
      });
    }
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@ncs.gov.ng' } });
  const officer = await prisma.user.findUniqueOrThrow({
    where: { email: 'officer.apapa@ncs.gov.ng' },
  });

  await prisma.twoFactorSecret.upsert({
    where: { userId: admin.id },
    update: {
      secretEnc: 'enc:ncs-admin-totp-seed-placeholder',
      enabled: false,
      backupCodes: [
        sha256('ncs-BACKUP-01'),
        sha256('ncs-BACKUP-02'),
        sha256('ncs-BACKUP-03'),
        sha256('ncs-BACKUP-04'),
        sha256('ncs-BACKUP-05'),
      ],
      verifiedAt: null,
    },
    create: {
      id: IDS.twoFactor,
      userId: admin.id,
      secretEnc: 'enc:ncs-admin-totp-seed-placeholder',
      enabled: false,
      backupCodes: [
        sha256('ncs-BACKUP-01'),
        sha256('ncs-BACKUP-02'),
        sha256('ncs-BACKUP-03'),
        sha256('ncs-BACKUP-04'),
        sha256('ncs-BACKUP-05'),
      ],
    },
  });

  const sessionExpires = new Date('2026-12-31T23:59:59Z');
  await prisma.session.upsert({
    where: { id: IDS.session },
    update: {
      userId: officer.id,
      ipAddress: '102.89.23.14',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Government-Revenue/1.0',
      expiresAt: sessionExpires,
      revokedAt: null,
    },
    create: {
      id: IDS.session,
      userId: officer.id,
      ipAddress: '102.89.23.14',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Government-Revenue/1.0',
      expiresAt: sessionExpires,
    },
  });

  const refreshHash = sha256('ncs-dummy-refresh-token-officer-apapa');
  await prisma.refreshToken.upsert({
    where: { tokenHash: refreshHash },
    update: {
      userId: officer.id,
      expiresAt: sessionExpires,
      revokedAt: null,
    },
    create: {
      id: IDS.refreshToken,
      userId: officer.id,
      tokenHash: refreshHash,
      expiresAt: sessionExpires,
    },
  });

  await prisma.apiKey.upsert({
    where: { keyHash: sha256('npa_live_sk_seed_integration_key') },
    update: {
      agencyId: AGENCY_ID,
      userId: admin.id,
      name: 'NCS ERP Integration',
      keyPrefix: 'npa_live',
      scopes: ['assessments:write', 'invoices:read', 'payments:read', 'receipts:read'],
      expiresAt: new Date('2027-12-31T23:59:59Z'),
      revokedAt: null,
    },
    create: {
      id: IDS.apiKey,
      agencyId: AGENCY_ID,
      userId: admin.id,
      name: 'NCS ERP Integration',
      keyPrefix: 'npa_live',
      keyHash: sha256('npa_live_sk_seed_integration_key'),
      scopes: ['assessments:write', 'invoices:read', 'payments:read', 'receipts:read'],
      expiresAt: new Date('2027-12-31T23:59:59Z'),
    },
  });

  return { admin, officer };
}

async function seedRevenueCatalog() {
  const categories = [
    {
      id: IDS.categories.PORT,
      code: 'PORT',
      name: 'Port Charges',
      description: 'Berthage, wharfage and container handling at NCS ports',
    },
    {
      id: IDS.categories.CARGO,
      code: 'CARGO',
      name: 'Cargo Dues',
      description: 'Cargo dues and storage related charges',
    },
    {
      id: IDS.categories.MARINE,
      code: 'MARINE',
      name: 'Marine Services',
      description: 'Pilotage, towage and mooring services',
    },
    {
      id: IDS.categories.ADMIN,
      code: 'ADMIN',
      name: 'Administrative Fees',
      description: 'Documentation, licensing and admin levies',
    },
    {
      id: IDS.categories.ENV,
      code: 'ENV',
      name: 'Environmental Levies',
      description: 'Environmental and waste management levies',
    },
    {
      id: IDS.categories.FINES,
      code: 'FINES',
      name: 'Fines & Penalties',
      description: 'Late payment and regulatory violation fines',
    },
  ];

  for (const c of categories) {
    await prisma.revenueCategory.upsert({
      where: { agencyId_code: { agencyId: AGENCY_ID, code: c.code } },
      update: { name: c.name, description: c.description, isActive: true },
      create: {
        id: c.id,
        agencyId: AGENCY_ID,
        code: c.code,
        name: c.name,
        description: c.description,
        isActive: true,
      },
    });
  }

  const types: Array<{
    id: string;
    categoryCode: keyof typeof IDS.categories;
    code: string;
    name: string;
    glCode: string;
    amountMinor: number;
    feeId: string;
  }> = [
    {
      id: 'ncs-rt-cont-fee',
      categoryCode: 'PORT',
      code: 'CONT_FEE',
      name: 'Container Handling Fee',
      glCode: 'ncs-PORT-1001',
      amountMinor: 25_000_000,
      feeId: 'ncs-fee-cont-fee',
    },
    {
      id: 'ncs-rt-berth',
      categoryCode: 'PORT',
      code: 'BERTH',
      name: 'Berthage Charges',
      glCode: 'ncs-PORT-1002',
      amountMinor: 15_000_000,
      feeId: 'ncs-fee-berth',
    },
    {
      id: 'ncs-rt-wharfage',
      categoryCode: 'PORT',
      code: 'WHARFAGE',
      name: 'Wharfage Dues',
      glCode: 'ncs-PORT-1003',
      amountMinor: 12_000_000,
      feeId: 'ncs-fee-wharfage',
    },
    {
      id: 'ncs-rt-cargo-dues',
      categoryCode: 'CARGO',
      code: 'CARGO_DUES',
      name: 'Cargo Dues',
      glCode: 'ncs-CARGO-2001',
      amountMinor: 20_000_000,
      feeId: 'ncs-fee-cargo-dues',
    },
    {
      id: 'ncs-rt-storage',
      categoryCode: 'CARGO',
      code: 'STORAGE',
      name: 'Cargo Storage Fee',
      glCode: 'ncs-CARGO-2002',
      amountMinor: 7_500_000,
      feeId: 'ncs-fee-storage',
    },
    {
      id: 'ncs-rt-pilot',
      categoryCode: 'MARINE',
      code: 'PILOT',
      name: 'Pilotage Fees',
      glCode: 'ncs-MARINE-3001',
      amountMinor: 8_000_000,
      feeId: 'ncs-fee-pilot',
    },
    {
      id: 'ncs-rt-towage',
      categoryCode: 'MARINE',
      code: 'TOWAGE',
      name: 'Towage Services',
      glCode: 'ncs-MARINE-3002',
      amountMinor: 10_000_000,
      feeId: 'ncs-fee-towage',
    },
    {
      id: 'ncs-rt-mooring',
      categoryCode: 'MARINE',
      code: 'MOORING',
      name: 'Mooring Charges',
      glCode: 'ncs-MARINE-3003',
      amountMinor: 4_500_000,
      feeId: 'ncs-fee-mooring',
    },
    {
      id: 'ncs-rt-doc-fee',
      categoryCode: 'ADMIN',
      code: 'DOC_FEE',
      name: 'Documentation Fee',
      glCode: 'ncs-ADMIN-4001',
      amountMinor: 1_500_000,
      feeId: 'ncs-fee-doc-fee',
    },
    {
      id: 'ncs-rt-license',
      categoryCode: 'ADMIN',
      code: 'LICENSE',
      name: 'Port Operator Licence',
      glCode: 'ncs-ADMIN-4002',
      amountMinor: 5_000_000,
      feeId: 'ncs-fee-license',
    },
    {
      id: 'ncs-rt-env-levy',
      categoryCode: 'ENV',
      code: 'ENV_LEVY',
      name: 'Environmental Levy',
      glCode: 'ncs-ENV-5001',
      amountMinor: 5_000_000,
      feeId: 'ncs-fee-env-levy',
    },
    {
      id: 'ncs-rt-waste',
      categoryCode: 'ENV',
      code: 'WASTE',
      name: 'Ship Waste Reception',
      glCode: 'ncs-ENV-5002',
      amountMinor: 3_000_000,
      feeId: 'ncs-fee-waste',
    },
    {
      id: 'ncs-rt-late-fine',
      categoryCode: 'FINES',
      code: 'LATE_FINE',
      name: 'Late Payment Fine',
      glCode: 'ncs-FINE-6001',
      amountMinor: 2_500_000,
      feeId: 'ncs-fee-late-fine',
    },
    {
      id: 'ncs-rt-violation',
      categoryCode: 'FINES',
      code: 'VIOLATION',
      name: 'Regulatory Violation Penalty',
      glCode: 'ncs-FINE-6002',
      amountMinor: 10_000_000,
      feeId: 'ncs-fee-violation',
    },
  ];

  const typeByCode = new Map<string, { id: string; amountMinor: number }>();

  for (const t of types) {
    const category = await prisma.revenueCategory.findUniqueOrThrow({
      where: { agencyId_code: { agencyId: AGENCY_ID, code: t.categoryCode } },
    });

    const rt = await prisma.revenueType.upsert({
      where: { agencyId_code: { agencyId: AGENCY_ID, code: t.code } },
      update: {
        name: t.name,
        categoryId: category.id,
        glCode: t.glCode,
        isActive: true,
      },
      create: {
        id: t.id,
        agencyId: AGENCY_ID,
        categoryId: category.id,
        code: t.code,
        name: t.name,
        description: `${t.name} under ${t.categoryCode}`,
        glCode: t.glCode,
        isActive: true,
      },
    });

    await prisma.feeSchedule.upsert({
      where: { id: t.feeId },
      update: {
        revenueTypeId: rt.id,
        name: '2026 Standard Tariff',
        amountMinor: t.amountMinor,
        currency: 'NGN',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        effectiveTo: null,
        isActive: true,
      },
      create: {
        id: t.feeId,
        revenueTypeId: rt.id,
        name: '2026 Standard Tariff',
        amountMinor: t.amountMinor,
        currency: 'NGN',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        isActive: true,
      },
    });

    typeByCode.set(t.code, { id: rt.id, amountMinor: t.amountMinor });
  }

  return typeByCode;
}

/** Nigerian tax types commonly applied in trade / services billing (demo rates). */
async function seedTaxTypes() {
  const taxes: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    ratePercent: number;
  }> = [
    {
      id: 'ncs-tax-vat',
      code: 'VAT',
      name: 'Value Added Tax (VAT)',
      description: 'FIRS VAT at the standard Nigerian rate of 7.5%',
      ratePercent: 7.5,
    },
    {
      id: 'ncs-tax-wht-s',
      code: 'WHT_SERVICES',
      name: 'Withholding Tax — Services',
      description: 'WHT on consultancy and professional services (5%)',
      ratePercent: 5,
    },
    {
      id: 'ncs-tax-wht-c',
      code: 'WHT_CONTRACTS',
      name: 'Withholding Tax — Contracts',
      description: 'WHT on contracts and agency arrangements (5%)',
      ratePercent: 5,
    },
    {
      id: 'ncs-tax-edt',
      code: 'EDT',
      name: 'Tertiary Education Tax',
      description: 'Education Tax (EDT) levy (2%)',
      ratePercent: 2,
    },
    {
      id: 'ncs-tax-nitda',
      code: 'NITDA',
      name: 'NITDA Levy',
      description: 'National Information Technology Development Agency levy (1%)',
      ratePercent: 1,
    },
    {
      id: 'ncs-tax-ciss',
      code: 'CISS',
      name: 'Comprehensive Import Supervision Scheme',
      description: 'CISS / destination inspection related levy (1%)',
      ratePercent: 1,
    },
    {
      id: 'ncs-tax-ecowas',
      code: 'ECOWAS',
      name: 'ECOWAS Community Levy',
      description: 'ECOWAS Trade Liberalisation / community levy (0.5%)',
      ratePercent: 0.5,
    },
    {
      id: 'ncs-tax-stamp',
      code: 'STAMP',
      name: 'Stamp Duty (ad valorem)',
      description: 'Ad valorem stamp duty on dutiable instruments (0.15%)',
      ratePercent: 0.15,
    },
    {
      id: 'ncs-tax-naseni',
      code: 'NASENI',
      name: 'NASENI Levy',
      description: 'National Agency for Science and Engineering Infrastructure levy (0.25%)',
      ratePercent: 0.25,
    },
    {
      id: 'ncs-tax-exempt',
      code: 'EXEMPT',
      name: 'Tax Exempt',
      description: 'Zero-rated / exempt supplies — no tax applied',
      ratePercent: 0,
    },
  ];

  for (const t of taxes) {
    await prisma.taxType.upsert({
      where: { agencyId_code: { agencyId: AGENCY_ID, code: t.code } },
      update: {
        name: t.name,
        description: t.description,
        ratePercent: t.ratePercent,
        isActive: true,
      },
      create: {
        id: t.id,
        agencyId: AGENCY_ID,
        code: t.code,
        name: t.name,
        description: t.description,
        ratePercent: t.ratePercent,
        isActive: true,
      },
    });
  }
}

async function seedWorkflowsSequencesGateways() {
  await prisma.approvalWorkflow.upsert({
    where: { id: IDS.workflow },
    update: {
      agencyId: AGENCY_ID,
      name: 'Assessment Dual Approval',
      entityType: 'ASSESSMENT',
      isActive: true,
    },
    create: {
      id: IDS.workflow,
      agencyId: AGENCY_ID,
      name: 'Assessment Dual Approval',
      entityType: 'ASSESSMENT',
      isActive: true,
    },
  });

  const steps = [
    {
      id: 'ncs-step-1',
      stepOrder: 1,
      name: 'Supervisor Review',
      roleCode: 'APPROVER',
      minApprovers: 1,
    },
    {
      id: 'ncs-step-2',
      stepOrder: 2,
      name: 'Finance Authorization',
      roleCode: 'AGENCY_ADMIN',
      minApprovers: 1,
    },
  ];

  for (const s of steps) {
    await prisma.approvalStep.upsert({
      where: { workflowId_stepOrder: { workflowId: IDS.workflow, stepOrder: s.stepOrder } },
      update: { name: s.name, roleCode: s.roleCode, minApprovers: s.minApprovers },
      create: {
        id: s.id,
        workflowId: IDS.workflow,
        stepOrder: s.stepOrder,
        name: s.name,
        roleCode: s.roleCode,
        minApprovers: s.minApprovers,
      },
    });
  }

  const sequences = [
    { id: 'ncs-seq-assessment', name: 'ASSESSMENT', value: 5 },
    { id: 'ncs-seq-invoice', name: 'INVOICE', value: 5 },
    { id: 'ncs-seq-payment-code', name: 'PAYMENT_CODE', value: 5 },
    { id: 'ncs-seq-receipt', name: 'RECEIPT', value: 2 },
    { id: 'ncs-seq-settlement-batch', name: 'SETTLEMENT_BATCH', value: 2 },
  ];

  for (const seq of sequences) {
    await prisma.sequenceCounter.upsert({
      where: {
        agencyId_name_year_month: {
          agencyId: AGENCY_ID,
          name: seq.name,
          year: YEAR,
          month: 0,
        },
      },
      update: { value: seq.value },
      create: {
        id: seq.id,
        agencyId: AGENCY_ID,
        name: seq.name,
        year: YEAR,
        month: 0,
        value: seq.value,
      },
    });
  }

  for (const provider of [
    PaymentProvider.PAYSTACK,
    PaymentProvider.FLUTTERWAVE,
    PaymentProvider.REMITA,
  ]) {
    await prisma.gatewayConfig.upsert({
      where: { agencyId_provider: { agencyId: AGENCY_ID, provider } },
      update: {
        isActive: true,
        isDefault: provider === PaymentProvider.PAYSTACK,
        publicKey: `${provider}_PK_TEST_NPA`,
        secretKeyEnc: `enc:${provider}_SK_TEST_NPA`,
        webhookSecretEnc: `enc:${provider}_WHSEC_NPA`,
        metadata: { mode: 'test', agency: 'NCS' },
      },
      create: {
        id: `ncs-gateway-${provider.toLowerCase()}`,
        agencyId: AGENCY_ID,
        provider,
        isActive: true,
        isDefault: provider === PaymentProvider.PAYSTACK,
        publicKey: `${provider}_PK_TEST_NPA`,
        secretKeyEnc: `enc:${provider}_SK_TEST_NPA`,
        webhookSecretEnc: `enc:${provider}_WHSEC_NPA`,
        metadata: { mode: 'test', agency: 'NCS' },
      },
    });
  }

  await prisma.tsaMapping.upsert({
    where: { id: 'ncs-tsa-default' },
    update: {
      agencyId: AGENCY_ID,
      revenueTypeCode: null,
      tsaAccountNumber: '0020123456789',
      tsaAccountName: 'NCS Consolidated TSA',
      bankCode: '058',
      isDefault: true,
    },
    create: {
      id: 'ncs-tsa-default',
      agencyId: AGENCY_ID,
      tsaAccountNumber: '0020123456789',
      tsaAccountName: 'NCS Consolidated TSA',
      bankCode: '058',
      isDefault: true,
    },
  });

  const categoryTsa = [
    { id: 'ncs-tsa-port', code: 'PORT', account: '0020123456701', name: 'NCS Port Charges TSA' },
    { id: 'ncs-tsa-cargo', code: 'CARGO', account: '0020123456702', name: 'NCS Cargo Dues TSA' },
    { id: 'ncs-tsa-marine', code: 'MARINE', account: '0020123456703', name: 'NCS Marine Services TSA' },
    { id: 'ncs-tsa-admin', code: 'ADMIN', account: '0020123456704', name: 'NCS Admin Fees TSA' },
    { id: 'ncs-tsa-env', code: 'ENV', account: '0020123456705', name: 'NCS Environmental TSA' },
    { id: 'ncs-tsa-fines', code: 'FINES', account: '0020123456706', name: 'NCS Fines TSA' },
  ];

  for (const m of categoryTsa) {
    await prisma.tsaMapping.upsert({
      where: { id: m.id },
      update: {
        agencyId: AGENCY_ID,
        revenueTypeCode: m.code,
        tsaAccountNumber: m.account,
        tsaAccountName: m.name,
        bankCode: '011',
        isDefault: false,
      },
      create: {
        id: m.id,
        agencyId: AGENCY_ID,
        revenueTypeCode: m.code,
        tsaAccountNumber: m.account,
        tsaAccountName: m.name,
        bankCode: '011',
        isDefault: false,
      },
    });
  }
}

async function seedTransactionalData(
  typeByCode: Map<string, { id: string; amountMinor: number }>,
  actors: { admin: { id: string }; officer: { id: string } },
) {
  const officer = await prisma.user.findUniqueOrThrow({
    where: { email: 'officer.apapa@ncs.gov.ng' },
  });
  const officerTincan = await prisma.user.findUniqueOrThrow({
    where: { email: 'officer.tincan@ncs.gov.ng' },
  });
  const approver = await prisma.user.findUniqueOrThrow({ where: { email: 'approver@ncs.gov.ng' } });
  const finance = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin.finance@ncs.gov.ng' },
  });

  const cont = typeByCode.get('CONT_FEE')!;
  const berth = typeByCode.get('BERTH')!;
  const pilot = typeByCode.get('PILOT')!;
  const cargo = typeByCode.get('CARGO_DUES')!;
  const envLevy = typeByCode.get('ENV_LEVY')!;
  const lateFine = typeByCode.get('LATE_FINE')!;
  const towage = typeByCode.get('TOWAGE')!;
  const docFee = typeByCode.get('DOC_FEE')!;

  const assessments = [
    {
      id: 'ncs-asm-draft',
      number: 'NCS-ASM-2026-000001',
      status: AssessmentStatus.DRAFT,
      payerName: 'Maersk Nigeria Ltd',
      payerEmail: 'billing@maersk.com.ng',
      payerPhone: '+2348091110001',
      payerTin: '12345678-0001',
      branchId: IDS.branches.apapa,
      createdById: officer.id,
      lines: [
        {
          id: 'ncs-asmline-1a',
          revenueTypeId: cont.id,
          description: '40ft container handling — 2 units',
          quantity: 2,
          unitAmountMinor: cont.amountMinor,
        },
      ],
      approvals: [] as Array<{
        id: string;
        actorId: string;
        action: ApprovalAction;
        stepOrder: number;
        comments?: string;
      }>,
      notes: 'Draft assessment pending vessel arrival confirmation',
      currentStep: 0,
    },
    {
      id: 'ncs-asm-pending',
      number: 'NCS-ASM-2026-000002',
      status: AssessmentStatus.PENDING_APPROVAL,
      payerName: 'BUA Ports Limited',
      payerEmail: 'accounts@buaports.ng',
      payerPhone: '+2348091110002',
      payerTin: '23456789-0001',
      branchId: IDS.branches.apapa,
      createdById: officer.id,
      lines: [
        {
          id: 'ncs-asmline-2a',
          revenueTypeId: berth.id,
          description: 'Berthage — MV BUA Prosperity, 3 days',
          quantity: 3,
          unitAmountMinor: berth.amountMinor,
        },
        {
          id: 'ncs-asmline-2b',
          revenueTypeId: pilot.id,
          description: 'Inbound pilotage',
          quantity: 1,
          unitAmountMinor: pilot.amountMinor,
        },
      ],
      approvals: [
        {
          id: 'ncs-appr-2-submit',
          actorId: officer.id,
          action: ApprovalAction.SUBMIT,
          stepOrder: 0,
          comments: 'Submitted for supervisor review',
        },
      ],
      notes: 'Awaiting Approver step 1',
      currentStep: 1,
    },
    {
      id: 'ncs-asm-approved',
      number: 'NCS-ASM-2026-000003',
      status: AssessmentStatus.APPROVED,
      payerName: 'Dangote Shipping Limited',
      payerEmail: 'marine@dangote.com',
      payerPhone: '+2348091110003',
      payerTin: '34567890-0001',
      branchId: IDS.branches.tincan,
      createdById: officerTincan.id,
      lines: [
        {
          id: 'ncs-asmline-3a',
          revenueTypeId: cargo.id,
          description: 'Bulk cargo dues — clinker',
          quantity: 1,
          unitAmountMinor: cargo.amountMinor,
        },
        {
          id: 'ncs-asmline-3b',
          revenueTypeId: towage.id,
          description: 'Harbour towage assist',
          quantity: 1,
          unitAmountMinor: towage.amountMinor,
        },
      ],
      approvals: [
        {
          id: 'ncs-appr-3-submit',
          actorId: officerTincan.id,
          action: ApprovalAction.SUBMIT,
          stepOrder: 0,
          comments: 'Ready for approval',
        },
        {
          id: 'ncs-appr-3-approve1',
          actorId: approver.id,
          action: ApprovalAction.APPROVE,
          stepOrder: 1,
          comments: 'Rates verified against 2026 tariff',
        },
        {
          id: 'ncs-appr-3-approve2',
          actorId: finance.id,
          action: ApprovalAction.APPROVE,
          stepOrder: 2,
          comments: 'Finance authorized',
        },
      ],
      notes: 'Approved — ready for invoicing',
      currentStep: 2,
      approvedAt: new Date('2026-03-12T14:30:00Z'),
    },
    {
      id: 'ncs-asm-rejected',
      number: 'NCS-ASM-2026-000004',
      status: AssessmentStatus.REJECTED,
      payerName: 'Flour Mills Terminal Operators',
      payerEmail: 'finance@flourmills.ng',
      payerPhone: '+2348091110004',
      payerTin: '45678901-0001',
      branchId: IDS.branches.apapa,
      createdById: officer.id,
      lines: [
        {
          id: 'ncs-asmline-4a',
          revenueTypeId: lateFine.id,
          description: 'Late remittance fine — disputed',
          quantity: 1,
          unitAmountMinor: lateFine.amountMinor,
        },
      ],
      approvals: [
        {
          id: 'ncs-appr-4-submit',
          actorId: officer.id,
          action: ApprovalAction.SUBMIT,
          stepOrder: 0,
        },
        {
          id: 'ncs-appr-4-reject',
          actorId: approver.id,
          action: ApprovalAction.REJECT,
          stepOrder: 1,
          comments: 'Supporting documents incomplete — return to officer',
        },
      ],
      notes: 'Rejected pending additional evidence',
      currentStep: 1,
      rejectedAt: new Date('2026-04-02T11:00:00Z'),
      rejectionReason: 'Missing vessel statement of facts and berth allocation memo',
    },
    {
      id: 'ncs-asm-invoiced',
      number: 'NCS-ASM-2026-000005',
      status: AssessmentStatus.INVOICED,
      payerName: 'MSC Shipping Nigeria Limited',
      payerEmail: 'ng.billing@msc.com',
      payerPhone: '+2348091110005',
      payerTin: '56789012-0001',
      branchId: IDS.branches.tincan,
      createdById: officerTincan.id,
      lines: [
        {
          id: 'ncs-asmline-5a',
          revenueTypeId: cont.id,
          description: 'Container handling — 4 x 20ft',
          quantity: 4,
          unitAmountMinor: cont.amountMinor,
        },
        {
          id: 'ncs-asmline-5b',
          revenueTypeId: envLevy.id,
          description: 'Environmental levy',
          quantity: 1,
          unitAmountMinor: envLevy.amountMinor,
        },
        {
          id: 'ncs-asmline-5c',
          revenueTypeId: docFee.id,
          description: 'Cargo documentation pack',
          quantity: 1,
          unitAmountMinor: docFee.amountMinor,
        },
      ],
      approvals: [
        {
          id: 'ncs-appr-5-submit',
          actorId: officerTincan.id,
          action: ApprovalAction.SUBMIT,
          stepOrder: 0,
        },
        {
          id: 'ncs-appr-5-approve1',
          actorId: approver.id,
          action: ApprovalAction.APPROVE,
          stepOrder: 1,
        },
        {
          id: 'ncs-appr-5-approve2',
          actorId: finance.id,
          action: ApprovalAction.APPROVE,
          stepOrder: 2,
        },
      ],
      notes: 'Invoiced to MSC Shipping Nigeria',
      currentStep: 2,
      approvedAt: new Date('2026-05-08T10:15:00Z'),
    },
  ] as const;

  for (const a of assessments) {
    const subtotal = a.lines.reduce((sum, l) => sum + l.quantity * l.unitAmountMinor, 0);
    await prisma.assessment.create({
      data: {
        id: a.id,
        agencyId: AGENCY_ID,
        branchId: a.branchId,
        createdById: a.createdById,
        assessmentNumber: a.number,
        payerName: a.payerName,
        payerEmail: a.payerEmail,
        payerPhone: a.payerPhone,
        payerTin: a.payerTin,
        currency: 'NGN',
        subtotalMinor: subtotal,
        taxMinor: 0,
        totalMinor: subtotal,
        status: a.status,
        notes: a.notes,
        currentStep: a.currentStep,
        approvedAt: 'approvedAt' in a ? a.approvedAt : undefined,
        rejectedAt: 'rejectedAt' in a ? a.rejectedAt : undefined,
        rejectionReason: 'rejectionReason' in a ? a.rejectionReason : undefined,
        metadata: { vesselFlag: 'NG', seed: true },
        lines: {
          create: a.lines.map((l) => ({
            id: l.id,
            revenueTypeId: l.revenueTypeId,
            description: l.description,
            quantity: l.quantity,
            unitAmountMinor: l.unitAmountMinor,
            lineTotalMinor: l.quantity * l.unitAmountMinor,
          })),
        },
        approvals: {
          create: a.approvals.map((ap) => ({
            id: ap.id,
            actorId: ap.actorId,
            action: ap.action,
            stepOrder: ap.stepOrder,
            comments: ap.comments,
          })),
        },
      },
    });
  }

  const invoices = [
    {
      id: 'ncs-inv-issued',
      number: 'NCS-INV-2026-000001',
      status: InvoiceStatus.ISSUED,
      assessmentId: 'ncs-asm-approved',
      payerName: 'Dangote Shipping Limited',
      payerEmail: 'marine@dangote.com',
      payerPhone: '+2348091110003',
      payerTin: '34567890-0001',
      branchId: IDS.branches.tincan,
      amountPaidMinor: 0,
      issuedAt: new Date('2026-03-13T09:00:00Z'),
      dueAt: new Date('2026-04-12T23:59:59Z'),
      lines: [
        {
          id: 'ncs-invline-1a',
          revenueTypeId: cargo.id,
          description: 'Bulk cargo dues — clinker',
          quantity: 1,
          unitAmountMinor: cargo.amountMinor,
        },
        {
          id: 'ncs-invline-1b',
          revenueTypeId: towage.id,
          description: 'Harbour towage assist',
          quantity: 1,
          unitAmountMinor: towage.amountMinor,
        },
      ],
    },
    {
      id: 'ncs-inv-paid',
      number: 'NCS-INV-2026-000002',
      status: InvoiceStatus.PAID,
      assessmentId: 'ncs-asm-invoiced',
      payerName: 'MSC Shipping Nigeria Limited',
      payerEmail: 'ng.billing@msc.com',
      payerPhone: '+2348091110005',
      payerTin: '56789012-0001',
      branchId: IDS.branches.tincan,
      amountPaidMinor: 4 * cont.amountMinor + envLevy.amountMinor + docFee.amountMinor,
      issuedAt: new Date('2026-05-09T08:00:00Z'),
      dueAt: new Date('2026-06-08T23:59:59Z'),
      paidAt: new Date('2026-05-15T16:42:00Z'),
      lines: [
        {
          id: 'ncs-invline-2a',
          revenueTypeId: cont.id,
          description: 'Container handling — 4 x 20ft',
          quantity: 4,
          unitAmountMinor: cont.amountMinor,
        },
        {
          id: 'ncs-invline-2b',
          revenueTypeId: envLevy.id,
          description: 'Environmental levy',
          quantity: 1,
          unitAmountMinor: envLevy.amountMinor,
        },
        {
          id: 'ncs-invline-2c',
          revenueTypeId: docFee.id,
          description: 'Cargo documentation pack',
          quantity: 1,
          unitAmountMinor: docFee.amountMinor,
        },
      ],
    },
    {
      id: 'ncs-inv-overdue',
      number: 'NCS-INV-2026-000003',
      status: InvoiceStatus.OVERDUE,
      assessmentId: null,
      payerName: 'Intels Nigeria Limited',
      payerEmail: 'treasury@intels.ng',
      payerPhone: '+2348091110006',
      payerTin: '67890123-0001',
      branchId: IDS.branches.onne,
      amountPaidMinor: 0,
      issuedAt: new Date('2026-01-20T10:00:00Z'),
      dueAt: new Date('2026-02-19T23:59:59Z'),
      lines: [
        {
          id: 'ncs-invline-3a',
          revenueTypeId: berth.id,
          description: 'Berthage — Onne Terminal B',
          quantity: 5,
          unitAmountMinor: berth.amountMinor,
        },
      ],
    },
    {
      id: 'ncs-inv-cancelled',
      number: 'NCS-INV-2026-000004',
      status: InvoiceStatus.CANCELLED,
      assessmentId: null,
      payerName: 'Sifax Shipping Company',
      payerEmail: 'ops@sifax.ng',
      payerPhone: '+2348091110007',
      payerTin: '78901234-0001',
      branchId: IDS.branches.apapa,
      amountPaidMinor: 0,
      issuedAt: new Date('2026-02-01T11:00:00Z'),
      dueAt: new Date('2026-03-03T23:59:59Z'),
      lines: [
        {
          id: 'ncs-invline-4a',
          revenueTypeId: pilot.id,
          description: 'Cancelled pilotage booking',
          quantity: 1,
          unitAmountMinor: pilot.amountMinor,
        },
      ],
    },
    {
      id: 'ncs-inv-partial',
      number: 'NCS-INV-2026-000005',
      status: InvoiceStatus.PARTIALLY_PAID,
      assessmentId: null,
      payerName: 'APM Terminals Apapa',
      payerEmail: 'finance.apapa@apmterminals.com',
      payerPhone: '+2348091110008',
      payerTin: '89012345-0001',
      branchId: IDS.branches.apapa,
      amountPaidMinor: cont.amountMinor,
      issuedAt: new Date('2026-06-01T09:30:00Z'),
      dueAt: new Date('2026-07-01T23:59:59Z'),
      lines: [
        {
          id: 'ncs-invline-5a',
          revenueTypeId: cont.id,
          description: 'Container handling — 2 units (partial remittance)',
          quantity: 2,
          unitAmountMinor: cont.amountMinor,
        },
      ],
    },
  ];

  for (const inv of invoices) {
    const subtotal = inv.lines.reduce((sum, l) => sum + l.quantity * l.unitAmountMinor, 0);
    await prisma.invoice.create({
      data: {
        id: inv.id,
        agencyId: AGENCY_ID,
        branchId: inv.branchId,
        assessmentId: inv.assessmentId,
        invoiceNumber: inv.number,
        payerName: inv.payerName,
        payerEmail: inv.payerEmail,
        payerPhone: inv.payerPhone,
        payerTin: inv.payerTin,
        currency: 'NGN',
        subtotalMinor: subtotal,
        taxMinor: 0,
        totalMinor: subtotal,
        amountPaidMinor: inv.amountPaidMinor,
        status: inv.status,
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        paidAt: 'paidAt' in inv ? inv.paidAt : undefined,
        notes: `Seed invoice ${inv.number}`,
        metadata: { seed: true },
        lines: {
          create: inv.lines.map((l) => ({
            id: l.id,
            revenueTypeId: l.revenueTypeId,
            description: l.description,
            quantity: l.quantity,
            unitAmountMinor: l.unitAmountMinor,
            lineTotalMinor: l.quantity * l.unitAmountMinor,
          })),
        },
      },
    });
  }

  const paymentRequests = [
    {
      id: 'ncs-pr-issued',
      invoiceId: 'ncs-inv-issued',
      paymentCode: 'NCS202607000001',
      paymentReference: 'NCS-PAYREF-2026-000001',
      amountMinor: cargo.amountMinor + towage.amountMinor,
      status: PaymentStatus.PENDING,
      provider: PaymentProvider.PAYSTACK,
      slug: 'ncs-dangote-2026-000001',
      vaStatus: VirtualAccountStatus.ACTIVE,
      vaSettlement: SettlementStatus.PENDING,
      accountNumber: '9901234501',
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
      paidAt: null as Date | null,
    },
    {
      id: 'ncs-pr-paid',
      invoiceId: 'ncs-inv-paid',
      paymentCode: 'NCS202607000002',
      paymentReference: 'NCS-PAYREF-2026-000002',
      amountMinor: 4 * cont.amountMinor + envLevy.amountMinor + docFee.amountMinor,
      status: PaymentStatus.PAID,
      provider: PaymentProvider.PAYSTACK,
      slug: 'ncs-msc-2026-000002',
      vaStatus: VirtualAccountStatus.SETTLED,
      vaSettlement: SettlementStatus.SETTLED,
      accountNumber: '9901234502',
      bankCode: '057',
      bankName: 'Zenith Bank',
      paidAt: new Date('2026-05-15T16:42:00Z'),
    },
    {
      id: 'ncs-pr-overdue',
      invoiceId: 'ncs-inv-overdue',
      paymentCode: 'NCS202607000003',
      paymentReference: 'NCS-PAYREF-2026-000003',
      amountMinor: 5 * berth.amountMinor,
      status: PaymentStatus.EXPIRED,
      provider: PaymentProvider.FLUTTERWAVE,
      slug: 'ncs-intels-2026-000003',
      vaStatus: VirtualAccountStatus.EXPIRED,
      vaSettlement: SettlementStatus.PENDING,
      accountNumber: '9901234503',
      bankCode: '011',
      bankName: 'First Bank of Nigeria',
      paidAt: null,
    },
    {
      id: 'ncs-pr-partial',
      invoiceId: 'ncs-inv-partial',
      paymentCode: 'NCS202607000004',
      paymentReference: 'NCS-PAYREF-2026-000004',
      amountMinor: 2 * cont.amountMinor,
      status: PaymentStatus.PENDING,
      provider: PaymentProvider.REMITA,
      slug: 'ncs-apmt-2026-000004',
      vaStatus: VirtualAccountStatus.ACTIVE,
      vaSettlement: SettlementStatus.PENDING,
      accountNumber: '9901234504',
      bankCode: '033',
      bankName: 'United Bank for Africa',
      paidAt: null,
    },
    {
      id: 'ncs-pr-paid-extra',
      invoiceId: 'ncs-inv-paid',
      paymentCode: 'NCS202607000005',
      paymentReference: 'NCS-PAYREF-2026-000005',
      amountMinor: 4 * cont.amountMinor + envLevy.amountMinor + docFee.amountMinor,
      status: PaymentStatus.PAID,
      provider: PaymentProvider.PAYSTACK,
      slug: 'ncs-msc-alt-2026-000005',
      vaStatus: VirtualAccountStatus.SETTLED,
      vaSettlement: SettlementStatus.SETTLED,
      accountNumber: '9901234505',
      bankCode: '070',
      bankName: 'Fidelity Bank',
      paidAt: new Date('2026-05-15T16:40:00Z'),
    },
  ];

  for (const pr of paymentRequests) {
    const expiresAt =
      pr.status === PaymentStatus.EXPIRED
        ? new Date('2026-02-20T00:00:00Z')
        : new Date('2026-12-31T23:59:59Z');

    await prisma.paymentRequest.create({
      data: {
        id: pr.id,
        agencyId: AGENCY_ID,
        invoiceId: pr.invoiceId,
        paymentCode: pr.paymentCode,
        paymentReference: pr.paymentReference,
        amountMinor: pr.amountMinor,
        currency: 'NGN',
        status: pr.status,
        hmacToken: sha256(`hmac:${pr.paymentCode}`),
        qrPayload: `${PAY_BASE}/pay/${pr.paymentCode}`,
        payUrl: `${PAY_BASE}/pay/${pr.paymentCode}`,
        expiresAt,
        paidAt: pr.paidAt,
        provider: pr.provider,
        preferredMethods: [
          PaymentMethod.BANK_TRANSFER,
          PaymentMethod.DEBIT_CARD,
          PaymentMethod.USSD,
        ],
        metadata: { seed: true },
        paymentLink: {
          create: {
            id: `ncs-plink-${pr.id}`,
            slug: pr.slug,
            shortUrl: `${PAY_BASE}/pay/${pr.paymentCode}`,
            openCount: pr.status === PaymentStatus.PAID ? 12 : 3,
            clickCount: pr.status === PaymentStatus.PAID ? 8 : 1,
          },
        },
        virtualAccount: {
          create: {
            id: `ncs-va-${pr.id}`,
            agencyId: AGENCY_ID,
            provider: pr.provider,
            bankCode: pr.bankCode,
            bankName: pr.bankName,
            accountNumber: pr.accountNumber,
            accountName: `NCS / ${pr.paymentCode}`,
            invoiceNumber:
              invoices.find((i) => i.id === pr.invoiceId)?.number ?? 'NCS-INV-UNKNOWN',
            currency: 'NGN',
            status: pr.vaStatus,
            settlementStatus: pr.vaSettlement,
            expiresAt,
            providerRef: `VA-${pr.paymentCode}`,
            metadata: { seed: true },
          },
        },
      },
    });
  }

  // Prefer the primary paid request for payment/receipt/settlement linkage
  await prisma.paymentAttempt.createMany({
    data: [
      {
        id: 'ncs-attempt-1',
        paymentRequestId: 'ncs-pr-issued',
        method: PaymentMethod.BANK_TRANSFER,
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.PENDING,
        providerRef: 'PSK_ATT_001',
      },
      {
        id: 'ncs-attempt-2',
        paymentRequestId: 'ncs-pr-paid',
        method: PaymentMethod.DEBIT_CARD,
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.FAILED,
        providerRef: 'PSK_ATT_002',
        errorMessage: 'Insufficient funds on first attempt',
      },
      {
        id: 'ncs-attempt-3',
        paymentRequestId: 'ncs-pr-paid',
        method: PaymentMethod.BANK_TRANSFER,
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.PAID,
        providerRef: 'PSK_ATT_003',
      },
      {
        id: 'ncs-attempt-4',
        paymentRequestId: 'ncs-pr-partial',
        method: PaymentMethod.USSD,
        provider: PaymentProvider.REMITA,
        status: PaymentStatus.PAID,
        providerRef: 'RMT_ATT_004',
      },
      {
        id: 'ncs-attempt-5',
        paymentRequestId: 'ncs-pr-overdue',
        method: PaymentMethod.DEBIT_CARD,
        provider: PaymentProvider.FLUTTERWAVE,
        status: PaymentStatus.EXPIRED,
        providerRef: 'FLW_ATT_005',
        errorMessage: 'Payment window expired',
      },
    ],
  });

  const paidAmount = 4 * cont.amountMinor + envLevy.amountMinor + docFee.amountMinor;
  const partialAmount = cont.amountMinor;

  await prisma.payment.createMany({
    data: [
      {
        id: 'ncs-pay-msc',
        agencyId: AGENCY_ID,
        invoiceId: 'ncs-inv-paid',
        paymentRequestId: 'ncs-pr-paid',
        amountMinor: paidAmount,
        currency: 'NGN',
        method: PaymentMethod.BANK_TRANSFER,
        provider: PaymentProvider.PAYSTACK,
        providerRef: 'PSK_TXN_MSC_20260515',
        status: PaymentStatus.PAID,
        paidAt: new Date('2026-05-15T16:42:00Z'),
        payerName: 'MSC Shipping Nigeria Limited',
        payerEmail: 'ng.billing@msc.com',
        rawPayload: { channel: 'bank_transfer', seed: true },
      },
      {
        id: 'ncs-pay-partial',
        agencyId: AGENCY_ID,
        invoiceId: 'ncs-inv-partial',
        paymentRequestId: 'ncs-pr-partial',
        amountMinor: partialAmount,
        currency: 'NGN',
        method: PaymentMethod.USSD,
        provider: PaymentProvider.REMITA,
        providerRef: 'RMT_TXN_APMT_20260610',
        status: PaymentStatus.PAID,
        paidAt: new Date('2026-06-10T13:20:00Z'),
        payerName: 'APM Terminals Apapa',
        payerEmail: 'finance.apapa@apmterminals.com',
        rawPayload: { channel: 'ussd', seed: true },
      },
    ],
  });

  await prisma.webhookEvent.createMany({
    data: [
      {
        id: 'ncs-webhook-paystack-1',
        provider: PaymentProvider.PAYSTACK,
        providerEventId: 'evt_psk_npa_msc_paid',
        eventType: 'charge.success',
        signatureValid: true,
        payload: {
          event: 'charge.success',
          data: { reference: 'NCS-PAYREF-2026-000002', amount: paidAmount },
        },
        processedAt: new Date('2026-05-15T16:42:05Z'),
      },
      {
        id: 'ncs-webhook-flutterwave-1',
        provider: PaymentProvider.FLUTTERWAVE,
        providerEventId: 'evt_flw_npa_intels_expired',
        eventType: 'payment.expired',
        signatureValid: true,
        payload: {
          event: 'payment.expired',
          data: { reference: 'NCS-PAYREF-2026-000003' },
        },
        processedAt: new Date('2026-02-20T00:05:00Z'),
      },
    ],
  });

  await prisma.receipt.create({
    data: {
      id: 'ncs-receipt-msc',
      agencyId: AGENCY_ID,
      paymentId: 'ncs-pay-msc',
      invoiceId: 'ncs-inv-paid',
      receiptNumber: 'NCS-RCP-2026-000001',
      amountMinor: paidAmount,
      currency: 'NGN',
      paymentReference: 'NCS-PAYREF-2026-000002',
      invoiceNumber: 'NCS-INV-2026-000002',
      agencyName: 'Nigeria Customs',
      officerName: 'Ibrahim Bello',
      qrVerification:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      digitalSignature:
        'sig:ed25519:ncs-seed-placeholder-signature-msc-shipping-nigeria-20260515',
      issuedAt: new Date('2026-05-15T16:43:00Z'),
      metadata: { verified: true, seed: true },
    },
  });

  await prisma.refund.create({
    data: {
      id: 'ncs-refund-pending',
      paymentId: 'ncs-pay-partial',
      amountMinor: 500_000,
      currency: 'NGN',
      reason: 'Duplicate USSD debit reported by APM Terminals Apapa',
      status: PaymentStatus.PENDING,
      providerRef: null,
      processedAt: null,
    },
  });

  await prisma.settlementBatch.createMany({
    data: [
      {
        id: 'ncs-batch-pending',
        agencyId: AGENCY_ID,
        batchNumber: 'ncs-STL-2026-000001',
        totalMinor: partialAmount,
        currency: 'NGN',
        status: SettlementStatus.PENDING,
      },
      {
        id: 'ncs-batch-settled',
        agencyId: AGENCY_ID,
        batchNumber: 'ncs-STL-2026-000002',
        totalMinor: paidAmount,
        currency: 'NGN',
        status: SettlementStatus.SETTLED,
        tsaReference: 'TSA-ncs-2026-0515-001',
        settledAt: new Date('2026-05-16T09:00:00Z'),
      },
    ],
  });

  await prisma.settlement.createMany({
    data: [
      {
        id: 'ncs-stl-partial',
        agencyId: AGENCY_ID,
        paymentId: 'ncs-pay-partial',
        batchId: 'ncs-batch-pending',
        amountMinor: partialAmount,
        currency: 'NGN',
        status: SettlementStatus.PENDING,
        tsaAccount: '0020123456789',
      },
      {
        id: 'ncs-stl-msc',
        agencyId: AGENCY_ID,
        paymentId: 'ncs-pay-msc',
        batchId: 'ncs-batch-settled',
        amountMinor: paidAmount,
        currency: 'NGN',
        status: SettlementStatus.SETTLED,
        tsaAccount: '0020123456789',
        settledAt: new Date('2026-05-16T09:00:00Z'),
      },
    ],
  });

  await prisma.ledgerEntry.createMany({
    data: [
      {
        id: 'ncs-ledger-msc-debit',
        agencyId: AGENCY_ID,
        paymentId: 'ncs-pay-msc',
        entryType: LedgerEntryType.DEBIT,
        accountCode: '1001-CASH-PAYSTACK',
        amountMinor: paidAmount,
        currency: 'NGN',
        narrative: 'Bank receipt — MSC Shipping Nigeria Limited',
        valueDate: new Date('2026-05-15T16:42:00Z'),
      },
      {
        id: 'ncs-ledger-msc-credit',
        agencyId: AGENCY_ID,
        paymentId: 'ncs-pay-msc',
        entryType: LedgerEntryType.CREDIT,
        accountCode: '4001-REV-PORT',
        amountMinor: paidAmount,
        currency: 'NGN',
        narrative: 'Revenue recognition — NCS-INV-2026-000002',
        valueDate: new Date('2026-05-15T16:42:00Z'),
      },
      {
        id: 'ncs-ledger-partial-debit',
        agencyId: AGENCY_ID,
        paymentId: 'ncs-pay-partial',
        entryType: LedgerEntryType.DEBIT,
        accountCode: '1001-CASH-REMITA',
        amountMinor: partialAmount,
        currency: 'NGN',
        narrative: 'Partial remittance — APM Terminals Apapa',
        valueDate: new Date('2026-06-10T13:20:00Z'),
      },
      {
        id: 'ncs-ledger-partial-credit',
        agencyId: AGENCY_ID,
        paymentId: 'ncs-pay-partial',
        entryType: LedgerEntryType.CREDIT,
        accountCode: '4001-REV-PORT',
        amountMinor: partialAmount,
        currency: 'NGN',
        narrative: 'Partial revenue — NCS-INV-2026-000005',
        valueDate: new Date('2026-06-10T13:20:00Z'),
      },
    ],
  });

  const notifications = [
    {
      id: 'ncs-notif-email',
      channel: NotificationChannel.EMAIL,
      recipient: 'ng.billing@msc.com',
      subject: 'NCS Payment Receipt — NCS-RCP-2026-000001',
      body: 'Dear MSC Shipping Nigeria Limited, your payment of â‚¦1,065,000.00 has been received.',
      status: NotificationStatus.DELIVERED,
      userId: actors.officer.id,
      deliveryId: 'ncs-notifdel-email',
      deliveryStatus: NotificationStatus.DELIVERED,
      providerRef: 'ses-ncs-001',
    },
    {
      id: 'ncs-notif-sms',
      channel: NotificationChannel.SMS,
      recipient: '+2348091110005',
      subject: null,
      body: 'NCS: Payment confirmed for invoice NCS-INV-2026-000002. Ref NCS202607000002.',
      status: NotificationStatus.SENT,
      userId: null as string | null,
      deliveryId: 'ncs-notifdel-sms',
      deliveryStatus: NotificationStatus.SENT,
      providerRef: 'termii-ncs-002',
    },
    {
      id: 'ncs-notif-whatsapp',
      channel: NotificationChannel.WHATSAPP,
      recipient: '+2348091110003',
      subject: null,
      body: 'NCS invoice NCS-INV-2026-000001 is ready. Pay via https://ncs.pay/s/ncs-dangote-2026-000001',
      status: NotificationStatus.QUEUED,
      userId: null,
      deliveryId: 'ncs-notifdel-whatsapp',
      deliveryStatus: NotificationStatus.QUEUED,
      providerRef: null as string | null,
    },
  ];

  for (const n of notifications) {
    await prisma.notification.create({
      data: {
        id: n.id,
        agencyId: AGENCY_ID,
        userId: n.userId,
        channel: n.channel,
        recipient: n.recipient,
        subject: n.subject,
        body: n.body,
        status: n.status,
        metadata: { seed: true },
        deliveries: {
          create: {
            id: n.deliveryId,
            status: n.deliveryStatus,
            providerRef: n.providerRef,
          },
        },
      },
    });
  }

  await prisma.linkShareEvent.createMany({
    data: [
      {
        id: 'ncs-link-opened',
        paymentRequestId: 'ncs-pr-paid',
        eventType: LinkEventType.OPENED,
        channel: NotificationChannel.EMAIL,
        ipAddress: '105.112.10.22',
        userAgent: 'Mozilla/5.0',
      },
      {
        id: 'ncs-link-clicked',
        paymentRequestId: 'ncs-pr-paid',
        eventType: LinkEventType.CLICKED,
        channel: NotificationChannel.EMAIL,
        ipAddress: '105.112.10.22',
        userAgent: 'Mozilla/5.0',
      },
      {
        id: 'ncs-link-paid',
        paymentRequestId: 'ncs-pr-paid',
        eventType: LinkEventType.PAID,
        channel: NotificationChannel.EMAIL,
        ipAddress: '105.112.10.22',
        userAgent: 'Mozilla/5.0',
      },
      {
        id: 'ncs-link-shared',
        paymentRequestId: 'ncs-pr-issued',
        eventType: LinkEventType.SHARED,
        channel: NotificationChannel.WHATSAPP,
        ipAddress: '102.89.23.14',
        userAgent: 'WhatsApp/2.24',
        metadata: { sharedBy: 'officer.apapa@ncs.gov.ng' },
      },
    ],
  });

  await prisma.fileObject.create({
    data: {
      id: 'ncs-file-tariff-pdf',
      agencyId: AGENCY_ID,
      filename: 'ncs-2026-harbour-tariff.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 248_320,
      storageKey: 'NCS/documents/2026/harbour-tariff.pdf',
      checksumSha256: sha256('ncs-2026-harbour-tariff-pdf-bytes'),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        id: 'ncs-audit-login',
        agencyId: AGENCY_ID,
        actorId: actors.officer.id,
        action: AuditAction.LOGIN,
        entityType: 'User',
        entityId: actors.officer.id,
        ipAddress: '102.89.23.14',
        userAgent: 'Mozilla/5.0',
        metadata: { method: 'password' },
      },
      {
        id: 'ncs-audit-assessment',
        agencyId: AGENCY_ID,
        actorId: actors.officer.id,
        action: AuditAction.ASSESSMENT,
        entityType: 'Assessment',
        entityId: 'ncs-asm-pending',
        after: { status: 'PENDING_APPROVAL', assessmentNumber: 'NCS-ASM-2026-000002' },
      },
      {
        id: 'ncs-audit-invoice',
        agencyId: AGENCY_ID,
        actorId: finance.id,
        action: AuditAction.INVOICE,
        entityType: 'Invoice',
        entityId: 'ncs-inv-issued',
        after: { status: 'ISSUED', invoiceNumber: 'NCS-INV-2026-000001' },
      },
      {
        id: 'ncs-audit-payment',
        agencyId: AGENCY_ID,
        actorId: null,
        action: AuditAction.PAYMENT,
        entityType: 'Payment',
        entityId: 'ncs-pay-msc',
        after: { status: 'PAID', amountMinor: paidAmount },
      },
      {
        id: 'ncs-audit-receipt',
        agencyId: AGENCY_ID,
        actorId: actors.officer.id,
        action: AuditAction.RECEIPT,
        entityType: 'Receipt',
        entityId: 'ncs-receipt-msc',
        after: { receiptNumber: 'NCS-RCP-2026-000001' },
      },
      {
        id: 'ncs-audit-config',
        agencyId: AGENCY_ID,
        actorId: actors.admin.id,
        action: AuditAction.CONFIG,
        entityType: 'GatewayConfig',
        entityId: 'ncs-gateway-paystack',
        after: { provider: 'PAYSTACK', isDefault: true },
      },
    ],
  });
}

async function printSummary(): Promise<void> {
  const [
    permissions,
    currencies,
    banks,
    branches,
    roles,
    users,
    categories,
    revenueTypes,
    feeSchedules,
    assessments,
    invoices,
    paymentRequests,
    payments,
    receipts,
    settlements,
    notifications,
    auditLogs,
  ] = await Promise.all([
    prisma.permission.count(),
    prisma.currency.count(),
    prisma.bank.count(),
    prisma.branch.count({ where: { agencyId: AGENCY_ID } }),
    prisma.role.count({ where: { OR: [{ agencyId: AGENCY_ID }, { id: IDS.roles.SUPER_ADMIN }] } }),
    prisma.user.count({
      where: { OR: [{ agencyId: AGENCY_ID }, { email: { endsWith: '@ncs.gov.ng' } }] },
    }),
    prisma.revenueCategory.count({ where: { agencyId: AGENCY_ID } }),
    prisma.revenueType.count({ where: { agencyId: AGENCY_ID } }),
    prisma.feeSchedule.count({
      where: { revenueType: { agencyId: AGENCY_ID } },
    }),
    prisma.assessment.count({ where: { agencyId: AGENCY_ID } }),
    prisma.invoice.count({ where: { agencyId: AGENCY_ID } }),
    prisma.paymentRequest.count({ where: { agencyId: AGENCY_ID } }),
    prisma.payment.count({ where: { agencyId: AGENCY_ID } }),
    prisma.receipt.count({ where: { agencyId: AGENCY_ID } }),
    prisma.settlement.count({ where: { agencyId: AGENCY_ID } }),
    prisma.notification.count({ where: { agencyId: AGENCY_ID } }),
    prisma.auditLog.count({ where: { agencyId: AGENCY_ID } }),
  ]);

  console.log('NCS seed completed (single-tenant).');
  console.log('');
  console.log('Credentials (password for all: ChangeMe@12345)');
  console.log('  admin@ncs.gov.ng              SUPER_ADMIN');
  console.log('  admin.finance@ncs.gov.ng      AGENCY_ADMIN');
  console.log('  officer.apapa@ncs.gov.ng      REVENUE_OFFICER (Ada Okoro)');
  console.log('  officer.tincan@ncs.gov.ng     REVENUE_OFFICER');
  console.log('  approver@ncs.gov.ng           APPROVER');
  console.log('  treasury@ncs.gov.ng           TREASURY');
  console.log('  auditor@ncs.gov.ng            AUDITOR');
  console.log('  cashier@ncs.gov.ng            CASHIER');
  console.log('');
  console.log('Counts:');
  console.log(`  Permissions:       ${permissions}`);
  console.log(`  Currencies:        ${currencies}`);
  console.log(`  Banks:             ${banks}`);
  console.log(`  Branches:          ${branches}`);
  console.log(`  Roles:             ${roles}`);
  console.log(`  Users:             ${users}`);
  console.log(`  RevenueCategories: ${categories}`);
  console.log(`  RevenueTypes:      ${revenueTypes}`);
  console.log(`  TaxTypes:          ${await prisma.taxType.count({ where: { agencyId: AGENCY_ID } })}`);
  console.log(`  FeeSchedules:      ${feeSchedules}`);
  console.log(`  Assessments:       ${assessments}`);
  console.log(`  Invoices:          ${invoices}`);
  console.log(`  PaymentRequests:   ${paymentRequests}`);
  console.log(`  Payments:          ${payments}`);
  console.log(`  Receipts:          ${receipts}`);
  console.log(`  Settlements:       ${settlements}`);
  console.log(`  Notifications:     ${notifications}`);
  console.log(`  AuditLogs:         ${auditLogs}`);
}

async function main() {
  const force =
    process.env.SEED_FORCE === 'true' ||
    process.env.SEED_FORCE === '1' ||
    process.env.SEED_ON_BOOT === 'true' ||
    process.env.SEED_ON_BOOT === '1';

  const agencyCount = await prisma.agency.count();
  if (agencyCount > 0 && !force) {
    console.log(`Seed skipped — ${agencyCount} agency row(s) already present (set SEED_FORCE=true to reseed).`);
    return;
  }

  console.log('Seeding Government Revenue platform (NCS tenant)...');

  await resetNcsForSeed();
  await seedPermissions();
  await seedCurrencies();
  await seedBanks();
  await seedAgencyAndBranches();
  await seedRolesAndPermissions();

  const passwordHash = await argon2.hash(PASSWORD);
  const actors = await seedUsers(passwordHash);
  const typeByCode = await seedRevenueCatalog();
  await seedTaxTypes();
  await seedWorkflowsSequencesGateways();
  await seedTransactionalData(typeByCode, actors);
  await printSummary();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
