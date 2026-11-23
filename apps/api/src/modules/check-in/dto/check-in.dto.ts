import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CheckInDto {
  @ApiPropertyOptional({ description: 'Opaque QR token scanned from the ticket' })
  @ValidateIf((object: CheckInDto) => !object.ticketCode)
  @IsString()
  @Length(1, 200)
  @Transform(trim)
  token?: string;

  @ApiPropertyOptional({ description: 'Human-readable ticket code for manual lookup' })
  @ValidateIf((object: CheckInDto) => !object.token)
  @IsString()
  @Length(3, 24)
  @Transform(trim)
  ticketCode?: string;

  @ApiPropertyOptional({ description: 'Check in outside the allowed time window' })
  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @ApiPropertyOptional({ description: 'Required when override is true' })
  @ValidateIf((object: CheckInDto) => object.override === true)
  @IsString()
  @Length(3, 255)
  @Transform(trim)
  overrideReason?: string;
}
