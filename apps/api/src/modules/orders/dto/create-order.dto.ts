import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const lowercaseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Empty attendee inputs are treated as omitted when the event allows it. */
const optionalTrim = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const optionalLowercaseEmail = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? undefined : trimmed;
};

export class AttendeeDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Required unless the event sets requireAttendeeDetails=false',
    example: 'María Pérez',
  })
  @IsOptional()
  @IsString()
  @Length(2, 150)
  @Transform(optionalTrim)
  fullName?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Required unless the event sets requireAttendeeDetails=false',
    example: 'maria@example.com',
  })
  @IsOptional()
  @IsEmail()
  @Length(5, 254)
  @Transform(optionalLowercaseEmail)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(5, 30)
  @Transform(trim)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 40)
  @Transform(trim)
  documentNumber?: string;
}

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ticketTypeId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;

  @ApiProperty({ type: [AttendeeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees: AttendeeDto[];
}

export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventId: string;

  @ApiPropertyOptional({ description: 'Echoed from the Idempotency-Key header when omitted' })
  @IsOptional()
  @IsString()
  @Length(8, 100)
  idempotencyKey?: string;

  @ApiProperty({ example: 'Juan Carlos Rodríguez' })
  @IsString()
  @Length(2, 150)
  @Transform(trim)
  buyerName: string;

  @ApiProperty({ example: 'juan@example.com' })
  @IsEmail()
  @Length(5, 254)
  @Transform(lowercaseEmail)
  buyerEmail: string;

  @ApiProperty({ example: '+591 70000000' })
  @IsString()
  @Length(5, 30)
  @Transform(trim)
  buyerPhone: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
