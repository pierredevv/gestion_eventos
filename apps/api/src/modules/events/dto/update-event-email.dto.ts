import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { EmailOverrideDto } from './email-override.dto';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

class EventEmailTemplatesDto {
  @ApiPropertyOptional({ type: EmailOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailOverrideDto)
  ORDER_CREATED?: EmailOverrideDto;

  @ApiPropertyOptional({ type: EmailOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailOverrideDto)
  RECEIPT_RECEIVED?: EmailOverrideDto;

  @ApiPropertyOptional({ type: EmailOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailOverrideDto)
  PAYMENT_APPROVED?: EmailOverrideDto;

  @ApiPropertyOptional({ type: EmailOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailOverrideDto)
  PAYMENT_REJECTED?: EmailOverrideDto;

  @ApiPropertyOptional({ type: EmailOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailOverrideDto)
  TICKET_DELIVERY?: EmailOverrideDto;
}

export class UpdateEventEmailDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  brandName?: string;

  @ApiPropertyOptional({ example: '#b8431a' })
  @IsOptional()
  @Matches(HEX_COLOR)
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#12141a' })
  @IsOptional()
  @Matches(HEX_COLOR)
  textColor?: string;

  @ApiPropertyOptional({ example: '#f8f6f1' })
  @IsOptional()
  @Matches(HEX_COLOR)
  backgroundColor?: string;

  @ApiPropertyOptional({ type: EventEmailTemplatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EventEmailTemplatesDto)
  templates?: EventEmailTemplatesDto;

  @ApiPropertyOptional({ description: 'Remove the uploaded logo' })
  @IsOptional()
  @IsBoolean()
  removeLogo?: boolean;
}
