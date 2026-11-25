import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  return value.trim().length === 0 ? null : value.trim();
};

export class CreateEventDto {
  @ApiProperty({ example: 'Concierto de Verano 2027' })
  @IsString()
  @Length(2, 180)
  @Transform(trim)
  title: string;

  @ApiPropertyOptional({ description: 'Auto-generated from the title when omitted' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain lowercase letters, numbers and hyphens only',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  slug?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 10_000)
  @Transform(trim)
  description: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Teatro Municipal' })
  @IsOptional()
  @IsString()
  @Length(2, 180)
  @Transform(trimToNull)
  location?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Av. Colón 123, La Paz' })
  @IsOptional()
  @IsString()
  @Length(2, 255)
  @Transform(trimToNull)
  address?: string | null;

  @ApiPropertyOptional({ default: 'America/La_Paz' })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  timezone?: string;

  @ApiPropertyOptional({ default: 'BOB' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Overall venue capacity' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  capacity?: number | null;

  @ApiProperty({ example: '2027-03-15T20:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2027-03-15T23:00:00Z' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: '2027-01-10T00:00:00Z' })
  @IsDateString()
  registrationStart: string;

  @ApiProperty({ example: '2027-03-15T19:00:00Z' })
  @IsDateString()
  registrationEnd: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Require attendee name and email at checkout',
  })
  @IsOptional()
  @IsBoolean()
  requireAttendeeDetails?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;
}
