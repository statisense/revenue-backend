import { Logger } from '@nestjs/common';
import { PrismaClient } from '@revenue/database';

const logger = new Logger('SchemaPatch');

async function execIgnore(prisma: PrismaClient, sql: string) {
  try {
    await prisma.$executeRawUnsafe(sql);
    logger.warn(`Applied: ${sql.slice(0, 120)}`);
  } catch {
    // already exists / not applicable
  }
}

/**
 * Bring older MySQL schemas in line with current Prisma models
 * (TaxType table + tax columns on line items). Idempotent.
 */
export async function patchRevenueSchema(prisma: PrismaClient): Promise<void> {
  await execIgnore(
    prisma,
    `CREATE TABLE IF NOT EXISTS \`TaxType\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`agencyId\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`description\` VARCHAR(191) NULL,
      \`ratePercent\` DECIMAL(7, 4) NOT NULL,
      \`isActive\` BOOLEAN NOT NULL DEFAULT true,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL,
      INDEX \`TaxType_agencyId_isActive_idx\`(\`agencyId\`, \`isActive\`),
      UNIQUE INDEX \`TaxType_agencyId_code_key\`(\`agencyId\`, \`code\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );

  const alters: Array<[string, string, string]> = [
    ['AssessmentLine', 'taxTypeId', 'VARCHAR(191) NULL'],
    ['AssessmentLine', 'taxRatePercent', 'DECIMAL(7,4) NOT NULL DEFAULT 0'],
    ['AssessmentLine', 'taxMinor', 'INT NOT NULL DEFAULT 0'],
    ['InvoiceLine', 'taxTypeId', 'VARCHAR(191) NULL'],
    ['InvoiceLine', 'taxRatePercent', 'DECIMAL(7,4) NOT NULL DEFAULT 0'],
    ['InvoiceLine', 'taxMinor', 'INT NOT NULL DEFAULT 0'],
    ['Invoice', 'amountPaidMinor', 'INT NOT NULL DEFAULT 0'],
  ];

  for (const [table, column, def] of alters) {
    await execIgnore(prisma, `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
  }

  await execIgnore(
    prisma,
    'CREATE INDEX `AssessmentLine_taxTypeId_idx` ON `AssessmentLine`(`taxTypeId`)',
  );
  await execIgnore(prisma, 'CREATE INDEX `InvoiceLine_taxTypeId_idx` ON `InvoiceLine`(`taxTypeId`)');

  await execIgnore(
    prisma,
    'ALTER TABLE `TaxType` ADD CONSTRAINT `TaxType_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `Agency`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  );
  await execIgnore(
    prisma,
    'ALTER TABLE `AssessmentLine` ADD CONSTRAINT `AssessmentLine_taxTypeId_fkey` FOREIGN KEY (`taxTypeId`) REFERENCES `TaxType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  );
  await execIgnore(
    prisma,
    'ALTER TABLE `InvoiceLine` ADD CONSTRAINT `InvoiceLine_taxTypeId_fkey` FOREIGN KEY (`taxTypeId`) REFERENCES `TaxType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  );
}
