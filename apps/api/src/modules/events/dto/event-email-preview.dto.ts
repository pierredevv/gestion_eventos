import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, ValidateNested } from 'class-validator';
import { EVENT_EMAIL_TYPES, type EventEmailType } from '../../../common/email/templates';
import { UpdateEventEmailDto } from './update-event-email.dto';

export class EventEmailPreviewDto {
  @ApiProperty({ enum: EVENT_EMAIL_TYPES })
  @IsIn(EVENT_EMAIL_TYPES)
  type: EventEmailType;

  /** Draft values are previewed without saving them first. */
  @ApiPropertyOptional({ type: UpdateEventEmailDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateEventEmailDto)
  config?: UpdateEventEmailDto;
}
