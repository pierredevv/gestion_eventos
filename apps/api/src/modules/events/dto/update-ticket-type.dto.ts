import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateTicketTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  @Transform(trim)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  minPerOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPerOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' || value instanceof Date ? new Date(value) : value,
  )
  salesStart?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' || value instanceof Date ? new Date(value) : value,
  )
  salesEnd?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
