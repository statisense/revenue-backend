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
    await this.ensureSeeded();
  }

  /** Idempotent: seeds when no agencies exist (unless SKIP_SEED). */
  async ensureSeeded(): Promise<void> {
    if (process.env.SKIP_SEED === 'true' || process.env.SKIP_SEED === '1') {
      return;
    }
    if (this.seedPromise) return this.seedPromise;

    this.seedPromise = (async () => {
      try {
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

        // No-ops when NCS already has payments; otherwise creates/backfills demo data
        await seedTenantDemoData(this.prisma);
        const after = await this.prisma.agency.count();
        const pays = await this.prisma.payment.count();
        this.logger.log(`Seed ensure complete — agencies=${after} payments=${pays}`);
      } catch (err) {
        this.logger.error(`Auto-seed failed: ${(err as Error).message}`);
      } finally {
        this.seedPromise = null;
      }
    })();

    return this.seedPromise;
  }
}
