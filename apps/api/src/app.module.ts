import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });
loadDotenv();

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { loadEnv } from '@revenue/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AgenciesModule } from './agencies/agencies.module';
import { RevenueModule } from './revenue/revenue.module';
import { AssessmentModule } from './assessment/assessment.module';
import { InvoiceModule } from './invoice/invoice.module';
import { PaymentModule } from './payment/payment.module';
import { VirtualAccountModule } from './virtual-account/virtual-account.module';
import { GatewayModule } from './gateway/gateway.module';
import { SettlementModule } from './settlement/settlement.module';
import { NotificationModule } from './notification/notification.module';
import { ReportingModule } from './reporting/reporting.module';
import { AuditModule } from './audit/audit.module';
import { OpsModule } from './ops/ops.module';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { areQueuesEnabled } from './common/queues/queues.util';

const env = loadEnv(process.env);
const queuesOn = areQueuesEnabled();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => ({ ...env, QUEUES_ENABLED: queuesOn })],
    }),
    ThrottlerModule.forRoot([{ ttl: env.RATE_LIMIT_TTL * 1000, limit: env.RATE_LIMIT_LIMIT }]),
    ...(queuesOn
      ? [
          BullModule.forRoot({
            connection: {
              url: env.REDIS_URL,
              maxRetriesPerRequest: 1,
              enableOfflineQueue: false,
              lazyConnect: true,
            },
          }),
        ]
      : []),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    AgenciesModule,
    RevenueModule,
    AssessmentModule,
    InvoiceModule,
    GatewayModule,
    VirtualAccountModule,
    NotificationModule.register(),
    PaymentModule,
    SettlementModule,
    ReportingModule,
    OpsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
