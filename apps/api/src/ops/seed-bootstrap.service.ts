import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { seedTenantDemoData } from './tenant-demo-seed';

const execFileAsync = promisify(execFile);

/**
 * When the tenant DB has no agencies, seed demo data so dashboards work and
 * SUPER_ADMIN exists for HR SSO role assignment.
 */
@Injectable()
export class SeedBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SeedBootstrapService.name);
  private seedPromise: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureSeeded();
    } catch (err) {
      this.logger.error(`Boot seed failed: ${(err as Error).message}`);
    }
  }

  /** Idempotent: seeds when no agencies exist (unless SKIP_SEED). */
  async ensureSeeded(): Promise<void> {
    if (process.env.SKIP_SEED === 'true' || process.env.SKIP_SEED === '1') {
      return;
    }
    if (this.seedPromise) return this.seedPromise;

    this.seedPromise = (async () => {
      try {
        await this.patchMissingColumns();

        const agencies = await this.prisma.agency.count();
        if (agencies === 0) {
          this.logger.warn('Empty tenant DB — attempting full pnpm seed, then in-process demo seed…');
          try {
            const { stdout, stderr } = await execFileAsync(
              'pnpm',
              ['--filter', '@revenue/database', 'seed'],
              {
                cwd: process.cwd(),
                env: process.env,
                timeout: 300_000,
                maxBuffer: 8 * 1024 * 1024,
              },
            );
            if (stdout) this.logger.log(stdout.slice(-1500));
            if (stderr) this.logger.warn(stderr.slice(-800));
          } catch (err) {
            this.logger.warn(`pnpm seed unavailable: ${(err as Error).message}`);
          }
        }

        const result = await seedTenantDemoData(this.prisma);
        this.logger.log(
          `Seed ensure complete — agencyId=${result.agencyId} payments=${result.payments}`,
        );
      } catch (err) {
        this.logger.error(`Auto-seed failed: ${(err as Error).message}`);
        this.logger.error((err as Error).stack ?? '');
        throw err;
      } finally {
        this.seedPromise = null;
      }
    })();

    return this.seedPromise;
  }

  /** Best-effort column patches when migrate deploy lagged behind Prisma schema. */
  private async patchMissingColumns() {
    const statements = [
      'ALTER TABLE InvoiceLine ADD COLUMN taxRatePercent DECIMAL(7,4) NOT NULL DEFAULT 0',
      'ALTER TABLE InvoiceLine ADD COLUMN taxMinor INT NOT NULL DEFAULT 0',
      'ALTER TABLE Invoice ADD COLUMN amountPaidMinor INT NOT NULL DEFAULT 0',
    ];
    for (const sql of statements) {
      try {
        await this.prisma.$executeRawUnsafe(sql);
        this.logger.warn(`Applied schema patch: ${sql}`);
      } catch {
        // Column already exists or table missing — ignore
      }
    }
  }
}
