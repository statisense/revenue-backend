import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

function firstDefined(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return undefined;
}

export class HrSsoDto {
  @ApiProperty({
    description: 'HR JWT from the inbound link (?ctx=…)',
    example: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...',
  })
  @IsString()
  @IsNotEmpty()
  ctx!: string;

  /** Accepted alias for company_id (query ?cid=). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cid?: string;

  /** Accepted alias for staff_id (query ?stid=). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stid?: string;

  @ApiProperty({ description: 'Company id (?cid=…)', example: '1' })
  @Transform(({ obj }) => firstDefined(obj.company_id, obj.cid, obj.companyId))
  @IsString()
  @IsNotEmpty()
  company_id!: string;

  @ApiProperty({ description: 'Staff id (?stid=…)', example: '1' })
  @Transform(({ obj }) => firstDefined(obj.staff_id, obj.stid, obj.staffId))
  @IsString()
  @IsNotEmpty()
  staff_id!: string;

  @ApiPropertyOptional({ description: 'Optional referrer hint (?from=…)' })
  @IsOptional()
  @IsString()
  from?: string;
}
