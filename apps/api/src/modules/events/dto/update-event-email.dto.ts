import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { EMAIL_LAYOUT_VARIANTS } from '../../../common/email/templates';
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

class EventEmailLayoutDto {
  @ApiPropertyOptional({ enum: EMAIL_LAYOUT_VARIANTS })
  @IsOptional()
  @IsIn(EMAIL_LAYOUT_VARIANTS)
  variant?: (typeof EMAIL_LAYOUT_VARIANTS)[number];

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  tagline?: string;

  @ApiPropertyOptional({ example: '#0B2559' })
  @IsOptional()
  @Matches(HEX_COLOR)
  headerColor?: string;

  @ApiPropertyOptional({ example: '#0052A5' })
  @IsOptional()
  @Matches(HEX_COLOR)
  ctaColor?: string;

  @ApiPropertyOptional({ example: '#F5A000' })
  @IsOptional()
  @Matches(HEX_COLOR)
  accentColor?: string;

  @ApiPropertyOptional({ example: '#6524B8' })
  @IsOptional()
  @Matches(HEX_COLOR)
  secondaryColor?: string;

  @ApiPropertyOptional({ example: '#08A6D5' })
  @IsOptional()
  @Matches(HEX_COLOR)
  highlightColor?: string;

  @ApiPropertyOptional({ example: '#DCE5F2' })
  @IsOptional()
  @Matches(HEX_COLOR)
  borderColor?: string;

  @ApiPropertyOptional({ example: '#FFFFFF' })
  @IsOptional()
  @Matches(HEX_COLOR)
  surfaceColor?: string;

  @ApiPropertyOptional({ example: '#F4F7FA' })
  @IsOptional()
  @Matches(HEX_COLOR)
  detailsColor?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  organizer?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @Length(1, 80)
  contactPhone?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
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

  @ApiPropertyOptional({ type: EventEmailLayoutDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EventEmailLayoutDto)
  layout?: EventEmailLayoutDto;

  @ApiPropertyOptional({ description: 'Remove the uploaded logo' })
  @IsOptional()
  @IsBoolean()
  removeLogo?: boolean;
}
