import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateTicketTypeDto {
  @ApiProperty({ example: 'Entrada General' })
  @IsString()
  @Length(2, 120)
  @Transform(trim)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  @Transform(trim)
  description?: string;

  @ApiProperty({ example: 150.5, description: 'Non-negative amount, max two decimals' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional({ default: 'BOB' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency?: string;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  capacity: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  minPerOrder?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPerOrder?: number;

  @ApiProperty({ example: '2027-01-10T00:00:00Z' })
  @IsDate()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' || value instanceof Date ? new Date(value) : value,
  )
  salesStart: Date;

  @ApiProperty({ example: '2027-03-15T19:00:00Z' })
  @IsDate()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' || value instanceof Date ? new Date(value) : value,
  )
  salesEnd: Date;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
