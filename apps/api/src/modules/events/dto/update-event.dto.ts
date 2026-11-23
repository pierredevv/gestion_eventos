import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Matches,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 180)
  @Transform(trim)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must contain lowercase letters, numbers and hyphens only',
  })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 10_000)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 180)
  @Transform(trim)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 255)
  @Transform(trim)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 64)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  capacity?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  registrationEnd?: string;
}
