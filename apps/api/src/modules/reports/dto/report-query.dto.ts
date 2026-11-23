import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class SalesReportQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  /** Inclusive lower bound (ISO 8601). */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Exclusive upper bound (ISO 8601). */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AttendanceReportQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventId: string;
}
