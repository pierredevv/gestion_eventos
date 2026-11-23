import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaymentSubmissionStatus } from '@prisma/client';

export class ListSubmissionsDto {
  @ApiPropertyOptional({ enum: PaymentSubmissionStatus })
  @IsOptional()
  @IsEnum(PaymentSubmissionStatus)
  status?: PaymentSubmissionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
