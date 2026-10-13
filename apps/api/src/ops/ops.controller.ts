import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OpsService } from './ops.service';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateRefundDto, UpsertGatewayConfigDto } from '../common/dto/ops.dto';
import { Public } from '../common/decorators/public.decorator';

class RejectRefundDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('ops')
@ApiBearerAuth()
@Controller()
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Public()
  @Get('tenant')
  tenant() {
    return this.ops.tenantInfo();
  }

  @Get('virtual-accounts')
  @RequirePermissions('payments:read')
  listVas(@CurrentUser() user: AuthUser, @Query('agencyId') agencyId?: string) {
    return this.ops.listVirtualAccounts(user, agencyId);
  }

  @Get('gateways/configs')
  @RequirePermissions('gateways:write')
  listGateways(@CurrentUser() user: AuthUser, @Query('agencyId') agencyId?: string) {
    return this.ops.listGatewayConfigs(user, agencyId);
  }

  @Post('gateways/configs')
  @RequirePermissions('gateways:write')
  upsertGateway(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertGatewayConfigDto,
    @Query('agencyId') agencyId?: string,
  ) {
    return this.ops.upsertGatewayConfig(user, dto, agencyId);
  }

  @Post('refunds')
  @RequirePermissions('payments:refund')
  createRefund(@CurrentUser() user: AuthUser, @Body() dto: CreateRefundDto) {
    return this.ops.createRefund(user, dto);
  }

  @Post('refunds/:id/approve')
  @RequirePermissions('payments:refund')
  approveRefund(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ops.approveRefund(user, id);
  }

  @Post('refunds/:id/reject')
  @RequirePermissions('payments:refund')
  rejectRefund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectRefundDto,
  ) {
    return this.ops.rejectRefund(user, id, dto.reason);
  }

  @Get('refunds')
  @RequirePermissions('payments:read')
  listRefunds(@CurrentUser() user: AuthUser, @Query('agencyId') agencyId?: string) {
    return this.ops.listRefunds(user, agencyId);
  }

  @Post('jobs/maintenance')
  @RequirePermissions('settlements:write')
  maintenance(@CurrentUser() user: AuthUser) {
    return this.ops.runMaintenanceJobs(user);
  }
}
