import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';

const execFileAsync = promisify(execFile);

/**
 * When the tenant DB has no agencies, run `pnpm db seed` once at boot
 * so dashboards/reports have real demo data (and SUPER_ADMIN role exists for HR SSO).
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
        if (agencies > 0) {
          this.logger.log(`Tenant already seeded (${agencies} agency row(s))`);
          return;
        }
        this.logger.warn('Empty tenant DB detected — running database seed…');
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
        if (stdout) this.logger.log(stdout.slice(-2000));
        if (stderr) this.logger.warn(stderr.slice(-1000));
        this.logger.log('Database seed finished');
      } catch (err) {
        this.logger.error(`Auto-seed failed: ${(err as Error).message}`);
      } finally {
        this.seedPromise = null;
      }
    })();

    return this.seedPromise;
  }
}
