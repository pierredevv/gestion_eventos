import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class TicketLinkDto {
  @ApiProperty({ description: 'Ticket or order access link token' })
  @IsString()
  @Length(1, 200)
  token: string;
}
