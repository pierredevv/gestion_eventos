import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SubmitPaymentDto {
  @ApiProperty({ example: 301.0, description: 'Amount shown on the bank receipt' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  declaredAmount: number;

  @ApiPropertyOptional({ example: 'TXN-20270101-12345' })
  @IsOptional()
  @IsString()
  @Length(4, 120)
  @Transform(trim)
  paymentReference?: string;
}
