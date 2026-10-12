import { Module } from '@nestjs/common';
import { OpsService } from './ops.service';
import { OpsController } from './ops.controller';
import { CryptoService } from '../common/services/crypto.service';
import { SeedBootstrapService } from './seed-bootstrap.service';

@Module({
  controllers: [OpsController],
  providers: [OpsService, CryptoService, SeedBootstrapService],
  exports: [OpsService, SeedBootstrapService],
})
export class OpsModule {}
